const express = require("express");
const crypto = require("crypto");
const razorpay = require("../utils/razorpay");
const Payment = require("../models/Payment");
const Course = require("../models/Course");
const Application = require("../models/Application");
const Enrollment = require("../models/Enrollment");

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
    await Enrollment.findOneAndUpdate(
      { user: application.user, course: application.course },
      { user: application.user, course: application.course, payment: payment._id, status: "active" },
      { upsert: true, new: true }
    );
  }
  return application;
}

// ---------- 1. create an order (called right after the applicant submits the form) ----------
router.post("/create-order", async (req, res, next) => {
  try {
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

module.exports = router;
