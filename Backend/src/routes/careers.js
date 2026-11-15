// Careers: the public list of job openings, and a candidate's own applications
// — apply for a role, see where the application stands, take the test once an
// admin has given access.
//
// Applying and the test are free: no payment is taken anywhere in this flow.
// A candidate can't unlock a test themselves — an admin gives test access to a
// specific student (routes/adminCareers.js, utils/careers.js grantTestAccess).
//
// The test itself is in routes/aptitudeTest.js; the admin side in routes/adminCareers.js.
const express = require("express");
const { prisma } = require("../db");
const { requireAuth } = require("../middleware/requireAuth");
const { publicWriteLimiter } = require("../utils/rateLimit");
const { rejectWithoutTerms } = require("../utils/terms");
const { lockUser } = require("../utils/wallet");
const { getCareerSettings } = require("../utils/careerSettings");
const { STATUS_LABELS, shapeOpening, positionsOf, OPENING_COUNTS, finalizeExpiredAttempts } = require("../utils/careers");

const router = express.Router();

// An application that ended without an offer no longer blocks applying again.
const CLOSED_STATUSES = ["not_shortlisted", "rejected"];
// My Dashboard keeps itself short: an application that ended without an offer
// leaves My Applications this long after it closed (the record stays for the
// admin side), and notifications older than this are deleted.
const DASHBOARD_KEEP_DAYS = 30;
const keepCutoff = () => new Date(Date.now() - DASHBOARD_KEEP_DAYS * 86400000);
// The applications a candidate still sees: not cleared by them, and not ended
// more than DASHBOARD_KEEP_DAYS ago (an older one may have no closedAt).
const visibleApplications = (userId) => ({
  userId,
  clearedAt: null,
  NOT: {
    status: { in: CLOSED_STATUSES },
    OR: [{ closedAt: { lt: keepCutoff() } }, { closedAt: null, updatedAt: { lt: keepCutoff() } }],
  },
});
// Statuses at which the candidate is shown their interview slot.
const INTERVIEW_VISIBLE = ["interview_scheduled", "selected"];

// The numbers the public page and the dashboard quote (bonus, credit rules).
function publicTerms(settings) {
  return {
    signupBonus: settings.signupBonusCredits,
    creditExpiryMonths: settings.creditExpiryMonths,
    creditUsagePercent: settings.creditUsagePercent,
  };
}

// An application as its owner sees it: where it stands, never how the test went.
// The score, the marks per category, the paper, the right answers and the
// admin's note are not sent to the candidate at all.
function shapeApplication(a) {
  const attempt = a.attempt || null;
  return {
    _id: a.id,
    status: a.status,
    statusLabel: STATUS_LABELS[a.status] || a.status,
    opening: a.opening ? { _id: a.opening.id, slug: a.opening.slug, title: a.opening.title, status: a.opening.status, audience: a.opening.audience || "general", test: shapeOpening(a.opening).test } : undefined,
    cv: a.cvKey ? { fileName: a.cvFileName, uploadedAt: a.cvUploadedAt } : null,
    createdAt: a.createdAt,
    testAccessAt: a.testAccessAt,
    interview: INTERVIEW_VISIBLE.includes(a.status) && a.interviewAt ? { at: a.interviewAt, link: a.interviewLink } : null,
    attempt: attempt
      ? {
          _id: attempt.id,
          status: attempt.status,
          startedAt: attempt.startedAt,
          endsAt: attempt.endsAt,
          submittedAt: attempt.submittedAt,
          submitReason: attempt.submitReason,
          violationCount: attempt.violationCount,
        }
      : null,
  };
}

const WITH_DETAIL = { opening: true, attempt: true };

// ---------- public: open roles (the /careers page) ----------
// Older free-internship openings (audience "free") are left out: that page is static now.
router.get("/careers/openings", async (req, res, next) => {
  try {
    const [openings, settings] = await Promise.all([
      prisma.jobOpening.findMany({ where: { status: "open", audience: "general" }, include: OPENING_COUNTS, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
      getCareerSettings(),
    ]);
    // Roles open and close from Admin: never let a browser or a data-saver proxy keep an old list.
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, openings: openings.map((o) => shapeOpening(o)), terms: publicTerms(settings) });
  } catch (e) {
    next(e);
  }
});

// The /free-internships page is static: its roles and apply link are in the
// website's code (Frontend/src/data/freeInternships.json), so there is no
// public endpoint for them. Openings with audience "free" stored from before
// stay only so earlier on-site applications keep working.

// ---------- candidate: my applications ----------
router.get("/me/job-applications", requireAuth, async (req, res, next) => {
  try {
    // A test whose time ran out while the tab was closed is submitted before it is shown.
    await finalizeExpiredAttempts({ userId: req.user.sub });
    const [applications, settings] = await Promise.all([
      prisma.jobApplication.findMany({ where: visibleApplications(req.user.sub), include: WITH_DETAIL, orderBy: { createdAt: "desc" } }),
      getCareerSettings(),
    ]);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, applications: applications.map((a) => shapeApplication(a)), terms: publicTerms(settings), keepDays: DASHBOARD_KEEP_DAYS });
  } catch (e) {
    next(e);
  }
});

