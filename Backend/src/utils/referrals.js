const crypto = require("crypto");
const { prisma } = require("../db");

// Referral programme.
//
//   - Every student has a referral code they can share.
//   - A new student who applies a code (at signup, or at checkout before they
//     have bought anything) gets a % off their FIRST purchase.
//   - The referrer earns credit — added to their account when the friend's first
//     course/internship payment actually goes through — which is applied
//     automatically against their own next purchase.
//
// All money in this file is in PAISE, like Payment.amount, unless a name says
// "Rupees". The rules (on/off, discount %, reward) are admin-editable settings.

const SETTINGS_KEY = "referral";
const DEFAULT_SETTINGS = { enabled: true, refereeDiscountPercent: 10, referrerCreditRupees: 500 };

// Razorpay can't create an order for less than ₹1, so referral credit never
// takes an order below this — the buyer always pays at least ₹1.
const MIN_CHARGE_PAISE = 100;

// Credit reserved by an order that was started but not yet paid counts as
// spoken-for for this long, so two open checkout tabs can't spend the same credit.
const RESERVATION_WINDOW_MS = 30 * 60 * 1000;

async function getSettings() {
  const row = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  return { ...DEFAULT_SETTINGS, ...((row && row.value) || {}) };
}

// Validates and stores the admin's edits. Returns { ok, settings } or { ok:false, error }.
async function saveSettings(input) {
  const body = input || {};
  const current = await getSettings();
  const next = { ...current };

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return { ok: false, error: "enabled must be true or false" };
    next.enabled = body.enabled;
  }
  if (body.refereeDiscountPercent !== undefined) {
    const n = Number(body.refereeDiscountPercent);
    if (!Number.isInteger(n) || n < 0 || n > 90) return { ok: false, error: "The friend's discount must be a whole number from 0 to 90 percent" };
    next.refereeDiscountPercent = n;
  }
  if (body.referrerCreditRupees !== undefined) {
    const n = Number(body.referrerCreditRupees);
    if (!Number.isInteger(n) || n < 0 || n > 100000) return { ok: false, error: "The referrer's credit must be a whole number of rupees from 0 to 100000" };
    next.referrerCreditRupees = n;
  }
  await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next },
    update: { value: next },
  });
  return { ok: true, settings: next };
}

// ---------- codes ----------
// No 0/O/1/I/L so a code read out over the phone or typed from a screenshot
// isn't ambiguous.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_PREFIX = "CRIX";
const CODE_LENGTH = 6;

function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = CODE_PREFIX;
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// What people type is forgiving: any case, with or without the dash or spaces.
function normalizeCode(input) {
  return String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// CRIXK7P3QZ -> CRIX-K7P3QZ, for display.
function formatCode(code) {
  return code && code.startsWith(CODE_PREFIX) ? `${CODE_PREFIX}-${code.slice(CODE_PREFIX.length)}` : code || "";
}

// A student's code is created the first time it's needed (existing accounts
// have none) and never changes after that.
async function ensureReferralCode(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (!user) return null;
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { referralCode: generateCode() }, select: { referralCode: true } });
      return updated.referralCode;
    } catch (e) {
      if (e && e.code === "P2002") {
        // Either that code was taken, or a parallel request just gave this
        // student one — whichever it was, read back what's there now.
        const again = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
        if (again && again.referralCode) return again.referralCode;
        continue;
      }
      throw e;
    }
  }
  throw new Error("Could not allocate a referral code");
}

// Just "is this a code someone can use", for the field's live feedback. Doesn't
// say whose it is.
async function checkCode(rawCode) {
  const settings = await getSettings();
  if (!settings.enabled) return { valid: false, error: "Referral codes aren't being accepted right now." };
  const code = normalizeCode(rawCode);
  if (!code) return { valid: false, error: "Enter a referral code." };
  const referrer = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
  if (!referrer) return { valid: false, error: "That referral code isn't valid." };
  return { valid: true, discountPercent: settings.refereeDiscountPercent };
}

// Attaches `userId` to the referrer who owns `rawCode`, recording the discount
// and reward promised at this moment. One referrer per student, ever; not
// yourself; and only before your first purchase — it's a welcome offer.
// Returns { ok: true, referral } or { ok: false, error }.
async function applyReferralCode(userId, rawCode) {
  const settings = await getSettings();
  if (!settings.enabled) return { ok: false, error: "Referral codes aren't being accepted right now." };
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: "Enter a referral code." };

  const referrer = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
  if (!referrer) return { ok: false, error: "That referral code isn't valid." };
  if (referrer.id === userId) return { ok: false, error: "You can't use your own referral code." };

  const existing = await prisma.referral.findUnique({ where: { refereeId: userId } });
  if (existing) return { ok: false, error: "You've already used a referral code." };

  const hasCourse = await prisma.enrollment.count({ where: { userId } });
  if (hasCourse > 0) return { ok: false, error: "Referral codes are for new students — you already have a course." };

  // An approved campus ambassador is paid a cash commission on what their friend
  // pays (utils/ambassadors.js) instead of earning credit, so the referral is
  // tagged with the ambassador and the commission % promised right now.
  const ambassadorUtils = require("./ambassadors"); // required here, not at the top: it requires this file
  const ambassador = await prisma.ambassador.findUnique({ where: { userId: referrer.id } });
  const asAmbassador = !!ambassador && ambassador.status === "approved";
  const commissionPercent = asAmbassador ? ambassadorUtils.effectivePercent(ambassador, await ambassadorUtils.getSettings()) : 0;

  try {
    const referral = await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        refereeId: userId,
        refereeDiscountPercent: settings.refereeDiscountPercent,
        rewardAmount: asAmbassador ? 0 : settings.referrerCreditRupees * 100,
        ambassadorId: asAmbassador ? ambassador.id : null,
        commissionPercent,
      },
    });
    return { ok: true, referral };
  } catch (e) {
    if (e && e.code === "P2002") return { ok: false, error: "You've already used a referral code." };
    throw e;
  }
}

