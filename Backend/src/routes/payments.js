const express = require("express");
const crypto = require("crypto");
const { razorpay, isLiveBlocked } = require("../utils/razorpay");
const Payment = require("../models/Payment");
const Course = require("../models/Course");
const Application = require("../models/Application");
const Enrollment = require("../models/Enrollment");
const { hasValidAccess, computeEndDate } = require("../utils/enrollmentAccess");
const { nextSequence } = require("../models/Counter");
const { round2 } = require("../utils/money");
const { buildReceiptPdfBuffer } = require("../utils/receiptPdf");
const { sendReceiptEmail } = require("../utils/mailer");

const router = express.Router();

// Marks a payment paid and grants the matching course enrolment. Idempotent
// and safe to call from BOTH the browser-side /verify endpoint and the
// Razorpay webhook — whichever confirmation lands first does the work, the
// other becomes a no-op. Returns the Application (for its course slug).
async function grantAccessForPayment(payment, razorpayPaymentId) {
  if (payment.status !== "paid" || payment.razorpay_payment_id !== razorpayPaymentId) {
    payment.status = "paid";
    payment.razorpay_payment_id = razorpayPaymentId;
    await payment.save();
  }
  const application = await Application.findById(payment.application);
  if (application && application.user && application.course) {
    const existing = await Enrollment.findOne({ user: application.user, course: application.course });

    if (hasValidAccess(existing)) {
      // Already has valid access — this is /verify and the webhook both
      // firing for the SAME purchase, a genuinely idempotent no-op. Just
      // make sure payment/status are attached; don't touch startDate/
      // endDate, so a harmless duplicate call can't relock an in-progress
      // drip schedule or shift an already-running expiry window.
      await Enrollment.updateOne({ _id: existing._id }, { $set: { payment: payment._id, status: "active" } });
    } else {
      // A brand-new enrollment, or a fresh/renewed purchase of one that had
      // lapsed (expired, or manually revoked by an admin and re-bought) —
      // either way this is a real, fresh grant: full access starting now,
      // for as long as the course's own durationDays says (Backend/src/
      // models/Course.js) — no durationDays set means lifetime access.
      const course = await Course.findById(application.course).select("durationDays");
      const startDate = new Date();
      const endDate = computeEndDate(startDate, course && course.durationDays);
      await Enrollment.findOneAndUpdate(
        { user: application.user, course: application.course },
        { user: application.user, course: application.course, payment: payment._id, status: "active", startDate, endDate },
        { upsert: true, new: true }
      );
    }

    await attachReceipt(payment, application);
  }
  return application;
}

