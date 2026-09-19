const express = require("express");
const { prisma } = require("../db");
const { requireAuth } = require("../middleware/requireAuth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { publicWriteLimiter } = require("../utils/rateLimit");
const {
  getSettings, saveSettings, ensureReferralCode, formatCode, checkCode, applyReferralCode, creditBalance,
} = require("../utils/referrals");

const router = express.Router();

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "A friend";

// ---------- public: is this code usable? (live feedback for the code field) ----------
// Deliberately says nothing about whose code it is.
router.get("/referrals/check", publicWriteLimiter, async (req, res, next) => {
  try {
    const result = await checkCode(req.query.code);
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

// ---------- student: my code, my friends, my credit ----------
router.get("/me/referral", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const [code, settings, balance, made, referredBy, enrolled, earned] = await Promise.all([
      ensureReferralCode(userId),
      getSettings(),
      creditBalance(userId),
      prisma.referral.findMany({
        where: { referrerId: userId },
        include: { referee: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.referral.findUnique({ where: { refereeId: userId } }),
      prisma.enrollment.count({ where: { userId } }),
      prisma.creditEntry.aggregate({ where: { userId, kind: "referral_reward" }, _sum: { amount: true } }),
    ]);
    if (!code) return res.status(404).json({ ok: false, error: "Account not found" });

    res.json({
      ok: true,
      code,
      displayCode: formatCode(code),
      settings: {
        enabled: settings.enabled,
        refereeDiscountPercent: settings.refereeDiscountPercent,
        referrerCreditRupees: settings.referrerCreditRupees,
      },
      creditBalance: balance / 100,
      stats: {
        total: made.length,
        pending: made.filter((r) => r.status === "pending").length,
        rewarded: made.filter((r) => r.status === "rewarded").length,
        earned: (earned._sum.amount || 0) / 100,
      },
      // First names only — a referrer sees that a friend joined and whether it
      // paid off, not their contact details.
      referrals: made.map((r) => ({
        name: firstName(r.referee.name),
        status: r.status,
        joinedAt: r.createdAt,
        rewardedAt: r.rewardedAt,
        reward: r.rewardAmount / 100,
      })),
      referredBy: referredBy ? { status: referredBy.status, discountPercent: referredBy.refereeDiscountPercent } : null,
      // The welcome offer is for a new student who hasn't been referred yet and
      // hasn't bought anything.
      canApplyCode: settings.enabled && !referredBy && enrolled === 0,
    });
  } catch (e) {
    next(e);
  }
});

// ---------- student: use a friend's code (before their first purchase) ----------
router.post("/referrals/apply", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    const result = await applyReferralCode(req.user.sub, (req.body || {}).code);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    res.status(201).json({ ok: true, discountPercent: result.referral.refereeDiscountPercent });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: the rules ----------
router.get("/admin/referral-settings", requireAdmin, async (req, res, next) => {
  try {
    res.json({ ok: true, settings: await getSettings() });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/referral-settings", requireAdmin, async (req, res, next) => {
  try {
    const result = await saveSettings(req.body);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true, settings: result.settings });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: every referral ----------
router.get("/admin/referrals", requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const where = q
      ? {
          OR: [
            { referrer: { OR: [{ name: { contains: q } }, { email: { contains: q } }] } },
            { referee: { OR: [{ name: { contains: q } }, { email: { contains: q } }] } },
          ],
        }
      : {};
    if (req.query.status === "pending" || req.query.status === "rewarded") where.status = req.query.status;

    const [referrals, issued, redeemed, totals] = await Promise.all([
      prisma.referral.findMany({
        where,
        include: {
          referrer: { select: { id: true, name: true, email: true } },
          referee: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.creditEntry.aggregate({ where: { kind: "referral_reward" }, _sum: { amount: true } }),
      prisma.creditEntry.aggregate({ where: { kind: "redeemed" }, _sum: { amount: true } }),
      prisma.referral.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    // What the friend paid on the purchase that earned the reward.
    const paymentIds = referrals.map((r) => r.qualifyingPaymentId).filter(Boolean);
    const payments = paymentIds.length
      ? await prisma.payment.findMany({ where: { id: { in: paymentIds } }, select: { id: true, amount: true } })
      : [];
    const paidById = new Map(payments.map((p) => [p.id, p.amount / 100]));

    const count = (status) => (totals.find((t) => t.status === status) || { _count: { _all: 0 } })._count._all;
    const issuedRupees = (issued._sum.amount || 0) / 100;
    const redeemedRupees = Math.abs(redeemed._sum.amount || 0) / 100;

    res.json({
      ok: true,
      summary: {
        total: count("pending") + count("rewarded"),
        pending: count("pending"),
        rewarded: count("rewarded"),
        creditIssued: issuedRupees,
        creditRedeemed: redeemedRupees,
        creditOutstanding: issuedRupees - redeemedRupees,
      },
      referrals: referrals.map((r) => ({
        _id: r.id,
        status: r.status,
        referrer: { _id: r.referrer.id, name: r.referrer.name, email: r.referrer.email },
        referee: { _id: r.referee.id, name: r.referee.name, email: r.referee.email },
        refereeDiscountPercent: r.refereeDiscountPercent,
        reward: r.rewardAmount / 100,
        friendPaid: r.qualifyingPaymentId ? paidById.get(r.qualifyingPaymentId) ?? null : null,
        createdAt: r.createdAt,
        rewardedAt: r.rewardedAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