// ---------- credit ----------
async function creditBalance(userId) {
  const sum = await prisma.creditEntry.aggregate({ where: { userId }, _sum: { amount: true } });
  return sum._sum.amount || 0;
}

// Credit tied up by this student's unpaid, recently-started orders.
async function reservedCredit(userId) {
  const since = new Date(Date.now() - RESERVATION_WINDOW_MS);
  const sum = await prisma.payment.aggregate({
    where: { status: "created", createdAt: { gte: since }, application: { userId } },
    _sum: { creditApplied: true },
  });
  return sum._sum.creditApplied || 0;
}

// ---------- pricing ----------
// Turns a plan's price into what the buyer actually pays: the friend's welcome
// discount first (only while their referral is still pending, i.e. before their
// first purchase), then any referral credit they hold, never going below the
// ₹1 minimum. `planRupees` is the plan's already-discounted whole-rupee price.
async function priceOrder(userId, planRupees) {
  const planPaise = planRupees * 100;
  let referralPercent = 0;
  let referralDiscount = 0;
  let availableCredit = 0;

  if (userId) {
    const referral = await prisma.referral.findUnique({ where: { refereeId: userId } });
    if (referral && referral.status === "pending" && referral.refereeDiscountPercent > 0) {
      referralPercent = referral.refereeDiscountPercent;
      referralDiscount = Math.round((planRupees * referralPercent) / 100) * 100;
    }
    const [balance, reserved] = await Promise.all([creditBalance(userId), reservedCredit(userId)]);
    availableCredit = Math.max(0, balance - reserved);
  }

  const afterReferral = planPaise - referralDiscount;
  const usable = Math.max(0, afterReferral - MIN_CHARGE_PAISE);
  // Whole rupees only, so the order total stays a whole-rupee amount.
  const creditApplied = Math.floor(Math.min(availableCredit, usable) / 100) * 100;

  return {
    planPaise,
    referralPercent,
    referralDiscount,
    availableCredit,
    creditApplied,
    payablePaise: afterReferral - creditApplied,
  };
}

// ---------- rewards (called when a purchase is confirmed) ----------
// Both are idempotent: /verify and the Razorpay webhook can each confirm the
// same payment, and only the first to get here changes anything.

// The friend's first purchase went through: mark their referral rewarded and
// credit the referrer. The status flip is a compare-and-swap (only the caller
// that actually moves pending -> rewarded goes on to add the credit).
async function rewardReferrerForPurchase(payment, application) {
  if (!application || !application.userId) return null;
  const referral = await prisma.referral.findUnique({ where: { refereeId: application.userId } });
  if (!referral || referral.status !== "pending") return null;

  const won = await prisma.referral.updateMany({
    where: { id: referral.id, status: "pending" },
    data: { status: "rewarded", qualifyingPaymentId: payment.id, rewardedAt: new Date() },
  });
  if (won.count !== 1) return null;

  // An ambassador's friend: the reward is a commission (held, then payable), not credit.
  if (referral.ambassadorId) {
    await require("./ambassadors").recordEarning(referral, payment);
    return referral;
  }

  if (referral.rewardAmount > 0) {
    try {
      await prisma.creditEntry.create({
        data: {
          userId: referral.referrerId,
          amount: referral.rewardAmount,
          kind: "referral_reward",
          referralId: referral.id,
          note: "A friend you referred made their first purchase",
        },
      });
    } catch (e) {
      if (!(e && e.code === "P2002")) throw e;
    }
  }
  return referral;
}

// Spend the credit an order was priced with, now that it's been paid.
async function redeemCreditForPurchase(payment, application) {
  if (!application || !application.userId || !payment.creditApplied) return;
  try {
    await prisma.creditEntry.create({
      data: {
        userId: application.userId,
        amount: -payment.creditApplied,
        kind: "redeemed",
        paymentId: payment.id,
        note: "Applied to a purchase",
      },
    });
  } catch (e) {
    if (!(e && e.code === "P2002")) throw e;
  }
}

module.exports = {
  MIN_CHARGE_PAISE,
  getSettings,
  saveSettings,
  normalizeCode,
  formatCode,
  ensureReferralCode,
  checkCode,
  applyReferralCode,
  creditBalance,
  priceOrder,
  rewardReferrerForPurchase,
  redeemCreditForPurchase,
};
