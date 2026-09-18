const express = require("express");
const crypto = require("crypto");
const { prisma } = require("../db");
const { razorpay, isLiveBlocked } = require("../utils/razorpay");
const { hasValidAccess, computeEndDate } = require("../utils/enrollmentAccess");
const { nextSequence } = require("../utils/counter");
const { round2 } = require("../utils/money");
const { buildReceiptPdfBuffer } = require("../utils/receiptPdf");
const { sendReceiptEmail } = require("../utils/mailer");

const router = express.Router();

// Marks a payment paid and grants the matching course enrolment. Idempotent
// and safe to call from BOTH the browser-side /verify endpoint and the
// Razorpay webhook — whichever confirmation lands first does the work, the
// other becomes a no-op. Returns the Application (for its course slug).
async function grantAccessForPayment(payment, razorpayPaymentId) {
  if (payment.status !== "paid" || payment.razorpayPaymentId !== razorpayPaymentId) {
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "paid", razorpayPaymentId },
    });
  }
  const application = payment.applicationId
    ? await prisma.application.findUnique({ where: { id: payment.applicationId } })
    : null;
  if (application && application.userId && application.courseId) {
    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: application.userId, courseId: application.courseId } },
    });

    if (hasValidAccess(existing)) {
      // Already has valid access — this is /verify and the webhook both
      // firing for the SAME purchase, a genuinely idempotent no-op. Just
      // make sure payment/status are attached; don't touch startDate/
      // endDate, so a harmless duplicate call can't relock an in-progress
      // drip schedule or shift an already-running expiry window.
      await prisma.enrollment.update({
        where: { id: existing.id },
        data: { paymentId: payment.id, status: "active" },
      });
    } else {
      // A brand-new enrollment, or a fresh/renewed purchase of one that had
      // lapsed (expired, or manually revoked by an admin and re-bought) —
      // either way this is a real, fresh grant: full access starting now,
      // for as long as the course's own durationDays says (prisma/schema.prisma) —
      // no durationDays set means lifetime access.
      const course = await prisma.course.findUnique({
        where: { id: application.courseId },
        select: { durationDays: true },
      });
      const startDate = new Date();
      const endDate = computeEndDate(startDate, course && course.durationDays);
      await prisma.enrollment.upsert({
        where: { userId_courseId: { userId: application.userId, courseId: application.courseId } },
        create: {
          userId: application.userId,
          courseId: application.courseId,
          paymentId: payment.id,
          status: "active",
          startDate,
          endDate,
        },
        update: { paymentId: payment.id, status: "active", startDate, endDate },
      });
    }

    await attachReceipt(payment, application);
  }
  return application;
}

