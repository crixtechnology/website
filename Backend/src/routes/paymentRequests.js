// Admin-to-student payment requests. The admin asks one student to pay a set
// amount for one course or internship (optionally counting as a plan); the
// student sees it on their dashboard, pays it through Razorpay, and gets
// access exactly as a normal purchase would give it.
//
// Deliberately separate from the normal checkout in routes/payments.js: no
// Application, no plan pricing, no offer codes, referral discount or credit,
// no referral reward — and it works whether the course is open or closed. The
// two share only the Payment table (so a paid request gets the same receipt,
// shows in "My Receipts" and counts as revenue) and the Razorpay webhook,
// which hands payments carrying a paymentRequestId over to this file.
const express = require("express");
const crypto = require("crypto");
const { prisma } = require("../db");
const { razorpay, isLiveBlocked } = require("../utils/razorpay");
const { hasValidAccess, computeEndDate } = require("../utils/enrollmentAccess");
const { isTier, tierRank } = require("../utils/tiers");
const { requireAuth } = require("../middleware/requireAuth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { publicWriteLimiter } = require("../utils/rateLimit");
const { queryText } = require("../utils/validators");
const { sendPaymentRequestEmail } = require("../utils/mailer");
const { attachReceipt } = require("./payments");

const router = express.Router();

// Razorpay's smallest order is ₹1; the upper cap just catches a typo'd extra zero or three.
const MIN_PAISE = 100;
const MAX_PAISE = 10000000 * 100;
const MAX_NOTE = 190;

const USER_SUMMARY = { id: true, name: true, email: true, phone: true };
const COURSE_SUMMARY = { id: true, title: true, slug: true, type: true, status: true };

function shape(r) {
  return {
    _id: r.id,
    user: r.user ? { _id: r.user.id, name: r.user.name, email: r.user.email, phone: r.user.phone } : undefined,
    course: r.course ? { _id: r.course.id, title: r.course.title, slug: r.course.slug, type: r.course.type } : undefined,
    tier: r.tier,
    amount: r.amount / 100,
    note: r.note,
    status: r.status,
    paidPaymentId: r.paidPaymentId,
    paidAt: r.paidAt,
    createdAt: r.createdAt,
  };
}

// Same answers the normal checkout gives for Razorpay SDK failures.
function respondToRazorpayError(e, res) {
  if (!e || !e.statusCode) return false;
  console.error("Razorpay order create failed (payment request):", e.statusCode, e.error && e.error.description);
  res.status(502).json({
    ok: false,
    error: e.statusCode === 401
      ? "Payments aren't set up correctly yet. Please contact us on WhatsApp to complete your payment."
      : (e.error && e.error.description) || "Payment gateway error",
  });
  return true;
}

// Marks a request's payment paid, grants access, closes the request and mints
// the receipt. Idempotent — /payment-requests/verify and the Razorpay webhook
// can both call it for the same payment.
async function grantAccessForRequestPayment(payment, razorpayPaymentId) {
  if (payment.status !== "paid" || payment.razorpayPaymentId !== razorpayPaymentId) {
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "paid", razorpayPaymentId },
    });
  }
  const request = payment.paymentRequestId
    ? await prisma.paymentRequest.findUnique({
        where: { id: payment.paymentRequestId },
        include: { user: true, course: { select: { id: true, durationDays: true } } },
      })
    : null;
  if (!request || !request.user || !request.course) return null;

  // Money was taken, so the request is settled even if the admin cancelled it
  // while the student was on the payment screen.
  await prisma.paymentRequest.updateMany({
    where: { id: request.id, status: { not: "paid" } },
    data: { status: "paid", paidAt: new Date(), paidPaymentId: payment.id },
  });

  // Same access rules as a normal purchase (routes/payments.js): a live
  // enrollment keeps its dates (never relock the drip schedule), anything else
  // is a fresh grant for the course's own duration.
  const where = { userId_courseId: { userId: request.userId, courseId: request.courseId } };
  const existing = await prisma.enrollment.findUnique({ where });
  if (hasValidAccess(existing)) {
    // Never move a student DOWN a plan: a request's plan only applies when it's
    // higher than the one they already hold (or they hold none).
    const raise = request.tier && (!existing.tier || tierRank(request.tier) > tierRank(existing.tier));
    await prisma.enrollment.update({
      where: { id: existing.id },
      data: { paymentId: payment.id, status: "active", ...(raise ? { tier: request.tier } : {}) },
    });
  } else {
    const startDate = new Date();
    const endDate = computeEndDate(startDate, request.course.durationDays);
    await prisma.enrollment.upsert({
      where,
      create: { userId: request.userId, courseId: request.courseId, paymentId: payment.id, tier: request.tier, status: "active", startDate, endDate },
      update: { paymentId: payment.id, tier: request.tier, status: "active", startDate, endDate },
    });
  }

  // The normal receipt — attachReceipt only reads the buyer's details and the
  // course/user ids from its second argument.
  await attachReceipt(payment, {
    userId: request.userId,
    courseId: request.courseId,
    name: request.user.name,
    email: request.user.email,
    phone: request.user.phone,
  });
  return request;
}

