// Careers: the public list of job openings, and a candidate's own applications
// — apply for a role, pay the aptitude-test fee, see where the application stands.
//
// Paying the fee is deliberately separate from the normal checkout in
// routes/payments.js (same reasons as routes/paymentRequests.js): no plan
// pricing, no offer codes, no referral discount, and wallet credit can't pay
// for it — the fee itself comes back as credit. The two share only the Payment
// table (so the fee gets a normal receipt) and the Razorpay webhook, which
// hands payments carrying a jobApplicationId to utils/careers.js.
//
// The test itself is in routes/aptitudeTest.js; the admin side in routes/adminCareers.js.
const express = require("express");
const crypto = require("crypto");
const { prisma } = require("../db");
const { safeEqual } = require("../utils/safeCompare");
const { razorpay, isLiveBlocked } = require("../utils/razorpay");
const { requireAuth } = require("../middleware/requireAuth");
const { publicWriteLimiter } = require("../utils/rateLimit");
const { rejectWithoutTerms } = require("../utils/terms");
const { rejectIfProfileIncomplete, profileMissing, educationMissing } = require("../utils/accounts");
const { lockUser } = require("../utils/wallet");
const { getCareerSettings } = require("../utils/careerSettings");
const { saveCv, deleteSnapshot, describeStorageError } = require("../utils/proctorStorage");
const { STATUS_LABELS, shapeOpening, grantTestForPayment, finalizeExpiredAttempts, testFeeFor } = require("../utils/careers");

const router = express.Router();

// An application that ended without an offer no longer blocks applying again.
const CLOSED_STATUSES = ["not_shortlisted", "rejected"];
// A CV may be up to this size, and only before the test is taken.
const MAX_CV_BYTES = 2 * 1024 * 1024;
const CV_EDITABLE = ["payment_pending", "test_pending"];
// A "free" (free-internships page) role's test only unlocks once a CV is on the application.
const needsCv = (opening) => !!opening && opening.audience === "free";
// A free internship needs the student's details and education from Profile.
// Returns { missing } (names of what's still empty) and the education to copy
// onto the application once it goes ahead.
async function freeInternshipProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return {
    missing: [...profileMissing(user), ...educationMissing(user)],
    education: { college: user.college, course: user.course, department: user.department, semester: user.semester, passingYear: user.passingYear },
  };
}
const profileIncompleteBody = (missing) => ({ ok: false, code: "PROFILE_INCOMPLETE", missing, error: `Please add your ${missing.join(", ")} to apply.` });
// Statuses at which the candidate is shown their interview slot.
const INTERVIEW_VISIBLE = ["interview_scheduled", "selected"];

