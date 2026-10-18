const { prisma } = require("../db");
const { creditBalance, reservedCredit } = require("./referrals");
const { notifyCreditAdded } = require("./walletNotices");
const { getCareerSettings, creditExpiryDate } = require("./careerSettings");
const { addNotification, sendCareerEmail } = require("./notifications");

// The student wallet.
//
// There is no separate balance: the wallet IS the CreditEntry ledger that
// referral rewards already use (utils/referrals.js) — append-only, in paise,
// balance = the sum. Credit comes from referral rewards, from the admin
// (adjustCredit below), from the signup bonus (grantSignupBonus) and from the
// aptitude-test fee coming back as credit (utils/careers.js); it is spent
// automatically as a discount at checkout, or in full via POST
// /payments/pay-with-wallet when it covers the whole price. 1 credit = ₹1: it
// only ever pays for purchases on the site — there is no withdrawal or transfer.
//
// Signup-bonus and test-fee credit carry an expiresAt; whatever is left of them
// after that is taken back by an `expired` entry (expireCredits below).
//
// Anything that spends or removes credit takes a lock on the user's row first
// (lockUser), so two requests for the same student can't both see the same
// balance and spend it twice.

// A payment settled entirely from the wallet has no Razorpay order: its
// razorpayOrderId (required by the schema) and razorpayPaymentId carry this
// prefix instead. /payments/verify needs a signature made with the Razorpay
// secret, so a wallet payment can't be reached through it.
const WALLET_ORDER_PREFIX = "wallet_";
const isWalletPayment = (payment) => !!payment && String(payment.razorpayOrderId || "").startsWith(WALLET_ORDER_PREFIX);

// One admin grant or deduction, in whole rupees.
const MAX_ADJUSTMENT_RUPEES = 100000;
const MAX_NOTE_LENGTH = 200;

// Serialises concurrent wallet changes for one student. Must run inside a
// transaction (the lock is held until it ends).
async function lockUser(tx, userId) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}

// What the student can spend right now: the ledger sum, less credit tied up by
// unpaid checkouts they've started (see reservedCredit).
async function availableBalance(userId, db = prisma) {
  const [balance, reserved] = await Promise.all([creditBalance(userId, db), reservedCredit(userId, db)]);
  return { balance, reserved, available: Math.max(0, balance - reserved) };
}

function describeEntry(entry, itemTitle) {
  switch (entry.kind) {
    case "referral_reward":
      return "Referral reward";
    case "redeemed":
      return itemTitle ? `Spent on ${itemTitle}` : "Spent on a purchase";
    case "signup_bonus":
      return "Signup bonus";
    case "test_fee_credit":
      return "Aptitude test fee returned as credit";
    case "expired":
      return "Credit expired";
    default:
      return entry.note || (entry.amount < 0 ? "Adjustment" : "Credit from Crix");
  }
}

// The transaction type shown beside each wallet entry.
const TYPE_LABELS = {
  signup_bonus: "Signup Bonus",
  test_fee_credit: "Test Payment Credit",
  redeemed: "Purchase",
  expired: "Expiry",
  adjustment: "Admin Adjustment",
  referral_reward: "Referral Reward",
};

// ---------- expiry ----------
// How much credit has lapsed and not yet been taken back, in paise. Pure: works
// only from the ledger rows it is given.
//
// Each positive entry is a "lot". Spending uses the lot that expires soonest
// first (credit with no expiry last), and only lots that were still valid at the
// moment of the spend. Whatever is left in a lot once its expiresAt has passed
// has lapsed; earlier `expired` entries are counted against that, so running
// this again after writing one returns 0.
function lapsedCredit(entries, now = new Date()) {
  const at = (d) => new Date(d).getTime();
  const lots = entries
    .filter((e) => e.amount > 0)
    .map((e) => ({ left: e.amount, createdAt: at(e.createdAt), expiresAt: e.expiresAt ? at(e.expiresAt) : null }));
  const soonestFirst = (a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity) || a.createdAt - b.createdAt;
  const take = (from, amount) => {
    let need = amount;
    for (const lot of from.sort(soonestFirst)) {
      if (need <= 0) break;
      const used = Math.min(lot.left, need);
      lot.left -= used;
      need -= used;
    }
    return need;
  };

  const debits = entries.filter((e) => e.amount < 0).sort((a, b) => at(a.createdAt) - at(b.createdAt));
  for (const d of debits) {
    const when = at(d.createdAt);
    const existed = lots.filter((l) => l.createdAt <= when);
    const need = d.kind === "expired"
      ? take(existed.filter((l) => l.expiresAt !== null && l.expiresAt <= when), -d.amount)
      : take(existed.filter((l) => l.expiresAt === null || l.expiresAt > when), -d.amount);
    // Shouldn't happen (a spend can't exceed what was valid), but never lose track of it.
    if (need > 0) take(lots, need);
  }
  const nowMs = at(now);
  return lots.reduce((sum, l) => sum + (l.expiresAt !== null && l.expiresAt <= nowMs ? l.left : 0), 0);
}