// Stamps a receipt snapshot onto the Payment the first time it's granted
// access. /verify and the webhook can both reach this for the SAME payment
// within milliseconds of each other in production — a plain "check
// receiptNumber, then mutate, then save" is a real race there (two
// concurrent callers can both pass the check before either has written), so
// the actual "did I win the right to mint this receipt" decision is a single
// atomic UPDATE ... WHERE id = ? AND receiptNumber IS NULL: only the caller
// whose UPDATE actually affects a row (MySQL row-locks the matched row for
// the statement, so two concurrent UPDATEs can't both match) proceeds to
// build the PDF and send the email — the loser returns having changed
// nothing, no second number minted, no second email sent.
async function attachReceipt(payment, application) {
  if (payment.receiptNumber) return;

  const course = await prisma.course.findUnique({
    where: { id: application.courseId },
    select: { title: true, type: true, price: true, discountPercent: true },
  });
  if (!course) return;

  // Prefer the price/discount as they were when the order was created
  // (payment.orderSnapshot*, see the field's doc comment in prisma/schema.prisma)
  // over the course's current values — those can have moved since if an
  // admin edited pricing while this payment was in flight. Older payments
  // from before orderSnapshot existed fall back to the live course, same as
  // this code always did.
  const basePrice = round2(payment.orderSnapshotBasePrice != null ? payment.orderSnapshotBasePrice : course.price || 0);
  const discountPercent = payment.orderSnapshotDiscountPercent != null ? payment.orderSnapshotDiscountPercent : course.discountPercent || 0;
  const discountAmount = round2((basePrice * discountPercent) / 100);
  const totalPaid = round2((payment.amount || 0) / 100); // paise -> rupees, what was actually charged

  const seq = await nextSequence("receipt");
  const year = new Date().getFullYear();

  const receiptNumber = `CRX-${year}-${String(seq).padStart(5, "0")}`;
  const issuedAt = new Date();
  const receipt = {
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

  const affected = await prisma.$executeRaw`
    UPDATE payments
    SET userId = ${application.userId},
        courseId = ${application.courseId},
        receiptNumber = ${receiptNumber},
        receiptIssuedAt = ${issuedAt},
        receiptBuyerName = ${receipt.buyerName},
        receiptBuyerEmail = ${receipt.buyerEmail},
        receiptBuyerPhone = ${receipt.buyerPhone},
        receiptItemType = ${receipt.itemType},
        receiptItemTitle = ${receipt.itemTitle},
        receiptBasePrice = ${receipt.basePrice},
        receiptDiscountPercent = ${receipt.discountPercent},
        receiptDiscountAmount = ${receipt.discountAmount},
        receiptTotalPaid = ${receipt.totalPaid},
        receiptPaymentMode = ${receipt.paymentMode}
    WHERE id = ${payment.id} AND receiptNumber IS NULL
  `;
  if (affected === 0) return; // the other concurrent caller (verify vs webhook) got there first

  // Best-effort — a failed/unconfigured email must never undo the receipt
  // that was just saved, or break the payment flow that led here (this runs
  // inside grantAccessForPayment, called from both /verify and the
  // webhook). The in-app "Download Receipt" button on /dashboard is the
  // reliable fallback if this doesn't go through.
  try {
    const pdfBuffer = buildReceiptPdfBuffer({
      receiptNumber,
      issuedAt,
      buyerName: receipt.buyerName,
      buyerEmail: receipt.buyerEmail,
      buyerPhone: receipt.buyerPhone,
      itemType: course.type,
      itemTitle: course.title,
      basePrice,
      discountPercent,
      discountAmount,
      totalPaid,
      paymentMode: receipt.paymentMode,
      razorpay_payment_id: payment.razorpayPaymentId,
    });
    await sendReceiptEmail({
      receipt: { receiptNumber, buyerName: receipt.buyerName, buyerEmail: receipt.buyerEmail, itemTitle: course.title, itemType: course.type, totalPaid },
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
    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application) return res.status(404).json({ ok: false, error: "Application not found" });

    const course = await prisma.course.findUnique({ where: { slug: courseSlug } });
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
    if (application.userId) {
      const existingEnrollment = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: application.userId, courseId: course.id } },
      });
      if (hasValidAccess(existingEnrollment)) {
        return res.status(400).json({ ok: false, error: "You already have access to this course." });
      }
    }

    const discounted = course.price * (1 - (course.discountPercent || 0) / 100);
    const amountPaise = Math.round(discounted * 100); // Razorpay wants the smallest currency unit

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `app_${application.id}`,
      notes: { applicationId: String(application.id), courseSlug },
    });

    const payment = await prisma.payment.create({
      data: {
        razorpayOrderId: order.id,
        amount: amountPaise,
        status: "created",
        applicationId: application.id,
        // Snapshotted now, not re-read from Course at grant time — see the
        // field's own doc comment in prisma/schema.prisma for why.
        orderSnapshotBasePrice: course.price,
        orderSnapshotDiscountPercent: course.discountPercent || 0,
      },
    });

    await prisma.application.update({
      where: { id: application.id },
      data: {
        paymentId: payment.id,
        // Defense in depth: /applications already resolves+stores this when
        // the client sends courseSlug, but stamp it here too in case that
        // didn't happen — the webhook needs application.course to grant access.
        ...(application.courseId ? {} : { courseId: course.id }),
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

    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: razorpay_order_id } });
    if (!payment) return res.status(404).json({ ok: false, error: "Payment record not found" });

    const application = await grantAccessForPayment(payment, razorpay_payment_id);

    let courseSlug = null;
    if (application && application.courseId) {
      const course = await prisma.course.findUnique({ where: { id: application.courseId }, select: { slug: true } });
      courseSlug = course ? course.slug : null;
    }
    res.json({
      ok: true,
      courseSlug,
      enrolled: !!(application && application.userId && application.courseId),
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
      const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: entity.order_id } });
      if (payment) await grantAccessForPayment(payment, entity.id);
    } else if (entity && event.event === "payment.failed") {
      const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: entity.order_id } });
      if (payment && payment.status !== "paid") {
        await prisma.payment.update({ where: { id: payment.id }, data: { razorpayPaymentId: entity.id, status: "failed" } });
      }
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Exported for scripts (receipt backfills), which reuse this exact logic to
// mint receipts for payments that were granted access before the receipt
// feature existed.
module.exports = Object.assign(router, { attachReceipt });