// The numbers the public page and the dashboard quote (fee, bonus, credit rules).
function publicTerms(settings) {
  return {
    testFee: settings.testFeeRupees,
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
    opening: a.opening ? { _id: a.opening.id, slug: a.opening.slug, title: a.opening.title, status: a.opening.status, feeRequired: a.opening.feeRequired !== false, audience: a.opening.audience || "general", test: shapeOpening(a.opening).test } : undefined,
    cv: a.cvKey ? { fileName: a.cvFileName, uploadedAt: a.cvUploadedAt } : null,
    createdAt: a.createdAt,
    paidAt: a.paidAt,
    paidPaymentId: a.paymentId,
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

// Same answers the normal checkout gives for Razorpay SDK failures.
function respondToRazorpayError(e, res) {
  if (!e || !e.statusCode) return false;
  console.error("Razorpay order create failed (aptitude test):", e.statusCode, e.error && e.error.description);
  res.status(502).json({
    ok: false,
    error: e.statusCode === 401
      ? "Payments aren't set up correctly yet. Please contact us on WhatsApp to complete your payment."
      : (e.error && e.error.description) || "Payment gateway error",
  });
  return true;
}

// ---------- public: open roles (the /careers page) ----------
// Free-internship roles are left out: they are listed only on the unlinked /free-internships page.
router.get("/careers/openings", async (req, res, next) => {
  try {
    const [openings, settings] = await Promise.all([
      prisma.jobOpening.findMany({ where: { status: "open", audience: "general" }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
      getCareerSettings(),
    ]);
    res.json({ ok: true, openings: openings.map((o) => shapeOpening(o)), terms: publicTerms(settings) });
  } catch (e) {
    next(e);
  }
});

// ---------- public: open free-internship roles (the /free-internships page) ----------
router.get("/careers/free/openings", async (req, res, next) => {
  try {
    const [openings, settings] = await Promise.all([
      prisma.jobOpening.findMany({ where: { status: "open", audience: "free" }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
      getCareerSettings(),
    ]);
    res.json({
      ok: true,
      openings: openings.map((o) => shapeOpening(o)),
      terms: { processingFee: settings.processingFeeRupees, creditExpiryMonths: settings.creditExpiryMonths, creditUsagePercent: settings.creditUsagePercent },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/careers/openings/:slug", async (req, res, next) => {
  try {
    const opening = await prisma.jobOpening.findUnique({ where: { slug: String(req.params.slug) } });
    // A closed role isn't public any more — same answer as one that never existed.
    if (!opening || opening.status !== "open") return res.status(404).json({ ok: false, error: "Opening not found" });
    res.json({ ok: true, opening: shapeOpening(opening), terms: publicTerms(await getCareerSettings()) });
  } catch (e) {
    next(e);
  }
});

// ---------- candidate: my applications ----------
router.get("/me/job-applications", requireAuth, async (req, res, next) => {
  try {
    // A test whose time ran out while the tab was closed is submitted before it is shown.
    await finalizeExpiredAttempts({ userId: req.user.sub });
    const [applications, settings] = await Promise.all([
      prisma.jobApplication.findMany({ where: { userId: req.user.sub }, include: WITH_DETAIL, orderBy: { createdAt: "desc" } }),
      getCareerSettings(),
    ]);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, applications: applications.map((a) => shapeApplication(a)), terms: publicTerms(settings) });
  } catch (e) {
    next(e);
  }
});

// ---------- candidate: apply for a role ----------
// Body: { opening: <slug or id> }. Creates the application (waiting for the test
// fee), or hands back the one already open for that role — applying twice never
// makes a second one.
router.post("/me/job-applications", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    const ref = req.body && req.body.opening;
    if (typeof ref !== "string" || !ref.trim()) return res.status(400).json({ ok: false, error: "Choose a role to apply for." });
    if (req.user.role === "admin") return res.status(400).json({ ok: false, error: "Admin accounts can't apply for a role." });

    const opening = await prisma.jobOpening.findFirst({ where: { OR: [{ slug: ref.trim() }, { id: ref.trim() }] } });
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
      // A free role can't be retaken back-to-back: after an application there ends
      // without an offer, the candidate waits the admin's cooldown before trying again.
      if (opening.feeRequired === false) {
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
        data: { userId: req.user.sub, openingId: opening.id },
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

// ---------- candidate: upload a CV for an application ----------
// The request body IS the PDF (Content-Type: application/pdf); the file name
// comes in X-File-Name. Replaces any earlier CV, until the test is taken.
router.put(
  "/me/job-applications/:id/cv",
  publicWriteLimiter,
  requireAuth,
  express.raw({ type: "application/pdf", limit: MAX_CV_BYTES }),
  async (req, res, next) => {
    try {
      const application = await prisma.jobApplication.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true, status: true, cvKey: true } });
      if (!application || application.userId !== req.user.sub) return res.status(404).json({ ok: false, error: "Application not found" });
      if (!CV_EDITABLE.includes(application.status)) return res.status(400).json({ ok: false, error: "Your CV can't be changed after the test has been taken." });
      const body = req.body;
      // Every PDF starts with "%PDF-".
      const isPdf = Buffer.isBuffer(body) && body.length > 5 && body.subarray(0, 5).toString("latin1") === "%PDF-";
      if (!isPdf) return res.status(400).json({ ok: false, error: "Upload your CV as a PDF file (up to 2 MB)." });

      let fileName = "";
      try { fileName = decodeURIComponent(String(req.get("x-file-name") || "")); } catch (err) { fileName = ""; }
      fileName = fileName.replace(/[^\w .()-]/g, "").trim().slice(0, 150) || "cv.pdf";
      if (!/\.pdf$/i.test(fileName)) fileName += ".pdf";

      // A storage failure is ours, not the student's: say so plainly, and log
      // the real reason (Admin → Careers settings → Check storage shows it too).
      let cvKey;
      try {
        cvKey = await saveCv(application.id, body);
      } catch (err) {
        console.error(`[careers] CV upload failed for application ${application.id}: ${describeStorageError(err)}`);
        return res.status(503).json({ ok: false, code: "CV_STORAGE", error: "We couldn't save your CV just now. Please try again in a few minutes — if it keeps happening, email us and we'll sort it out." });
      }
      await prisma.jobApplication.update({ where: { id: application.id }, data: { cvKey, cvFileName: fileName, cvUploadedAt: new Date() } });
      // The replaced file goes after the new one is safely recorded.
      if (application.cvKey) await deleteSnapshot(application.cvKey).catch((err) => console.error("[careers] old CV not deleted:", err.message));
      res.json({ ok: true, cv: { fileName } });
    } catch (e) {
      next(e);
    }
  }
);

// ---------- candidate: start paying the test fee ----------
// The amount is the admin's test fee, read here — never anything the browser sent.
router.post("/me/job-applications/:id/create-order", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    if (isLiveBlocked) {
      return res.status(503).json({
        ok: false,
        error: "Live payments are disabled by a safety guard. Set ALLOW_LIVE_PAYMENTS=true in Backend/.env to enable real charges.",
      });
    }
    if (rejectWithoutTerms(req, res)) return;
    if (await rejectIfProfileIncomplete(req, res)) return;
    // The aptitude test (with webcam monitoring) is for adults only.
    if (!req.body || req.body.confirmAdult !== true) {
      return res.status(400).json({ ok: false, code: "ADULT_REQUIRED", error: "The aptitude test is only for candidates aged 18 or older. Please confirm your age to continue." });
    }
    const application = await prisma.jobApplication.findUnique({ where: { id: req.params.id }, include: { opening: true } });
    // Same answer for "missing" and "not yours".
    if (!application || application.userId !== req.user.sub) {
      return res.status(404).json({ ok: false, error: "Application not found" });
    }
    if (application.status !== "payment_pending") {
      return res.status(400).json({ ok: false, error: "The test fee for this application has already been paid." });
    }
    if (application.opening.status !== "open") {
      return res.status(400).json({ ok: false, error: "This role is closed for applications right now." });
    }
    const settings = await getCareerSettings();
    const fee = testFeeFor(application.opening, settings);
    if (!fee) {
      return res.status(400).json({ ok: false, error: "This role has no fee — unlock the test for free instead." });
    }
    // A free internship: the CV and the student's education come first, and the
    // education is copied onto the application as it is now.
    let education;
    if (needsCv(application.opening)) {
      if (!application.cvKey) return res.status(400).json({ ok: false, code: "CV_REQUIRED", error: "Upload your CV (PDF) to apply for this role." });
      const profile = await freeInternshipProfile(req.user.sub);
      if (profile.missing.length) return res.status(400).json(profileIncompleteBody(profile.missing));
      education = profile.education;
    }

    await prisma.jobApplication.update({ where: { id: application.id }, data: { adultConfirmedAt: new Date(), ...(education ? { education } : {}) } });

    const amountPaise = fee * 100;
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `job_${application.id}`,
      notes: { jobApplicationId: String(application.id), role: application.opening.slug },
    });

    await prisma.payment.create({
      data: {
        termsAcceptedAt: new Date(),
        razorpayOrderId: order.id,
        amount: amountPaise,
        status: "created",
        userId: application.userId,
        jobApplicationId: application.id,
        orderSnapshotBasePrice: fee,
        orderSnapshotDiscountPercent: 0,
      },
    });

    res.status(201).json({
      ok: true,
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // public key id — safe to send to the frontend checkout widget
    });
  } catch (e) {
    if (respondToRazorpayError(e, res)) return;
    next(e);
  }
});

// ---------- candidate: unlock the test of a free role ----------
// A role the admin marked free has no registration fee: once the terms and the
// 18+ box are accepted, the test unlocks straight away — no payment, no credit.
router.post("/me/job-applications/:id/unlock-free", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    if (rejectWithoutTerms(req, res)) return;
    if (!req.body || req.body.confirmAdult !== true) {
      return res.status(400).json({ ok: false, code: "ADULT_REQUIRED", error: "The aptitude test is only for candidates aged 18 or older. Please confirm your age to continue." });
    }
    const application = await prisma.jobApplication.findUnique({ where: { id: req.params.id }, include: { opening: true } });
    if (!application || application.userId !== req.user.sub) {
      return res.status(404).json({ ok: false, error: "Application not found" });
    }
    if (testFeeFor(application.opening, await getCareerSettings()) > 0) {
      return res.status(400).json({ ok: false, code: "FEE_REQUIRED", error: "This role needs its fee paid to unlock the test." });
    }
    if (application.opening.status !== "open") {
      return res.status(400).json({ ok: false, error: "This role is closed for applications right now." });
    }
    if (needsCv(application.opening) && !application.cvKey) {
      return res.status(400).json({ ok: false, code: "CV_REQUIRED", error: "Upload your CV (PDF) to apply for this role." });
    }
    // A free internship also needs the student's details and education from
    // Profile; a copy of the education is kept on the application.
    let education;
    if (needsCv(application.opening)) {
      const profile = await freeInternshipProfile(req.user.sub);
      if (profile.missing.length) return res.status(400).json(profileIncompleteBody(profile.missing));
      education = profile.education;
    }
    // Only an application still locked moves; a second click changes nothing.
    await prisma.jobApplication.updateMany({
      where: { id: application.id, status: "payment_pending" },
      data: { status: "test_pending", adultConfirmedAt: new Date(), ...(education ? { education } : {}) },
    });
    const updated = await prisma.jobApplication.findUnique({ where: { id: application.id }, include: WITH_DETAIL });
    res.json({ ok: true, application: shapeApplication(updated) });
  } catch (e) {
    next(e);
  }
});

// ---------- candidate: confirm the payment from Razorpay Checkout ----------
// Same signature check as /payments/verify; only accepts test-fee payments. What
// the browser says is never trusted — only a signature made with our key secret
// (here) or Razorpay's own webhook (routes/payments.js) unlocks the test.
router.post("/careers/verify", publicWriteLimiter, async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ ok: false, error: "Missing payment confirmation fields" });
    }
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    const valid = safeEqual(expected, String(razorpay_signature));
    if (!valid) return res.status(400).json({ ok: false, error: "Payment could not be verified." });

    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: String(razorpay_order_id) } });
    if (!payment || !payment.jobApplicationId) return res.status(404).json({ ok: false, error: "Payment record not found" });

    const application = await grantTestForPayment(payment, String(razorpay_payment_id));
    res.json({ ok: true, applicationId: application ? application.id : null, unlocked: !!application });
  } catch (e) {
    next(e);
  }
});

// ---------- candidate: dashboard notifications ----------
router.get("/me/notifications", requireAuth, async (req, res, next) => {
  try {
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: req.user.sub }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.notification.count({ where: { userId: req.user.sub, readAt: null } }),
    ]);
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      unread,
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

module.exports = router;
