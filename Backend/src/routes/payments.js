const express = require("express");
const crypto = require("crypto");
const { prisma } = require("../db");
const { razorpay, isLiveBlocked } = require("../utils/razorpay");
const { hasValidAccess, computeEndDate } = require("../utils/enrollmentAccess");
const { nextSequence } = require("../utils/counter");
const { round2 } = require("../utils/money");
const { WITH_TIERS, isTier, tierRank, tierTotal } = require("../utils/tiers");
const { getUpgradeOptions } = require("../utils/upgrades");
const { requireAuth } = require("../middleware/requireAuth");
const { buildReceiptPdfBuffer } = require("../utils/receiptPdf");
const { sendReceiptEmail } = require("../utils/mailer");
const { publicWriteLimiter } = require("../utils/rateLimit");

const router = express.Router();

// The Razorpay SDK rejects with { statusCode, error: { description } } —
// shapes the generic error handler can't read, so it would otherwise become a
// bare 500 "Server error" for the customer. Translates it into a clean 502 and
// returns true when it was one; false means "not a Razorpay error, next(e)".
function respondToRazorpayError(e, res) {
  if (!e || !e.statusCode) return false;
  if (e.statusCode === 401) {
    console.error(
      "Razorpay rejected the request (401) — RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET " +
      "in Backend/.env are wrong or still placeholders."
    );
    res.status(502).json({
      ok: false,
      error: "Payments aren't set up correctly yet. Please contact us on WhatsApp to complete your enrollment.",
    });
    return true;
  }
  console.error("Razorpay order create failed:", e.statusCode, e.error && e.error.description);
  res.status(502).json({ ok: false, error: (e.error && e.error.description) || "Payment gateway error" });
  return true;
}

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

    if (payment.fromTier) {
      // A plan upgrade: the student already has this course and paid the
      // difference to move up a plan. Only the plan changes — never the
      // start/end dates (that would relock the drip schedule or restart the
      // expiry window) — and enrollment.paymentId stays on the original
      // purchase. The rank check makes /verify + webhook both firing a no-op.
      if (existing && tierRank(payment.tier) > tierRank(existing.tier)) {
        await prisma.enrollment.update({ where: { id: existing.id }, data: { tier: payment.tier } });
      }
    } else if (hasValidAccess(existing)) {
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
          tier: payment.tier,
          status: "active",
          startDate,
          endDate,
        },
        update: { paymentId: payment.id, tier: payment.tier, status: "active", startDate, endDate },
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
    select: { title: true, type: true },
  });
  if (!course) return;

  // Prefer the price/discount as they were when the order was created
  // (payment.orderSnapshot*, see the field's doc comment in prisma/schema.prisma)
  // over the plan's current values — those can have moved since if an
  // admin edited pricing while this payment was in flight. Orders always carry
  // the snapshot; a payment somehow without one falls back to what was
  // actually charged, with no discount.
  const basePrice = round2(payment.orderSnapshotBasePrice != null ? payment.orderSnapshotBasePrice : (payment.amount || 0) / 100);
  const discountPercent = payment.orderSnapshotDiscountPercent != null ? payment.orderSnapshotDiscountPercent : 0;
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
      tier: payment.tier,
      fromTier: payment.fromTier,
      basePrice,
      discountPercent,
      discountAmount,
      totalPaid,
      paymentMode: receipt.paymentMode,
      razorpay_payment_id: payment.razorpayPaymentId,
    });
    await sendReceiptEmail({
      receipt: { receiptNumber, buyerName: receipt.buyerName, buyerEmail: receipt.buyerEmail, itemTitle: course.title, itemType: course.type, tier: payment.tier, fromTier: payment.fromTier, totalPaid },
      pdfBuffer,
    });
  } catch (mailErr) {
    console.error("[payments] receipt email failed:", mailErr.message);
  }
}