// ---------- candidate: clear ended applications from My Applications ----------
// Body: { id } for one, or nothing for every ended one. Only applications that
// ended without an offer can be cleared; it hides them from the candidate only.
router.post("/me/job-applications/clear", requireAuth, async (req, res, next) => {
  try {
    const id = req.body && req.body.id;
    if (id !== undefined && typeof id !== "string") return res.status(400).json({ ok: false, error: "Invalid application." });
    const { count } = await prisma.jobApplication.updateMany({
      where: { userId: req.user.sub, status: { in: CLOSED_STATUSES }, clearedAt: null, ...(id ? { id } : {}) },
      data: { clearedAt: new Date() },
    });
    if (id && !count) return res.status(400).json({ ok: false, error: "Only an application that has ended can be cleared." });
    res.json({ ok: true, cleared: count });
  } catch (e) {
    next(e);
  }
});

// ---------- candidate: apply for a role ----------
// Body: { opening: <slug or id>, acceptTerms: true, confirmAdult: true }.
// Creates the application — it then waits for an admin to give test access —
// or hands back the one already open for that role: applying twice never makes
// a second one.
router.post("/me/job-applications", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    const ref = req.body && req.body.opening;
    if (typeof ref !== "string" || !ref.trim()) return res.status(400).json({ ok: false, error: "Choose a role to apply for." });
    if (req.user.role === "admin") return res.status(400).json({ ok: false, error: "Admin accounts can't apply for a role." });
    if (rejectWithoutTerms(req, res)) return;
    if (req.body.confirmAdult !== true) {
      return res.status(400).json({ ok: false, code: "ADULT_REQUIRED", error: "The aptitude test is only for candidates aged 18 or older. Please confirm your age to apply." });
    }

    const opening = await prisma.jobOpening.findFirst({ where: { OR: [{ slug: ref.trim() }, { id: ref.trim() }] }, include: OPENING_COUNTS });
    if (!opening) return res.status(404).json({ ok: false, error: "Opening not found" });

    const result = await prisma.$transaction(async (tx) => {
      // Under the user's row lock, so a double click can't create two.
      await lockUser(tx, req.user.sub);
      const existing = await tx.jobApplication.findFirst({
        where: { userId: req.user.sub, openingId: opening.id, status: { notIn: CLOSED_STATUSES } },
        include: WITH_DETAIL,
      });
      if (existing) return { application: existing, created: false };
      if (opening.status !== "open") return { error: "This role is closed for applications right now." };
      // Every position taken: no new applications (one already started, above, carries on).
      const seats = positionsOf(opening);
      if (seats && seats.left === 0) return { error: "All positions for this role have been filled.", code: "POSITIONS_FILLED" };
      // A role can't be retaken back-to-back: after an application there ends
      // without an offer, the candidate waits the admin's cooldown before trying again.
      {
        const { reapplyCooldownDays } = await getCareerSettings(tx);
        if (reapplyCooldownDays > 0) {
          const last = await tx.jobApplication.findFirst({
            where: { userId: req.user.sub, openingId: opening.id, status: { in: CLOSED_STATUSES } },
            orderBy: { updatedAt: "desc" },
            select: { closedAt: true, updatedAt: true },
          });
          const again = last ? new Date((last.closedAt || last.updatedAt).getTime() + reapplyCooldownDays * 86400000) : null;
          if (again && again > new Date()) {
            const when = again.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
            return { error: `You can apply for this role again from ${when}.`, code: "REAPPLY_COOLDOWN" };
          }
        }
      }
      const created = await tx.jobApplication.create({
        data: { userId: req.user.sub, openingId: opening.id, adultConfirmedAt: new Date() },
        include: WITH_DETAIL,
      });
      return { application: created, created: true };
    });
    if (result.error) return res.status(400).json({ ok: false, error: result.error, ...(result.code ? { code: result.code } : {}) });
    res.status(result.created ? 201 : 200).json({ ok: true, application: shapeApplication(result.application) });
  } catch (e) {
    next(e);
  }
});

// ---------- candidate: dashboard notifications ----------
router.get("/me/notifications", requireAuth, async (req, res, next) => {
  try {
    // Old ones go for good, so the list stays short.
    await prisma.notification.deleteMany({ where: { userId: req.user.sub, createdAt: { lt: keepCutoff() } } });
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: req.user.sub }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.notification.count({ where: { userId: req.user.sub, readAt: null } }),
    ]);
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      unread,
      keepDays: DASHBOARD_KEEP_DAYS,
      notifications: notifications.map((n) => ({ _id: n.id, title: n.title, body: n.body, link: n.link, read: !!n.readAt, createdAt: n.createdAt })),
    });
  } catch (e) {
    next(e);
  }
});

router.post("/me/notifications/read", requireAuth, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.sub, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Clear notifications: one (/:id) or all of them.
router.delete("/me/notifications", requireAuth, async (req, res, next) => {
  try {
    await prisma.notification.deleteMany({ where: { userId: req.user.sub } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete("/me/notifications/:id", requireAuth, async (req, res, next) => {
  try {
    await prisma.notification.deleteMany({ where: { userId: req.user.sub, id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
