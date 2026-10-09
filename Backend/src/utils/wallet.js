const { prisma } = require("../db");
const { creditBalance, reservedCredit } = require("./referrals");
const { notifyCreditAdded } = require("./walletNotices");

// The student wallet.
//
// There is no separate balance: the wallet IS the CreditEntry ledger that
// referral rewards already use (utils/referrals.js) — append-only, in paise,
// balance = the sum. Credit comes from referral rewards and from the admin
// (grantCredit below); it is spent automatically as a discount at checkout, or
// in full via POST /payments/pay-with-wallet when it covers the whole price.
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
    default:
      return entry.note || (entry.amount < 0 ? "Adjustment" : "Credit from Crix");
  }
}

// The wallet as the owner sees it: balance, what's spendable, and recent history.
async function getWallet(userId, limit = 50) {
  const [{ balance, reserved, available }, entries, earned, spent] = await Promise.all([
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
    entries: entries.map((e) => ({
      id: e.id,
      amount: e.amount / 100,
      kind: e.kind,
      label: describeEntry(e, e.paymentId && titleByPayment.get(e.paymentId)),
      createdAt: e.createdAt,
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
  getWallet,
  adjustCredit,
};
