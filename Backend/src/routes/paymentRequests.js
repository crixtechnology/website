// Admin-to-student payment requests. The admin asks one student to pay a set
// amount for one course or internship (optionally counting as a plan); the
// student sees it on their dashboard, pays it through Razorpay, and gets
// access exactly as a normal purchase would give it.
//
// Separate from the normal checkout in routes/payments.js — no Application, no
// plan pricing, and it works whether the course is open or closed — because
// it's how Training + Internship is paid for: the student applies or calls,
// and the admin sends a request for the training fee. So the requested amount
// is priced the same way a checkout price is (utils/pricing.js priceOrder):
// wallet credit comes off it, and a wallet that covers the rest can pay on its
// own. The two flows share the
// Payment table (so a paid request gets the same receipt, shows in "My
// Receipts") and the Razorpay webhook, which hands payments carrying a
// paymentRequestId over to this file.
const express = require("express");
const crypto = require("crypto");
const { prisma } = require("../db");
const { isProgram, PROGRAM_WHERE, COURSES_DROPPED, programTitle } = require("../utils/programs");
const { safeEqual } = require("../utils/safeCompare");
const { razorpay, isLiveBlocked } = require("../utils/razorpay");
const { hasValidAccess, computeEndDate, accessStartFor } = require("../utils/enrollmentAccess");
const { isTier, tierRank } = require("../utils/tiers");
const { requireAuth } = require("../middleware/requireAuth");
const { priceOrder, redeemCreditForPurchase, releaseReservedCredit } = require("../utils/pricing");
const { WALLET_ORDER_PREFIX, lockUser, expireCredits } = require("../utils/wallet");
const { requireAdmin } = require("../middleware/requireAdmin");
const { publicWriteLimiter } = require("../utils/rateLimit");
const { rejectWithoutTerms } = require("../utils/terms");
const { rejectIfProfileIncomplete } = require("../utils/accounts");
const { queryText } = require("../utils/validators");
const { sendPaymentRequestEmail } = require("../utils/mailer");
const { attachReceipt } = require("./payments");

const router = express.Router();

// Razorpay's smallest order is ₹1; the upper cap just catches a typo'd extra zero or three.
const MIN_PAISE = 100;
const MAX_PAISE = 10000000 * 100;
const MAX_NOTE = 190;

const USER_SUMMARY = { id: true, name: true, email: true, phone: true };
const COURSE_SUMMARY = { id: true, title: true, slug: true, type: true, status: true, startsAt: true, durationDays: true };