// Stamps a receipt snapshot onto the Payment the first time it's granted
// access. /verify and the webhook can both reach this for the SAME payment
// within milliseconds of each other in production — a plain "check
// payment.receipt.number, then mutate, then save()" is a real race there
// (two concurrent callers can both pass the check before either has saved),
// so the actual "did I win the right to mint this receipt" decision is a
// single atomic findOneAndUpdate matched on receipt.number still being
// null: only the caller whose update actually matches a document proceeds
// to build the PDF and send the email — the loser (if any) returns having
// changed nothing, no second number minted, no second email sent.
async function attachReceipt(payment, application) {
  if (payment.receipt && payment.receipt.number) return;

  const course = await Course.findById(application.course).select("title type price discountPercent");
  if (!course) return;

  // Prefer the price/discount as they were when the order was created
  // (payment.orderSnapshot, see its doc comment in models/Payment.js) over
  // the course's current values — those can have moved since if an admin
  // edited pricing while this payment was in flight. Older payments from
  // before orderSnapshot existed fall back to the live course, same as
  // this code always did.
  const snap = payment.orderSnapshot || {};
  const basePrice = round2(snap.basePrice != null ? snap.basePrice : course.price || 0);
  const discountPercent = snap.discountPercent != null ? snap.discountPercent : course.discountPercent || 0;
  const discountAmount = round2((basePrice * discountPercent) / 100);
  const totalPaid = round2((payment.amount || 0) / 100); // paise -> rupees, what was actually charged

  const seq = await nextSequence("receipt");
  const year = new Date().getFullYear();

  const receiptNumber = `CRX-${year}-${String(seq).padStart(5, "0")}`;
  const issuedAt = new Date();
  const receipt = {
    number: receiptNumber,
    issuedAt,
    buyerName: application.name || "",
    buyerEmail: application.email || "",
    buyerPhone: application.phone || "",
    itemType: course.type,
    itemTitle: course.title,
    basePrice,
    discountPercent,
    discountAmount,
    totalPaid,
    paymentMode: "Razorpay (Online)",
  };

  const won = await Payment.findOneAndUpdate(
    { _id: payment._id, "receipt.number": null },
    { $set: { user: application.user, course: application.course, receipt } },
    { new: true }
  );
  if (!won) return; // the other concurrent caller (verify vs webhook) got there first
  payment.user = won.user;
  payment.course = won.course;
  payment.receipt = won.receipt;

  // Best-effort — a failed/unconfigured email must never undo the receipt
  // that was just saved, or break the payment flow that led here (this runs
  // inside grantAccessForPayment, called from both /verify and the
  // webhook). The in-app "Download Receipt" button on /dashboard is the
  // reliable fallback if this doesn't go through.
  try {
    const pdfBuffer = buildReceiptPdfBuffer({
      receiptNumber,
      issuedAt,
      buyerName: payment.receipt.buyerName,
      buyerEmail: payment.receipt.buyerEmail,
      buyerPhone: payment.receipt.buyerPhone,
      itemType: course.type,
      itemTitle: course.title,
      basePrice,
      discountPercent,
      discountAmount,
      totalPaid,
      paymentMode: payment.receipt.paymentMode,
      razorpay_payment_id: payment.razorpay_payment_id,
    });
    await sendReceiptEmail({
      receipt: { receiptNumber, buyerName: payment.receipt.buyerName, buyerEmail: payment.receipt.buyerEmail, itemTitle: course.title, itemType: course.type, totalPaid },
      pdfBuffer,
    });
  } catch (mailErr) {
    console.error("[payments] receipt email failed:", mailErr.message);
  }
}

// ---------- 1. create an order (called right after the applicant submits the form) ----------
router.post("/create-order", async (req, res, next) => {
  try {
    if (isLiveBlocked) {
      return res.status(503).json({
        ok: false,
        error: "Live payments are disabled by a safety guard. Set ALLOW_LIVE_PAYMENTS=true in Backend/.env to enable real charges.",
      });
    }
    const { applicationId, courseSlug } = req.body || {};
    if (!applicationId || !courseSlug) {
      return res.status(400).json({ ok: false, error: "applicationId and courseSlug are required" });
    }
    const application = await Application.findById(applicationId);
    if (!application) return res.status(404).json({ ok: false, error: "Application not found" });

    const course = await Course.findOne({ slug: courseSlug });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });
    if (course.status === "closed") {
      return res.status(400).json({ ok: false, error: "This course is currently closed for enrollment" });
    }
    // Server-side mirror of the frontend's own "Buy now only shows when
    // openForBuy" gating (price set AND status open) — the frontend button
    // is not the only way to reach this endpoint. Without this, an
    // apply-only internship/course (price left null on purpose, meant to
    // only ever show "Request to apply"/"Request to enroll") would fall
    // through to `null * (1 - .../100)` below, silently coercing to a ₹0
    // Razorpay order instead of a clear rejection.
    if (course.price == null) {
      return res.status(400).json({ ok: false, error: "This course is not available for online purchase." });
    }

    // Don't let an already-enrolled, still-valid student pay again for the
    // same course — nothing before this point checks that, so a double
    // "Buy now" click, two open tabs, or someone re-running an old checkout
    // link could otherwise charge them a second time for access they
    // already have. Enrollment access itself is unaffected either way
    // (grantAccessForPayment already no-ops the enrollment side of a
    // genuine duplicate), this only stops the needless second charge.
    if (application.user) {
      const existingEnrollment = await Enrollment.findOne({ user: application.user, course: course._id });
      if (hasValidAccess(existingEnrollment)) {
        return res.status(400).json({ ok: false, error: "You already have access to this course." });
      }
    }

    const discounted = course.price * (1 - (course.discountPercent || 0) / 100);
    const amountPaise = Math.round(discounted * 100); // Razorpay wants the smallest currency unit

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `app_${application._id}`,
      notes: { applicationId: String(application._id), courseSlug },
    });

    const payment = await Payment.create({
      razorpay_order_id: order.id,
      amount: amountPaise,
      status: "created",
      application: application._id,
      // Snapshotted now, not re-read from Course at grant time — see the
      // field's own doc comment in models/Payment.js for why.
      orderSnapshot: { basePrice: course.price, discountPercent: course.discountPercent || 0 },
    });
    application.payment = payment._id;
    // Defense in depth: /applications already resolves+stores this when the
    // client sends courseSlug, but stamp it here too in case that didn't
    // happen — the webhook needs application.course to grant access.
    if (!application.course) application.course = course._id;
    await application.save();

    res.status(201).json({
      ok: true,
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // public key id — safe to send to the frontend checkout widget
    });
  } catch (e) {
    // The Razorpay SDK rejects with { statusCode, error: { description } } —
    // shapes the generic error handler can't read, so it would otherwise
    // become a bare 500 "Server error" for the customer. Translate it here.
    if (e && e.statusCode) {
      if (e.statusCode === 401) {
        console.error(
          "Razorpay rejected the request (401) — RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET " +
          "in Backend/.env are wrong or still placeholders."
        );
        return res.status(502).json({
          ok: false,
          error: "Payments aren't set up correctly yet. Please contact us on WhatsApp to complete your enrollment.",
        });
      }
      console.error("Razorpay order create failed:", e.statusCode, e.error && e.error.description);
      return res.status(502).json({ ok: false, error: (e.error && e.error.description) || "Payment gateway error" });
    }
    next(e);
  }
});

