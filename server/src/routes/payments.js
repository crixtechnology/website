const express = require("express");
const crypto = require("crypto");
const razorpay = require("../utils/razorpay");
const Payment = require("../models/Payment");
const Course = require("../models/Course");
const Application = require("../models/Application");

const router = express.Router();

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
    await application.save();

    res.status(201).json({
      ok: true,
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // public key id — safe to send to the frontend checkout widget
    });
  } catch (e) {
    next(e);
  }
});

// ---------- 2. Razorpay webhook — the only source of truth for "did this actually get paid" ----------
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

    if (entity && (event.event === "payment.captured" || event.event === "payment.failed")) {
      const payment = await Payment.findOne({ razorpay_order_id: entity.order_id });
      if (payment) {
        payment.razorpay_payment_id = entity.id;
        payment.status = event.event === "payment.captured" ? "paid" : "failed";
        await payment.save();
      }
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