// Takes back any of this student's credit that has passed its expiry, as one
// `expired` ledger entry. Cheap when nothing is due, and it only takes the
// user's lock when something really has lapsed. Call it before reading a
// balance that matters — NOT from inside a transaction that already holds the
// user's row lock (it takes that lock itself).
async function expireCredits(userId) {
  if (!userId) return 0;
  const now = new Date();
  // A run writes off everything lapsed up to that moment, so only credit that
  // expired after the last write-off can be due.
  const lastRun = await prisma.creditEntry.findFirst({ where: { userId, kind: "expired" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const due = await prisma.creditEntry.count({
    where: { userId, amount: { gt: 0 }, expiresAt: { lte: now, ...(lastRun ? { gt: lastRun.createdAt } : {}) } },
  });
  if (!due) return 0;
  // Credit that lapsed after being spent in full leaves nothing to take back: check without the lock first.
  if (lapsedCredit(await prisma.creditEntry.findMany({ where: { userId } }), now) <= 0) return 0;
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const entries = await tx.creditEntry.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const now = new Date();
    const lapsed = lapsedCredit(entries, now);
    if (lapsed <= 0) return 0;
    await tx.creditEntry.create({ data: { userId, amount: -lapsed, kind: "expired", note: "Credit expired", createdAt: now } });
    return lapsed;
  });
}

// ---------- signup bonus ----------
// The welcome credit a new student account starts with. The entry's id is
// derived from the user's, so however many times this runs for one account
// (a retried request, two sign-ins racing) it is credited once.
// Returns the rupees credited, or 0.
async function grantSignupBonus(user) {
  if (!user || user.role !== "student") return 0;
  const settings = await getCareerSettings();
  const rupees = settings.signupBonusCredits;
  if (!(rupees > 0)) return 0;
  try {
    await prisma.creditEntry.create({
      data: {
        id: `signup_${user.id}`,
        userId: user.id,
        amount: rupees * 100,
        kind: "signup_bonus",
        note: "Welcome bonus for signing up",
        expiresAt: creditExpiryDate(settings.creditExpiryMonths),
      },
    });
  } catch (e) {
    if (e && e.code === "P2002") return 0;
    throw e;
  }
  sendCareerEmail("sendSignupBonusEmail", { to: user.email, name: user.name, credits: rupees, expiryMonths: settings.creditExpiryMonths });
  await addNotification(user.id, {
    title: `${rupees} bonus credits added`,
    body: `Welcome to Crix Technology! ${rupees} credits (1 credit = ₹1) are in your wallet, ready to use on any course or internship.`,
    link: "/dashboard?tab=wallet",
  });
  return rupees;
}

// An email/password signup can't prove the address is real, so its welcome
// credit is held (User.signupBonusPending) until the student enters the code
// we email them — otherwise a script could sign up with made-up addresses and
// collect the bonus over and over. Google sign-ups are verified by Google and
// get the bonus straight away (grantSignupBonus). Returns true when held.
async function holdSignupBonus(user) {
  if (!user || user.role !== "student") return false;
  const settings = await getCareerSettings();
  if (!(settings.signupBonusCredits > 0)) return false;
  await prisma.user.update({ where: { id: user.id }, data: { signupBonusPending: true } });
  return true;
}

// Releases a held bonus once the email is proven. Returns the rupees credited, or 0.
// The credit is written BEFORE the flag is cleared: if writing it fails, the bonus
// is still waiting and the student can simply try again. Two racing claims credit
// it once — the entry's fixed id (grantSignupBonus) lets only one of them in.
async function claimSignupBonus(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.signupBonusPending) return 0;
  const credited = await grantSignupBonus(user);
  await prisma.user.updateMany({ where: { id: userId, signupBonusPending: true }, data: { signupBonusPending: false } });
  return credited;
}

