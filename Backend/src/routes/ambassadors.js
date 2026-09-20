const express = require("express");
const { prisma } = require("../db");
const { requireAuth } = require("../middleware/requireAuth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { publicWriteLimiter } = require("../utils/rateLimit");
const { ensureReferralCode, formatCode, getSettings: getReferralSettings } = require("../utils/referrals");
const A = require("../utils/ambassadors");

const { queryText } = require("../utils/validators");
const router = express.Router();

const rupees = (paise) => (paise || 0) / 100;
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "A student";
const KIT_STATUSES = ["not_sent", "preparing", "shipped", "delivered"];

// What a student is told about the programme (also shown to people who haven't applied).
async function programInfo() {
  const [settings, referral] = await Promise.all([A.getSettings(), getReferralSettings()]);
  return {
    enabled: settings.enabled,
    commissionPercent: settings.defaultCommissionPercent,
    holdDays: settings.holdDays,
    minPayoutRupees: settings.minPayoutRupees,
    perks: settings.perks,
    friendDiscountPercent: referral.refereeDiscountPercent,
  };
}

function summaryInRupees(s) {
  return {
    referred: s.referred,
    paidCount: s.paidCount,
    total: rupees(s.total),
    onHold: rupees(s.onHold),
    available: rupees(s.available),
    requested: rupees(s.requested),
    paid: rupees(s.paid),
  };
}

// ---------- public: what the programme offers ----------
router.get("/ambassador/program", async (req, res, next) => {
  try {
    res.json({ ok: true, program: await programInfo() });
  } catch (e) {
    next(e);
  }
});

// ---------- student: my application / my ambassador dashboard ----------
router.get("/me/ambassador", requireAuth, async (req, res, next) => {
  try {
    const [program, amb, owner] = await Promise.all([
      programInfo(),
      prisma.ambassador.findUnique({ where: { userId: req.user.sub } }),
      prisma.user.findUnique({ where: { id: req.user.sub }, select: { name: true } }),
    ]);
    if (!amb) return res.json({ ok: true, status: null, program });

    const base = {
      ok: true,
      status: amb.status,
      userName: owner ? owner.name : "",
      program,
      application: {
        college: amb.college, city: amb.city, yearOfStudy: amb.yearOfStudy, branch: amb.branch,
        socialHandle: amb.socialHandle, motivation: amb.motivation, appliedAt: amb.appliedAt,
      },
    };
    // Applied / rejected / suspended: just the status — the dashboard is for approved ambassadors.
    if (amb.status !== "approved") return res.json(base);

    const settings = await A.getSettings();
    const [code, summary, earnings, payouts] = await Promise.all([
      ensureReferralCode(req.user.sub),
      A.earningsSummary(amb.id),
      prisma.ambassadorEarning.findMany({
        where: { ambassadorId: amb.id, void: false },
        include: { referral: { include: { referee: { select: { name: true } } } }, payout: { select: { status: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.ambassadorPayout.findMany({ where: { ambassadorId: amb.id }, orderBy: { requestedAt: "desc" }, take: 30 }),
    ]);
    const now = new Date();
    const hasPayoutMethod = !!A.payoutDestination(amb);

    res.json({
      ...base,
      code,
      displayCode: formatCode(code),
      commissionPercent: A.effectivePercent(amb, settings),
      stats: summaryInRupees(summary),
      canRequestPayout: hasPayoutMethod && summary.available >= settings.minPayoutRupees * 100,
      earnings: earnings.map((e) => ({
        _id: e.id,
        friend: firstName(e.referral.referee.name),
        paid: rupees(e.baseAmount),
        percent: e.percent,
        amount: rupees(e.amount),
        earnedOn: e.createdAt,
        availableOn: e.availableAt,
        state: e.payout && e.payout.status === "paid" ? "paid" : e.payout ? "requested" : e.availableAt > now ? "on_hold" : "available",
      })),
      payouts: payouts.map((p) => ({
        _id: p.id, amount: rupees(p.amount), status: p.status, payTo: p.payTo, reference: p.reference,
        requestedAt: p.requestedAt, paidAt: p.paidAt,
      })),
      certificate: amb.certificateNumber ? { number: amb.certificateNumber, issuedAt: amb.certificateIssuedAt } : null,
      kit: { status: amb.kitStatus, note: amb.kitNote },
      profile: {
        upiId: amb.upiId,
        bankHolder: amb.bankHolder,
        bankAccountMasked: A.maskAccount(amb.bankAccount),
        hasBankAccount: !!amb.bankAccount,
        bankIfsc: amb.bankIfsc,
        shippingAddress: amb.shippingAddress,
        hasPayoutMethod,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ---------- student: apply ----------
router.post("/ambassador/apply", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    const settings = await A.getSettings();
    if (!settings.enabled) return res.status(403).json({ ok: false, error: "The ambassador programme isn't taking applications right now." });

    const parsed = A.parseApplication(req.body);
    if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });

    const existing = await prisma.ambassador.findUnique({ where: { userId: req.user.sub } });
    if (existing && existing.status === "applied") return res.status(400).json({ ok: false, error: "Your application is already with us — we'll be in touch." });
    if (existing && existing.status === "approved") return res.status(400).json({ ok: false, error: "You're already a campus ambassador." });
    if (existing && existing.status === "suspended") return res.status(400).json({ ok: false, error: "Your ambassador account is paused — please contact us." });

    // A rejected applicant may apply again; that just refreshes the same record.
    const amb = existing
      ? await prisma.ambassador.update({ where: { id: existing.id }, data: { ...parsed.data, status: "applied", appliedAt: new Date() } })
      : await prisma.ambassador.create({ data: { ...parsed.data, userId: req.user.sub, shippingAddress: "" } });
    res.status(201).json({ ok: true, status: amb.status });
  } catch (e) {
    next(e);
  }
});

// ---------- student: payout details + kit address ----------
router.put("/me/ambassador/profile", requireAuth, async (req, res, next) => {
  try {
    const amb = await prisma.ambassador.findUnique({ where: { userId: req.user.sub } });
    if (!amb || amb.status !== "approved") return res.status(403).json({ ok: false, error: "Only approved ambassadors can update this." });
    const parsed = A.parseProfile(req.body);
    if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
    await prisma.ambassador.update({ where: { id: amb.id }, data: parsed.data });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- student: ask to be paid ----------
router.post("/me/ambassador/payouts", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    const amb = await prisma.ambassador.findUnique({ where: { userId: req.user.sub } });
    if (!amb || amb.status !== "approved") return res.status(403).json({ ok: false, error: "Only approved ambassadors can request a payout." });
    const result = await A.requestPayout(amb);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    res.status(201).json({ ok: true, amount: rupees(result.payout.amount) });
  } catch (e) {
    next(e);
  }
});

// ============================ admin ============================

router.get("/admin/ambassador-settings", requireAdmin, async (req, res, next) => {
  try {
    res.json({ ok: true, settings: await A.getSettings() });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/ambassador-settings", requireAdmin, async (req, res, next) => {
  try {
    const result = await A.saveSettings(req.body);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true, settings: result.settings });
  } catch (e) {
    next(e);
  }
});

// Every application / ambassador, with their numbers.
router.get("/admin/ambassadors", requireAdmin, async (req, res, next) => {
  try {
    const q = queryText(req.query.q);
    const where = {};
    if (["applied", "approved", "rejected", "suspended"].includes(req.query.status)) where.status = req.query.status;
    if (q) {
      where.OR = [
        { college: { contains: q } }, { city: { contains: q } },
        { user: { OR: [{ name: { contains: q } }, { email: { contains: q } }] } },
      ];
    }
    const [settings, rows, counts, owed] = await Promise.all([
      A.getSettings(),
      prisma.ambassador.findMany({ where, include: { user: { select: { id: true, name: true, email: true, phone: true } } }, orderBy: { appliedAt: "desc" } }),
      prisma.ambassador.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.ambassadorPayout.aggregate({ where: { status: "requested" }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    const summaries = await Promise.all(rows.map((r) => (r.status === "approved" || r.status === "suspended" ? A.earningsSummary(r.id) : null)));
    const count = (s) => (counts.find((c) => c.status === s) || { _count: { _all: 0 } })._count._all;

    res.json({
      ok: true,
      summary: {
        applied: count("applied"), approved: count("approved"), rejected: count("rejected"), suspended: count("suspended"),
        payoutsWaiting: owed._count._all, payoutsWaitingAmount: rupees(owed._sum.amount),
      },
      ambassadors: rows.map((r, i) => ({
        _id: r.id,
        status: r.status,
        user: { _id: r.user.id, name: r.user.name, email: r.user.email, phone: r.user.phone },
        college: r.college, city: r.city, yearOfStudy: r.yearOfStudy, branch: r.branch,
        socialHandle: r.socialHandle, motivation: r.motivation,
        commissionOverride: r.commissionPercent,
        commissionPercent: A.effectivePercent(r, settings),
        kitStatus: r.kitStatus, kitNote: r.kitNote, shippingAddress: r.shippingAddress,
        certificateNumber: r.certificateNumber,
        adminNote: r.adminNote,
        hasPayoutMethod: !!A.payoutDestination(r),
        appliedAt: r.appliedAt, approvedAt: r.approvedAt,
        stats: summaries[i] ? summaryInRupees(summaries[i]) : null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// One ambassador in full: commissions earned and payouts.
router.get("/admin/ambassadors/:id", requireAdmin, async (req, res, next) => {
  try {
    const r = await prisma.ambassador.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        earnings: { include: { referral: { include: { referee: { select: { name: true, email: true } } } }, payout: { select: { status: true } } }, orderBy: { createdAt: "desc" } },
        payouts: { orderBy: { requestedAt: "desc" } },
      },
    });
    if (!r) return res.status(404).json({ ok: false, error: "Ambassador not found" });
    res.json({
      ok: true,
      payoutDestination: A.payoutDestination(r),
      earnings: r.earnings.map((e) => ({
        _id: e.id, friend: e.referral.referee.name, friendEmail: e.referral.referee.email,
        paid: rupees(e.baseAmount), percent: e.percent, amount: rupees(e.amount),
        earnedOn: e.createdAt, availableOn: e.availableAt, void: e.void,
        locked: !!e.payoutId, payoutStatus: e.payout ? e.payout.status : null,
      })),
      payouts: r.payouts.map((p) => ({
        _id: p.id, amount: rupees(p.amount), status: p.status, payTo: p.payTo, reference: p.reference, note: p.note,
        requestedAt: p.requestedAt, paidAt: p.paidAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// Approve / reject / suspend, set their commission %, track their kit, leave a note.
router.patch("/admin/ambassadors/:id", requireAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.ambassador.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ ok: false, error: "Ambassador not found" });

    const { status, commissionPercent, kitStatus, kitNote, adminNote } = req.body || {};
    const data = {};
    if (status !== undefined) {
      if (!["applied", "approved", "rejected", "suspended"].includes(status)) return res.status(400).json({ ok: false, error: "Unknown status" });
      data.status = status;
    }
    if (commissionPercent !== undefined) {
      if (commissionPercent === null || commissionPercent === "") data.commissionPercent = null; // back to the programme default
      else {
        const n = Number(commissionPercent);
        if (!Number.isInteger(n) || n < 0 || n > 50) return res.status(400).json({ ok: false, error: "Commission must be a whole number from 0 to 50 percent" });
        data.commissionPercent = n;
      }
    }
    if (kitStatus !== undefined) {
      if (!KIT_STATUSES.includes(kitStatus)) return res.status(400).json({ ok: false, error: "Unknown kit status" });
      data.kitStatus = kitStatus;
    }
    if (kitNote !== undefined) data.kitNote = String(kitNote).trim().slice(0, 190);
    if (adminNote !== undefined) data.adminNote = String(adminNote).trim().slice(0, 190);

    let updated = await prisma.ambassador.update({ where: { id: existing.id }, data });
    if (data.status === "approved") updated = await A.onApproved(existing.id);
    res.json({ ok: true, status: updated.status });
  } catch (e) {
    next(e);
  }
});

// Void (or restore) a commission — e.g. a purchase that was refunded outside the site.
// Locked once it's part of a payout request; reject that payout first.
router.patch("/admin/ambassador-earnings/:id", requireAdmin, async (req, res, next) => {
  try {
    const { void: voidIt } = req.body || {};
    if (typeof voidIt !== "boolean") return res.status(400).json({ ok: false, error: "void must be true or false" });
    const earning = await prisma.ambassadorEarning.findUnique({ where: { id: req.params.id } });
    if (!earning) return res.status(404).json({ ok: false, error: "Commission not found" });
    if (earning.payoutId) return res.status(409).json({ ok: false, error: "This commission is part of a payout — reject that payout first." });
    await prisma.ambassadorEarning.update({ where: { id: earning.id }, data: { void: voidIt } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: payouts ----------
router.get("/admin/ambassador-payouts", requireAdmin, async (req, res, next) => {
  try {
    const where = ["requested", "paid", "rejected"].includes(req.query.status) ? { status: req.query.status } : {};
    const rows = await prisma.ambassadorPayout.findMany({
      where,
      include: { ambassador: { select: { id: true, college: true, user: { select: { name: true, email: true, phone: true } } } } },
      orderBy: { requestedAt: "desc" },
      take: 200,
    });
    res.json({
      ok: true,
      payouts: rows.map((p) => ({
        _id: p.id, status: p.status, amount: rupees(p.amount), payTo: p.payTo, reference: p.reference, note: p.note,
        requestedAt: p.requestedAt, paidAt: p.paidAt,
        ambassador: { _id: p.ambassador.id, name: p.ambassador.user.name, email: p.ambassador.user.email, phone: p.ambassador.user.phone, college: p.ambassador.college },
      })),
    });
  } catch (e) {
    next(e);
  }
});

// Record that a payout was sent (with the transaction reference), or turn it down
// (which frees its commissions to be requested again).
router.patch("/admin/ambassador-payouts/:id", requireAdmin, async (req, res, next) => {
  try {
    const { action, reference, note } = req.body || {};
    if (!["paid", "rejected"].includes(action)) return res.status(400).json({ ok: false, error: "action must be paid or rejected" });
    const ref = String(reference || "").trim().slice(0, 190);
    const why = String(note || "").trim().slice(0, 190);
    if (action === "paid" && !ref) return res.status(400).json({ ok: false, error: "Enter the transaction reference (UTR / UPI ref) so the payment can be traced." });

    const payout = await prisma.ambassadorPayout.findUnique({ where: { id: req.params.id } });
    if (!payout) return res.status(404).json({ ok: false, error: "Payout not found" });

    // Compare-and-swap out of "requested" so two admins (or a double click) can't both act on it.
    const won = await prisma.$transaction(async (tx) => {
      const moved = await tx.ambassadorPayout.updateMany({
        where: { id: payout.id, status: "requested" },
        data: action === "paid" ? { status: "paid", reference: ref, note: why, paidAt: new Date() } : { status: "rejected", note: why },
      });
      if (moved.count === 1 && action === "rejected") {
        await tx.ambassadorEarning.updateMany({ where: { payoutId: payout.id }, data: { payoutId: null } });
      }
      return moved.count === 1;
    });
    if (!won) return res.status(409).json({ ok: false, error: `This payout is already ${payout.status}.` });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