// ---------- admin: list ----------
router.get("/admin/payment-requests", requireAdmin, async (req, res, next) => {
  try {
    const q = queryText(req.query.q);
    const status = queryText(req.query.status);
    const where = {
      ...(["pending", "paid", "cancelled"].includes(status) ? { status } : {}),
      ...(q
        ? {
            OR: [
              { user: { OR: [{ name: { contains: q } }, { email: { contains: q } }] } },
              { course: { title: { contains: q } } },
            ],
          }
        : {}),
    };
    const requests = await prisma.paymentRequest.findMany({
      where,
      include: { user: { select: USER_SUMMARY }, course: { select: COURSE_SUMMARY } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ ok: true, requests: requests.map(shape) });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: create ----------
// Body: { email | userId, courseId, amount (rupees), tier?, note? }. The course's
// open/closed status doesn't matter — the admin is deciding who gets in.
router.post("/admin/payment-requests", requireAdmin, async (req, res, next) => {
  try {
    const { userId, email, courseId, amount, tier, note } = req.body || {};
    if (typeof courseId !== "string" || !courseId) {
      return res.status(400).json({ ok: false, error: "Choose a course or internship." });
    }
    if ((userId != null && typeof userId !== "string") || (email != null && typeof email !== "string")) {
      return res.status(400).json({ ok: false, error: "userId and email must be text" });
    }
    if (!userId && !(email && email.trim())) {
      return res.status(400).json({ ok: false, error: "The student's email is required." });
    }
    const rupees = typeof amount === "string" ? Number(amount) : amount;
    const paise = Math.round(Number(rupees) * 100);
    if (typeof rupees !== "number" || !Number.isFinite(rupees) || paise < MIN_PAISE || paise > MAX_PAISE) {
      return res.status(400).json({ ok: false, error: "Enter an amount of at least ₹1." });
    }
    if (tier != null && tier !== "" && !isTier(tier)) {
      return res.status(400).json({ ok: false, error: "tier must be basic, plus or pro" });
    }
    if (note != null && typeof note !== "string") {
      return res.status(400).json({ ok: false, error: "note must be text" });
    }
    const cleanNote = (note || "").trim();
    if (cleanNote.length > MAX_NOTE) {
      return res.status(400).json({ ok: false, error: `Keep the note under ${MAX_NOTE} characters.` });
    }

    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) {
      return res.status(404).json({ ok: false, error: "No account with that email — they need to sign up first." });
    }
    if (user.role === "admin") {
      return res.status(400).json({ ok: false, error: "Admins already have access to everything." });
    }
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: COURSE_SUMMARY });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });

    const pending = await prisma.paymentRequest.count({ where: { userId: user.id, courseId: course.id, status: "pending" } });
    if (pending > 0) {
      return res.status(409).json({ ok: false, error: "This student already has a pending request for this. Cancel it first to send a new one." });
    }

    const request = await prisma.paymentRequest.create({
      data: { userId: user.id, courseId: course.id, amount: paise, tier: isTier(tier) ? tier : null, note: cleanNote },
      include: { user: { select: USER_SUMMARY }, course: { select: COURSE_SUMMARY } },
    });

    // Best-effort heads-up; the request is on their dashboard either way.
    sendPaymentRequestEmail({
      to: user.email, name: user.name, itemTitle: course.title, itemType: course.type,
      tier: request.tier, amount: paise / 100, note: cleanNote,
    }).catch((err) => console.error("[payment-requests] email failed:", err.message));

    res.status(201).json({ ok: true, request: shape(request) });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: cancel (only while still pending) ----------
router.post("/admin/payment-requests/:id/cancel", requireAdmin, async (req, res, next) => {
  try {
    const result = await prisma.paymentRequest.updateMany({
      where: { id: req.params.id, status: "pending" },
      data: { status: "cancelled" },
    });
    if (result.count === 0) {
      const exists = await prisma.paymentRequest.findUnique({ where: { id: req.params.id }, select: { status: true } });
      if (!exists) return res.status(404).json({ ok: false, error: "Request not found" });
      return res.status(400).json({ ok: false, error: `This request is already ${exists.status}.` });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- student: my requests (pending first, then paid) ----------
router.get("/me/payment-requests", requireAuth, async (req, res, next) => {
  try {
    const requests = await prisma.paymentRequest.findMany({
      where: { userId: req.user.sub, status: { in: ["pending", "paid"] } },
      include: { course: { select: COURSE_SUMMARY } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    res.json({ ok: true, requests: requests.map(shape) });
  } catch (e) {
    next(e);
  }
});

// ---------- student: start paying a request ----------
router.post("/me/payment-requests/:id/create-order", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    if (isLiveBlocked) {
      return res.status(503).json({
        ok: false,
        error: "Live payments are disabled by a safety guard. Set ALLOW_LIVE_PAYMENTS=true in Backend/.env to enable real charges.",
      });
    }
    const request = await prisma.paymentRequest.findUnique({
      where: { id: req.params.id },
      include: { course: { select: COURSE_SUMMARY } },
    });
    // Same answer for "missing" and "not yours".
    if (!request || request.userId !== req.user.sub) {
      return res.status(404).json({ ok: false, error: "Payment request not found" });
    }
    if (request.status !== "pending") {
      return res.status(400).json({
        ok: false,
        error: request.status === "paid" ? "This request has already been paid." : "This request was cancelled.",
      });
    }

    const order = await razorpay.orders.create({
      amount: request.amount,
      currency: "INR",
      receipt: `preq_${request.id}`,
      notes: { paymentRequestId: String(request.id), courseSlug: request.course.slug },
    });

    await prisma.payment.create({
      data: {
        razorpayOrderId: order.id,
        amount: request.amount,
        status: "created",
        tier: request.tier,
        userId: request.userId,
        courseId: request.courseId,
        paymentRequestId: request.id,
        // The receipt shows the requested amount, undiscounted.
        orderSnapshotBasePrice: request.amount / 100,
        orderSnapshotDiscountPercent: 0,
      },
    });

    res.status(201).json({
      ok: true,
      orderId: order.id,
      amount: request.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (e) {
    if (respondToRazorpayError(e, res)) return;
    next(e);
  }
});

// ---------- student: confirm a payment from Razorpay Checkout ----------
// Same signature check as /payments/verify; only accepts request payments.
router.post("/payment-requests/verify", async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ ok: false, error: "Missing payment confirmation fields" });
    }
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    const sig = String(razorpay_signature);
    const valid = expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    if (!valid) return res.status(400).json({ ok: false, error: "Payment could not be verified." });

    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: String(razorpay_order_id) } });
    if (!payment || !payment.paymentRequestId) return res.status(404).json({ ok: false, error: "Payment record not found" });

    const request = await grantAccessForRequestPayment(payment, String(razorpay_payment_id));
    let courseSlug = null;
    if (request) {
      const course = await prisma.course.findUnique({ where: { id: request.courseId }, select: { slug: true } });
      courseSlug = course ? course.slug : null;
    }
    res.json({ ok: true, courseSlug, enrolled: !!request });
  } catch (e) {
    next(e);
  }
});

module.exports = Object.assign(router, { grantAccessForRequestPayment });