// ---------- 1. create an order (called right after the applicant submits the form) ----------
router.post("/create-order", publicWriteLimiter, async (req, res, next) => {
  try {
    if (isLiveBlocked) {
      return res.status(503).json({
        ok: false,
        error: "Live payments are disabled by a safety guard. Set ALLOW_LIVE_PAYMENTS=true in Backend/.env to enable real charges.",
      });
    }
    const { applicationId, courseSlug, tier: tierName } = req.body || {};
    if (!applicationId || !courseSlug) {
      return res.status(400).json({ ok: false, error: "applicationId and courseSlug are required" });
    }
    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application) return res.status(404).json({ ok: false, error: "Application not found" });

    const course = await prisma.course.findUnique({ where: { slug: courseSlug }, include: WITH_TIERS });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });
    if (course.status === "closed") {
      return res.status(400).json({ ok: false, error: "This course is currently closed for enrollment" });
    }
    // Server-side mirror of the frontend's own "Buy now only shows when
    // openForBuy" gating (at least one plan priced AND status open) — the
    // frontend button is not the only way to reach this endpoint. Without
    // this, an apply-only internship/course (no plans on purpose, meant to
    // only ever show "Request to apply"/"Request to enroll") would have no
    // price to charge, so it's rejected clearly instead.
    if (course.tiers.length === 0) {
      return res.status(400).json({ ok: false, error: "This course is not available for online purchase." });
    }
    // The buyer picks a plan; its price — never a client-sent amount — is
    // what gets charged.
    if (!isTier(tierName)) {
      return res.status(400).json({ ok: false, error: "Choose a plan (Basic, Plus or Pro) to continue." });
    }
    const plan = course.tiers.find((t) => t.tier === tierName);
    if (!plan) {
      return res.status(400).json({ ok: false, error: "That plan isn't available for this course." });
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

    const amountPaise = Math.round(tierTotal(plan) * 100); // Razorpay wants the smallest currency unit

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `app_${application.id}`,
      notes: { applicationId: String(application.id), courseSlug, tier: plan.tier },
    });

    const payment = await prisma.payment.create({
      data: {
        razorpayOrderId: order.id,
        amount: amountPaise,
        status: "created",
        applicationId: application.id,
        tier: plan.tier,
        // Snapshotted now, not re-read from the plan at grant time — see the
        // field's own doc comment in prisma/schema.prisma for why.
        orderSnapshotBasePrice: plan.price,
        orderSnapshotDiscountPercent: plan.discountPercent || 0,
      },
    });

    await prisma.application.update({
      where: { id: application.id },
      data: {
        paymentId: payment.id,
        tier: plan.tier,
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
    if (respondToRazorpayError(e, res)) return;
    next(e);
  }
});

// ---------- 1b. upgrade an existing plan (Basic -> Plus/Pro, Plus -> Pro) ----------
// What the logged-in student could upgrade to on a course, with what each step
// would cost — the single source of truth for the price the upgrade dialog
// shows and create-upgrade-order then charges.
router.get("/upgrade-options/:courseSlug", requireAuth, async (req, res, next) => {
  try {
    const course = await prisma.course.findUnique({ where: { slug: req.params.courseSlug }, include: WITH_TIERS });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });

    const result = await getUpgradeOptions(req.user.sub, course);
    if (!result.ok) return res.json({ ok: true, currentTier: null, options: [], reason: result.reason });

    res.json({
      ok: true,
      currentTier: result.currentTier,
      paid: result.paidPaise / 100,
      options: result.options.map((o) => ({ tier: o.tier, planPrice: o.planPaise / 100, due: o.duePaise / 100 })),
    });
  } catch (e) {
    next(e);
  }
});

// Creates the Razorpay order for an upgrade. Charges the difference between
// the target plan and everything already paid (see utils/upgrades.js) —
// computed here, never taken from the client. Needs a login, since the
// upgrade applies to the caller's own enrollment. Once paid, /verify or the
// webhook moves the enrollment up a plan via grantAccessForPayment.
router.post("/create-upgrade-order", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    if (isLiveBlocked) {
      return res.status(503).json({
        ok: false,
        error: "Live payments are disabled by a safety guard. Set ALLOW_LIVE_PAYMENTS=true in Backend/.env to enable real charges.",
      });
    }
    const { courseSlug, tier: tierName } = req.body || {};
    if (!courseSlug) return res.status(400).json({ ok: false, error: "courseSlug is required" });
    if (!isTier(tierName)) return res.status(400).json({ ok: false, error: "Choose a plan to upgrade to." });

    const course = await prisma.course.findUnique({ where: { slug: courseSlug }, include: WITH_TIERS });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });

    const result = await getUpgradeOptions(req.user.sub, course);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
    const option = result.options.find((o) => o.tier === tierName);
    if (!option) {
      return res.status(400).json({ ok: false, error: "That plan isn't an available upgrade from your current plan." });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(401).json({ ok: false, error: "Account not found" });

    // The grant and receipt paths work off an Application (who bought what),
    // so an upgrade gets one too. Marked contacted: nobody needs to follow up
    // on an upgrade, and it shouldn't show up as a new lead in the admin inbox.
    const application = await prisma.application.create({
      data: {
        type: course.type,
        refTitle: course.title,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        userId: user.id,
        courseId: course.id,
        tier: tierName,
        contacted: true,
      },
    });

    const order = await razorpay.orders.create({
      amount: option.duePaise,
      currency: "INR",
      receipt: `app_${application.id}`,
      notes: { applicationId: String(application.id), courseSlug, tier: tierName, upgradeFrom: result.currentTier },
    });

    const payment = await prisma.payment.create({
      data: {
        razorpayOrderId: order.id,
        amount: option.duePaise,
        status: "created",
        applicationId: application.id,
        tier: tierName,
        fromTier: result.currentTier,
        // The receipt for an upgrade is for the difference paid, undiscounted.
        orderSnapshotBasePrice: option.duePaise / 100,
        orderSnapshotDiscountPercent: 0,
      },
    });
    await prisma.application.update({ where: { id: application.id }, data: { paymentId: payment.id } });

    res.status(201).json({
      ok: true,
      orderId: order.id,
      amount: option.duePaise,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (e) {
    if (respondToRazorpayError(e, res)) return;
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
