const { prisma } = require("../db");
const { getCareerSettings } = require("./careerSettings");

// What a buyer pays, and the wallet credit that goes into it: a plan's price
// less the student's wallet credit (utils/wallet.js), never below the ₹1 minimum.
// All money here is in PAISE, like Payment.amount, unless a name says "Rupees".
//
// The referral programme and admin offer codes that used to come off here were
// retired. Their database tables, old `referral_reward` wallet entries and the
// discount columns on old payments are kept as history.

// Razorpay can't create an order for less than ₹1, so wallet credit never
// takes an order below this — the buyer always pays at least ₹1.
const MIN_CHARGE_PAISE = 100;

// Credit reserved by an order that was started but not yet paid counts as
// spoken-for for this long, so two open checkout tabs can't spend the same credit.
const RESERVATION_WINDOW_MS = 30 * 60 * 1000;

// ---------- credit ----------
// `db` is the Prisma client to read through — pass a transaction client to read
// inside a transaction (the wallet's pay-in-full path does, under a row lock).
async function creditBalance(userId, db = prisma) {
  const sum = await db.creditEntry.aggregate({ where: { userId }, _sum: { amount: true } });
  return sum._sum.amount || 0;
}

// Credit tied up by this student's unpaid, recently-started orders.
async function reservedCredit(userId, db = prisma) {
  const since = new Date(Date.now() - RESERVATION_WINDOW_MS);
  const sum = await db.payment.aggregate({
    // Normal checkouts tie the student through their Application; a payment
    // request's payment (routes/paymentRequests.js) carries userId itself.
    where: { status: "created", createdAt: { gte: since }, OR: [{ application: { userId } }, { userId }] },
    _sum: { creditApplied: true },
  });
  return sum._sum.creditApplied || 0;
}

// ---------- pricing ----------
// Turns a plan's price into what the buyer actually pays. `planRupees` is the
// plan's already-discounted whole-rupee price.
async function priceOrder(userId, planRupees, db = prisma) {
  const planPaise = planRupees * 100;
  let availableCredit = 0;

  if (userId) {
    const [balance, reserved] = await Promise.all([creditBalance(userId, db), reservedCredit(userId, db)]);
    availableCredit = Math.max(0, balance - reserved);
  }

  // The admin can cap how much of one purchase wallet credit may pay for
  // (utils/careerSettings.js creditUsagePercent; 100 = no cap, the default).
  const { creditUsagePercent } = await getCareerSettings(db);
  const usageCap = Math.floor((planPaise * creditUsagePercent) / 100);
  const usable = Math.max(0, Math.min(planPaise - MIN_CHARGE_PAISE, usageCap));
  // Whole rupees only, so the order total stays a whole-rupee amount.
  const creditApplied = Math.floor(Math.min(availableCredit, usable) / 100) * 100;

  return {
    planPaise,
    availableCredit,
    creditApplied,
    payablePaise: planPaise - creditApplied,
    // What the order costs before any wallet credit, and whether the wallet
    // alone can cover all of it (paid for without Razorpay — routes/payments.js).
    totalDuePaise: planPaise,
    walletCoversAll: creditUsagePercent >= 100 && planPaise > 0 && availableCredit >= planPaise,
  };
}

// Spend the credit an order was priced with, now that it's been paid.
// Idempotent: /verify and the Razorpay webhook can each confirm the same payment.
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
  creditBalance,
  reservedCredit,
  priceOrder,
  redeemCreditForPurchase,
};