// The wallet as the owner sees it: balance, what's spendable, and recent history.
async function getWallet(userId, limit = 50) {
  await expireCredits(userId);
  const [owner, settings, { balance, reserved, available }, entries, earned, spent] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { signupBonusPending: true } }),
    getCareerSettings(),
    availableBalance(userId),
    prisma.creditEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit }),
    // Everything ever added (rewards and admin credit) and everything spent on purchases.
    prisma.creditEntry.aggregate({ where: { userId, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.creditEntry.aggregate({ where: { userId, kind: "redeemed" }, _sum: { amount: true } }),
  ]);

  // Name the course a "spent" entry paid for.
  const paymentIds = entries.map((e) => e.paymentId).filter(Boolean);
  const payments = paymentIds.length
    ? await prisma.payment.findMany({
        where: { id: { in: paymentIds } },
        select: { id: true, application: { select: { refTitle: true } } },
      })
    : [];
  const titleByPayment = new Map(payments.map((p) => [p.id, p.application && p.application.refTitle]));

  return {
    balance: balance / 100,
    reserved: reserved / 100,
    available: available / 100,
    earned: (earned._sum.amount || 0) / 100,
    spent: Math.abs(spent._sum.amount || 0) / 100,
    // The most of one purchase that credit may pay for (admin setting).
    usagePercent: settings.creditUsagePercent,
    // Welcome credit waiting for the student to verify their email (0 = none).
    pendingBonus: owner && owner.signupBonusPending ? settings.signupBonusCredits : 0,
    entries: entries.map((e) => ({
      id: e.id,
      amount: e.amount / 100,
      kind: e.kind,
      type: TYPE_LABELS[e.kind] || "Credit",
      label: describeEntry(e, e.paymentId && titleByPayment.get(e.paymentId)),
      createdAt: e.createdAt,
      expiresAt: e.amount > 0 ? e.expiresAt : null,
    })),
  };
}

// Admin adds (positive) or removes (negative) whole rupees of credit. A removal
// can't take more than the student can currently spend. Returns
// { ok: true, balance } (rupees) or { ok: false, status, error }.
async function adjustCredit({ userId, rupees, note, adminId }) {
  const n = Number(rupees);
  if (!Number.isInteger(n) || n === 0) return { ok: false, status: 400, error: "Enter a whole number of rupees (use a minus sign to take credit away)." };
  if (Math.abs(n) > MAX_ADJUSTMENT_RUPEES) return { ok: false, status: 400, error: `One change can be at most ₹${MAX_ADJUSTMENT_RUPEES.toLocaleString("en-IN")}.` };
  if (note !== undefined && typeof note !== "string") return { ok: false, status: 400, error: "The note must be text." };
  const cleanNote = String(note || "").trim().slice(0, MAX_NOTE_LENGTH);

  const result = await prisma.$transaction(async (tx) => {
    // Lock BEFORE reading anything: the transaction's snapshot is fixed by its
    // first plain read, and a snapshot taken before the lock was won couldn't
    // see what the request we waited for just committed.
    await lockUser(tx, userId);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
    if (!user) return { ok: false, status: 404, error: "User not found" };

    if (n < 0) {
      const { available } = await availableBalance(userId, tx);
      if (-n * 100 > available) {
        return { ok: false, status: 400, error: `They only have ₹${(available / 100).toLocaleString("en-IN")} that can be taken away right now.` };
      }
    }
    await tx.creditEntry.create({
      data: { userId, amount: n * 100, kind: "adjustment", note: cleanNote || (n > 0 ? "Credit from Crix" : "Adjustment by Crix") },
    });
    console.log(`[admin] ${adminId} ${n > 0 ? "added" : "removed"} ₹${Math.abs(n)} ${n > 0 ? "to" : "from"} the wallet of user ${userId}`);
    return { ok: true, balance: (await creditBalance(userId, tx)) / 100, user };
  });

  // Tell the student, but only about credit they gained — and only now that it is saved.
  if (result.ok && n > 0) {
    notifyCreditAdded({ user: result.user, rupees: n, balanceRupees: result.balance, reason: "admin", note: cleanNote });
  }
  return result;
}

module.exports = {
  WALLET_ORDER_PREFIX,
  MAX_ADJUSTMENT_RUPEES,
  isWalletPayment,
  lockUser,
  availableBalance,
  lapsedCredit,
  expireCredits,
  grantSignupBonus,
  holdSignupBonus,
  claimSignupBonus,
  getWallet,
  adjustCredit,
};