function shape(r) {
  return {
    _id: r.id,
    user: r.user ? { _id: r.user.id, name: r.user.name, email: r.user.email, phone: r.user.phone } : undefined,
    course: r.course ? { _id: r.course.id, title: programTitle(r.course), slug: r.course.slug, type: r.course.type, startsAt: r.course.startsAt || null } : undefined,
    tier: r.tier,
    amount: r.amount / 100,
    allowDiscounts: r.allowDiscounts !== false,
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
        include: { user: true, course: { select: { id: true, durationDays: true, startsAt: true } } },
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
    const startDate = accessStartFor(request.course);
    const endDate = computeEndDate(startDate, request.course.durationDays);
    await prisma.enrollment.upsert({
      where,
      create: { userId: request.userId, courseId: request.courseId, paymentId: payment.id, tier: request.tier, status: "active", startDate, endDate },
      update: { paymentId: payment.id, tier: request.tier, status: "active", startDate, endDate },
    });
  }

  // Like a checkout purchase: spend the wallet credit this order was priced with (idempotent).
  await redeemCreditForPurchase(payment, { userId: request.userId });

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

// The caller's own pending request, or { error: { status, message } }.
async function loadPayableRequest(id, userId) {
  const request = await prisma.paymentRequest.findUnique({
    where: { id },
    include: { course: { select: COURSE_SUMMARY } },
  });
  // Same answer for "missing" and "not yours".
  if (!request || request.userId !== userId) return { error: { status: 404, message: "Payment request not found" } };
  if (request.status !== "pending") {
    return { error: { status: 400, message: request.status === "paid" ? "This request has already been paid." : "This request was cancelled." } };
  }
  return { request };
}

// What paying this request costs right now: the requested amount less the
// student's wallet credit — the same pricing a checkout uses — unless the admin
// switched credit off for this request (its amount is already reduced).
async function priceRequest(request, userId, { db } = {}) {
  if (request.allowDiscounts === false) {
    return {
      pricing: {
        planPaise: request.amount, availableCredit: 0, creditApplied: 0,
        payablePaise: request.amount, totalDuePaise: request.amount, walletCoversAll: false,
      },
    };
  }
  return { pricing: await priceOrder(userId, request.amount / 100, db) };
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
// Body: { email | userId, courseId, amount (rupees), tier?, note?, allowDiscounts? }.
// allowDiscounts (default true) lets the student's wallet credit come off the
// amount; false when it's already reduced. The course's
// open/closed status doesn't matter — the admin is deciding who gets in.
router.post("/admin/payment-requests", requireAdmin, async (req, res, next) => {
  try {
    const { userId, email, courseId, amount, tier, note, allowDiscounts } = req.body || {};
    if (allowDiscounts != null && typeof allowDiscounts !== "boolean") {
      return res.status(400).json({ ok: false, error: "allowDiscounts must be true or false" });
    }
    if (typeof courseId !== "string" || !courseId) {
      return res.status(400).json({ ok: false, error: "Choose a training track." });
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
    if (!isProgram(course)) return res.status(404).json({ ok: false, error: "Program not found" });

    const pending = await prisma.paymentRequest.count({ where: { userId: user.id, courseId: course.id, status: "pending" } });
    if (pending > 0) {
      return res.status(409).json({ ok: false, error: "This student already has a pending request for this. Cancel it first to send a new one." });
    }

    const request = await prisma.paymentRequest.create({
      data: { userId: user.id, courseId: course.id, amount: paise, tier: isTier(tier) ? tier : null, note: cleanNote, allowDiscounts: allowDiscounts !== false },
      include: { user: { select: USER_SUMMARY }, course: { select: COURSE_SUMMARY } },
    });

    // Best-effort heads-up; the request is on their dashboard either way.
    sendPaymentRequestEmail({
      to: user.email, name: user.name, itemTitle: programTitle(course), itemType: course.type,
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

// ---------- student: what a request costs, itemised ----------
// Same reply shape as the checkout's /payments/quote, so the payment screen can
// show the wallet credit before the student pays.
router.post("/me/payment-requests/:id/quote", requireAuth, async (req, res, next) => {
  try {
    const found = await loadPayableRequest(req.params.id, req.user.sub);
    if (found.error) return res.status(found.error.status).json({ ok: false, error: found.error.message });
    // Lapsed credit is taken back before the balance is priced in.
    await expireCredits(req.user.sub);
    const { pricing } = await priceRequest(found.request, req.user.sub);
    res.json({
      ok: true,
      planPrice: found.request.amount / 100,
      discountsAllowed: found.request.allowDiscounts !== false,
      creditApplied: pricing.creditApplied / 100,
      creditAvailable: pricing.availableCredit / 100,
      payable: pricing.payablePaise / 100,
      walletCoversAll: pricing.walletCoversAll,
      walletPayable: pricing.totalDuePaise / 100,
    });
  } catch (e) {
    next(e);
  }
});

// ---------- student: start paying a request ----------
// Body: { acceptTerms: true }. Charges the requested amount less any wallet
// credit (priceRequest).
router.post("/me/payment-requests/:id/create-order", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    if (isLiveBlocked) {
      return res.status(503).json({
        ok: false,
        error: "Live payments are disabled by a safety guard. Set ALLOW_LIVE_PAYMENTS=true in Backend/.env to enable real charges.",
      });
    }
    if (rejectWithoutTerms(req, res)) return;
    if (await rejectIfProfileIncomplete(req, res)) return;
    const found = await loadPayableRequest(req.params.id, req.user.sub);
    if (found.error) return res.status(found.error.status).json({ ok: false, error: found.error.message });
    const { request } = found;

    await expireCredits(request.userId);
    // A fresh try replaces any earlier unpaid order for this request, freeing its wallet credit.
    await releaseReservedCredit({ paymentRequestId: request.id, userId: request.userId });
    const { pricing } = await priceRequest(request, request.userId);
    const amountPaise = pricing.payablePaise;

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `preq_${request.id}`,
      notes: { paymentRequestId: String(request.id), courseSlug: request.course.slug },
    });

    const payment = await prisma.payment.create({
      data: {
        termsAcceptedAt: new Date(),
        razorpayOrderId: order.id,
        amount: amountPaise,
        status: "created",
        tier: request.tier,
        userId: request.userId,
        courseId: request.courseId,
        paymentRequestId: request.id,
        creditApplied: pricing.creditApplied,
        // The receipt starts from the requested amount; any discount shows as a discount.
        orderSnapshotBasePrice: request.amount / 100,
        orderSnapshotDiscountPercent: 0,
      },
    });

    res.status(201).json({
      ok: true,
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (e) {
    if (respondToRazorpayError(e, res)) return;
    next(e);
  }
});

// ---------- student: pay a request entirely from the wallet ----------
// When wallet credit covers the whole amount it's settled here — no Razorpay — the same way the checkout's
// /payments/pay-with-wallet does it, under a lock on the student's row so a
// second click can't spend the same credit twice.
router.post("/me/payment-requests/:id/pay-with-wallet", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    if (rejectWithoutTerms(req, res)) return;
    if (await rejectIfProfileIncomplete(req, res)) return;
    const found = await loadPayableRequest(req.params.id, req.user.sub);
    if (found.error) return res.status(found.error.status).json({ ok: false, error: found.error.message });
    const userId = req.user.sub;
    await expireCredits(userId);
    const result = await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      // Re-read under the lock: an admin may have cancelled it, or another tab paid it.
      const request = await tx.paymentRequest.findUnique({ where: { id: found.request.id } });
      if (!request || request.status !== "pending") {
        return { error: { status: 400, message: request && request.status === "paid" ? "This request has already been paid." : "This request was cancelled." } };
      }
      if (request.allowDiscounts === false) {
        return { error: { status: 400, message: "Wallet credit can't be used on this payment request." } };
      }
      const pricing = await priceOrder(userId, request.amount / 100, tx);
      if (!pricing.walletCoversAll) {
        return { error: { status: 400, message: "Your wallet doesn't have enough credit to pay for this in full." } };
      }
      const spendId = `${WALLET_ORDER_PREFIX}${crypto.randomUUID()}`;
      const payment = await tx.payment.create({
        data: {
          termsAcceptedAt: new Date(),
          razorpayOrderId: spendId,
          razorpayPaymentId: spendId,
          amount: 0, // nothing went through Razorpay; creditApplied is what was paid
          status: "paid",
          tier: request.tier,
          userId,
          courseId: request.courseId,
          paymentRequestId: request.id,
          creditApplied: pricing.totalDuePaise,
          orderSnapshotBasePrice: request.amount / 100,
          orderSnapshotDiscountPercent: 0,
        },
      });
      await tx.creditEntry.create({
        data: { userId, amount: -pricing.totalDuePaise, kind: "redeemed", paymentId: payment.id, note: "Paid a payment request from the wallet" },
      });
      // Settled inside the lock, so a second request for it is refused above.
      await tx.paymentRequest.update({
        where: { id: request.id },
        data: { status: "paid", paidAt: new Date(), paidPaymentId: payment.id },
      });
      return { payment };
    });
    if (result.error) return res.status(result.error.status).json({ ok: false, error: result.error.message });

    // Grants access, the receipt (and leaves the already-spent credit alone). The
    // credit is spent, so a hiccup gets one retry.
    let request;
    try {
      request = await grantAccessForRequestPayment(result.payment, result.payment.razorpayPaymentId);
    } catch (firstErr) {
      console.error("[payment-requests] wallet payment grant failed, retrying:", firstErr.message);
      request = await grantAccessForRequestPayment(result.payment, result.payment.razorpayPaymentId);
    }
    res.status(201).json({ ok: true, courseSlug: found.request.course.slug, enrolled: !!request });
  } catch (e) {
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
    const valid = safeEqual(expected, sig);
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