// ---------- 2. verify a payment from the browser (Razorpay Checkout `handler`) ----------
// Razorpay's servers can't reach a localhost webhook, and even in production
// the webhook can lag or the customer can close the tab — so the Checkout
// success callback posts { order_id, payment_id, signature } here and we
// confirm it by re-computing the HMAC with our key secret. This is the path
// that unlocks the course during local dev; the webhook below stays as the
// authoritative fallback in production. Both are idempotent.
router.post("/verify", async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ ok: false, error: "Missing payment confirmation fields" });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET || "";
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    const sig = String(razorpay_signature);
    const valid =
      expected.length === sig.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    if (!valid) return res.status(400).json({ ok: false, error: "Payment could not be verified." });

    const payment = await Payment.findOne({ razorpay_order_id });
    if (!payment) return res.status(404).json({ ok: false, error: "Payment record not found" });

    const application = await grantAccessForPayment(payment, razorpay_payment_id);

    let courseSlug = null;
    if (application && application.course) {
      const course = await Course.findById(application.course).select("slug");
      courseSlug = course ? course.slug : null;
    }
    res.json({
      ok: true,
      courseSlug,
      enrolled: !!(application && application.user && application.course),
    });
  } catch (e) {
    next(e);
  }
});

// ---------- 3. Razorpay webhook — the authoritative "did this actually get paid" in production ----------
// Registered in index.js with express.raw() so req.body here is the exact
// raw Buffer Razorpay signed — verifying against a re-parsed/re-stringified
// body would silently break signature verification.
router.post("/webhook", async (req, res, next) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!signature || !secret) return res.status(400).json({ ok: false, error: "Missing signature or secret" });

    const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");
    const valid =
      expected.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!valid) return res.status(400).json({ ok: false, error: "Invalid webhook signature" });

    const event = JSON.parse(req.body.toString("utf8"));
    const entity = event?.payload?.payment?.entity;

    if (entity && event.event === "payment.captured") {
      const payment = await Payment.findOne({ razorpay_order_id: entity.order_id });
      if (payment) await grantAccessForPayment(payment, entity.id);
    } else if (entity && event.event === "payment.failed") {
      const payment = await Payment.findOne({ razorpay_order_id: entity.order_id });
      if (payment && payment.status !== "paid") {
        payment.razorpay_payment_id = entity.id;
        payment.status = "failed";
        await payment.save();
      }
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Exported for scripts/backfillPaymentReceipts.js, which reuses this exact
// logic to mint receipts for payments that were granted access before the
// receipt feature existed.
module.exports = Object.assign(router, { attachReceipt });
