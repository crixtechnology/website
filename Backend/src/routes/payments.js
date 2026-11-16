const express = require("express");
const crypto = require("crypto");
const { prisma } = require("../db");
const { isProgram, PROGRAM_WHERE, COURSES_DROPPED, programTitle } = require("../utils/programs");
const { safeEqual } = require("../utils/safeCompare");
const { razorpay, isLiveBlocked } = require("../utils/razorpay");
const { hasValidAccess, computeEndDate, accessStartFor } = require("../utils/enrollmentAccess");
const { issueReceiptNumber } = require("../utils/receiptNumber");
const { round2 } = require("../utils/money");
const { WITH_TIERS, WITH_SEATS, seatsOf, isTier, tierRank, tierTotal, listPriceOf } = require("../utils/tiers");
const { getUpgradeOptions } = require("../utils/upgrades");
const { requireAuth } = require("../middleware/requireAuth");
const { priceOrder, redeemCreditForPurchase, releaseReservedCredit } = require("../utils/pricing");
const { WALLET_ORDER_PREFIX, isWalletPayment, lockUser, expireCredits } = require("../utils/wallet");
const { buildReceiptPdfBuffer } = require("../utils/receiptPdf");
const { sendReceiptEmail } = require("../utils/mailer");
const { publicWriteLimiter } = require("../utils/rateLimit");
const { rejectWithoutTerms } = require("../utils/terms");
const { rejectIfProfileIncomplete } = require("../utils/accounts");

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
        select: { durationDays: true, startsAt: true },
      });
      // From the course's start date if it hasn't begun yet, else now.
      const startDate = accessStartFor(course);
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

    // A purchase spends the wallet credit the order was priced with. An upgrade doesn't use credit.
    if (!payment.fromTier) await redeemCreditForPurchase(payment, application);

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
    select: { title: true, type: true, durationDays: true },
  });
  if (!course) return;
  // The receipt names the length too: one domain is sold in several durations under one title.
  const itemTitle = programTitle(course);

  // Prefer the price/discount as they were when the order was created
  // (payment.orderSnapshot*, see the field's doc comment in prisma/schema.prisma)
  // over the plan's current values — those can have moved since if an
  // admin edited pricing while this payment was in flight. Orders always carry
  // the snapshot; a payment somehow without one falls back to what was
  // actually charged, with no discount.
  const basePrice = round2(payment.orderSnapshotBasePrice != null ? payment.orderSnapshotBasePrice : (payment.amount || 0) / 100);
  const discountPercent = payment.orderSnapshotDiscountPercent != null ? payment.orderSnapshotDiscountPercent : 0;
  // A purchase settled from the wallet took no Razorpay money — what the buyer
  // paid is the credit it spent, and the receipt says so.
  const fromWallet = isWalletPayment(payment);
  const totalPaid = round2(((payment.amount || 0) + (fromWallet ? payment.creditApplied || 0 : 0)) / 100); // paise -> rupees, what was actually charged
  // Derived from what was really charged rather than recomputed from the
  // percentage, so the receipt always adds up (base - discount = total) even
  // though the charge is rounded to whole rupees.
  const extraOff = (payment.referralDiscount || 0) + (payment.creditApplied || 0) + (payment.couponDiscount || 0) > 0;
  const discountAmount = discountPercent > 0 || extraOff ? round2(Math.max(0, basePrice - totalPaid)) : 0;
  // (referralDiscount / couponDiscount only on payments from before those were retired.)
  // With wallet credit or an old discount in the mix, the plain plan % no longer
  // describes the discount, so show the effective % of the list price instead.
  const effectiveDiscountPercent = extraOff && basePrice > 0 ? round2((discountAmount / basePrice) * 100) : discountPercent;

  const receipt = {
    buyerName: application.name || "",
    buyerEmail: application.email || "",
    buyerPhone: application.phone || "",
    itemType: course.type,
    itemTitle,
    basePrice,
    discountPercent: effectiveDiscountPercent,
    discountAmount,
    totalPaid,
    paymentMode: fromWallet ? "Wallet credit" : "Razorpay (Online)",
  };

  // Numbered from the one shared receipt counter (utils/receiptNumber.js).
  // null: the other concurrent caller (verify vs webhook) got there first.
  const issued = await issueReceiptNumber(payment.id, {
    ...(application.userId ? { userId: application.userId } : {}),
    ...(application.courseId ? { courseId: application.courseId } : {}),
    receiptBuyerName: receipt.buyerName,
    receiptBuyerEmail: receipt.buyerEmail,
    receiptBuyerPhone: receipt.buyerPhone,
    receiptItemType: receipt.itemType,
    receiptItemTitle: receipt.itemTitle,
    receiptBasePrice: receipt.basePrice,
    receiptDiscountPercent: receipt.discountPercent,
    receiptDiscountAmount: receipt.discountAmount,
    receiptTotalPaid: receipt.totalPaid,
    receiptPaymentMode: receipt.paymentMode,
  });
  if (!issued) return;
  const { receiptNumber, issuedAt } = issued;

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
      itemTitle,
      tier: payment.tier,
      fromTier: payment.fromTier,
      basePrice,
      discountPercent: effectiveDiscountPercent,
      discountAmount,
      totalPaid,
      paymentMode: receipt.paymentMode,
      razorpay_payment_id: fromWallet ? null : payment.razorpayPaymentId,
    });
    await sendReceiptEmail({
      receipt: { receiptNumber, buyerName: receipt.buyerName, buyerEmail: receipt.buyerEmail, itemTitle, itemType: course.type, tier: payment.tier, fromTier: payment.fromTier, totalPaid },
      pdfBuffer,
    });
  } catch (mailErr) {
    console.error("[payments] receipt email failed:", mailErr.message);
  }
}

// The course + plan a purchase is for, with every rule that decides whether it
// can be bought right now — shared by create-order and the price quote so they
// can never disagree. Returns { course, plan } or { error: { status, message } }.
async function loadPurchasablePlan(courseSlug, tierName, userId) {
  const course = await prisma.course.findUnique({ where: { slug: courseSlug }, include: WITH_SEATS });
  if (!isProgram(course)) return { error: { status: 404, message: "Program not found" } };
  if (course.status === "closed") {
    return { error: { status: 400, message: "This program is closed for enrollment right now." } };
  }
  // Server-side mirror of the frontend's own "Buy now only shows when
  // openForBuy" gating (at least one plan priced AND status open) — the
  // frontend button is not the only way to reach this endpoint. Without
  // this, an apply-only internship/course (no plans on purpose, meant to
  // only ever show "Request to apply"/"Request to enroll") would have no
  // price to charge, so it's rejected clearly instead.
  if (course.tiers.length === 0) {
    return { error: { status: 400, message: "This program can't be bought online — use Request to apply on its page." } };
  }
  // The buyer picks a plan; its price — never a client-sent amount — is
  // what gets charged.
  if (!isTier(tierName)) {
    return { error: { status: 400, message: "Choose a plan (Basic, Plus or Pro) to continue." } };
  }
  const plan = course.tiers.find((t) => t.tier === tierName);
  if (!plan) return { error: { status: 400, message: "That plan isn't available for this program." } };

  // Don't let an already-enrolled, still-valid student pay again for the
  // same course — a double "Buy now" click, two open tabs, or someone
  // re-running an old checkout link could otherwise charge them a second time
  // for access they already have.
  const existingEnrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
  });
  if (hasValidAccess(existingEnrollment)) {
    return {
      error: {
        status: 400,
        message: existingEnrollment.tier
          ? "You already have access to this program. To move to a higher plan, use \"Upgrade plan\" in My Dashboard."
          : "You already have access to this program.",
      },
    };
  }
  // Every place taken. Someone renewing their own lapsed access already holds one.
  const seats = seatsOf(course);
  if (seats && seats.left === 0 && !existingEnrollment) {
    return { error: { status: 400, message: "All positions for this program are filled." } };
  }
  return { course, plan };
}

// What checkout will charge for a plan, itemised, so the buy popup can show it
// before the student pays: plan price, wallet credit, total. Same pricing code
// create-order uses. Amounts are in rupees.
router.post("/quote", requireAuth, async (req, res, next) => {
  try {
    const { courseSlug, tier: tierName } = req.body || {};
    if (!courseSlug) return res.status(400).json({ ok: false, error: "courseSlug is required" });
    const found = await loadPurchasablePlan(courseSlug, tierName, req.user.sub);
    if (found.error) return res.status(found.error.status).json({ ok: false, error: found.error.message });
    // Lapsed credit is taken back before the balance is priced in.
    await expireCredits(req.user.sub);

    const planRupees = tierTotal(found.plan);
    // Credit held by an earlier, unpaid try at this same program is shown as
    // usable: starting the checkout frees it (create-order / pay-with-wallet).
    const pricing = await priceOrder(req.user.sub, planRupees, undefined, { replacing: earlierTriesAt(req.user.sub, found.course.id) });
    res.json({
      ok: true,
      planPrice: planRupees,
      creditApplied: pricing.creditApplied / 100,
      creditAvailable: pricing.availableCredit / 100,
      payable: pricing.payablePaise / 100,
      // The wallet can settle the whole order on its own (no Razorpay): the
      // buy popup then offers "Pay with wallet" for this amount.
      walletCoversAll: pricing.walletCoversAll,
      walletPayable: pricing.totalDuePaise / 100,
    });
  } catch (e) {
    next(e);
  }
});

// The unpaid program orders a new checkout for `courseId` replaces: the buyer's
// earlier tries at buying it (not plan upgrades), whose wallet credit is then
// freed (utils/pricing.js releaseReservedCredit).
const earlierTriesAt = (userId, courseId, applicationId) => ({
  fromTier: null,
  paymentRequestId: null,
  application: { userId, OR: [{ courseId }, ...(applicationId ? [{ id: applicationId }] : [])] },
});

// The checks create-order and pay-with-wallet share: the request is well-formed,
// the application is the caller's own, and the plan can be bought right now.
// Returns { error: { status, message } } or { application, course, plan }.
async function prepareOrder(req) {
  const { applicationId, courseSlug, tier: tierName } = req.body || {};
  if (!applicationId || !courseSlug) {
    return { error: { status: 400, message: "applicationId and courseSlug are required" } };
  }
  if (typeof applicationId !== "string" || typeof courseSlug !== "string") {
    return { error: { status: 400, message: "applicationId and courseSlug must be text" } };
  }
  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  // Only the account the application belongs to can pay for it. This is also what
  // keeps an application with no account (a guest form filled in while logged out)
  // from taking a payment it could never unlock, and stops anyone who learned
  // someone else's application id from opening orders — or reserving their wallet
  // credit — on their behalf. Same answer for "missing" and "not yours".
  if (!application || !application.userId || application.userId !== req.user.sub) {
    return { error: { status: 404, message: "Application not found" } };
  }

  const found = await loadPurchasablePlan(courseSlug, tierName, application.userId);
  if (found.error) return { error: found.error };
  const { course, plan } = found;

  // Lapsed credit is taken back before the balance is priced in.
  await expireCredits(application.userId);
  return { application, course, plan };
}

// ---------- 1. create an order (called right after the applicant submits the form) ----------
router.post("/create-order", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    if (isLiveBlocked) {
      return res.status(503).json({
        ok: false,
        error: "Live payments are disabled by a safety guard. Set ALLOW_LIVE_PAYMENTS=true in Backend/.env to enable real charges.",
      });
    }
    if (rejectWithoutTerms(req, res)) return;
    if (await rejectIfProfileIncomplete(req, res)) return;
    // What this buyer really pays: the plan price less any wallet credit they hold
    // (utils/pricing.js) — worked out on the server, never taken from the client.
    const prepared = await prepareOrder(req);
    if (prepared.error) return res.status(prepared.error.status).json({ ok: false, error: prepared.error.message });
    const { application, course, plan } = prepared;

    // A new checkout for this program replaces any earlier one the buyer left
    // unpaid (closed Checkout, closed the tab): that order's wallet credit is
    // freed so this one is priced with all of it again.
    await releaseReservedCredit(earlierTriesAt(application.userId, course.id, application.id));

    const pricing = await priceOrder(application.userId, tierTotal(plan));
    const amountPaise = pricing.payablePaise; // whole rupees in paise, Razorpay's smallest unit

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `app_${application.id}`,
      notes: { applicationId: String(application.id), courseSlug: course.slug, tier: plan.tier },
    });

    const payment = await prisma.payment.create({
      data: {
        termsAcceptedAt: new Date(),
        razorpayOrderId: order.id,
        amount: amountPaise,
        status: "created",
        applicationId: application.id,
        tier: plan.tier,
        creditApplied: pricing.creditApplied,
        // Snapshotted now, not re-read from the plan at grant time — see the
        // field's own doc comment in prisma/schema.prisma for why.
        orderSnapshotBasePrice: listPriceOf(plan).basePrice,
        orderSnapshotDiscountPercent: listPriceOf(plan).discountPercent,
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

// ---------- 1b. the buyer closed Checkout without paying ----------
// Body: { orderId }. Called by the site whenever Razorpay Checkout ends without
// a success (closed, failed, timed out). Frees the wallet credit the order was
// priced with, so the wallet and the next checkout can use it straight away
// instead of 30 minutes later. Only the caller's own unpaid order is touched;
// an order Razorpay already reports as paid is left for the webhook.
router.post("/release", requireAuth, async (req, res, next) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId || typeof orderId !== "string") return res.status(400).json({ ok: false, error: "orderId is required" });
    const userId = req.user.sub;
    const where = { razorpayOrderId: orderId, OR: [{ application: { userId } }, { userId }] };
    const payment = await prisma.payment.findFirst({ where: { ...where, status: "created" }, select: { id: true } });
    if (!payment) return res.json({ ok: true, released: false });
    try {
      const order = await razorpay.orders.fetch(orderId);
      if (order && order.status === "paid") return res.json({ ok: true, released: false });
    } catch (e) {
      // Can't ask Razorpay: release anyway — a late capture is still granted.
      console.warn("[payments] release: could not fetch order", orderId, e && (e.message || e.statusCode));
    }
    const count = await releaseReservedCredit({ id: payment.id });
    res.json({ ok: true, released: count > 0 });
  } catch (e) {
    next(e);
  }
});

// ---------- 1a. pay for an order entirely from the wallet ----------
// Same request as create-order, but when the student's wallet credit
// (utils/wallet.js) covers the whole price it is settled right here — no Razorpay
// order, nothing to confirm afterwards: the credit is spent, the payment is
// recorded as paid, and access and the receipt are granted in the same call. A
// wallet that falls short is refused (the buy popup only offers this when the quote
// says walletCoversAll; otherwise credit is simply applied as a discount, as before).
router.post("/pay-with-wallet", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    if (rejectWithoutTerms(req, res)) return;
    if (await rejectIfProfileIncomplete(req, res)) return;
    const prepared = await prepareOrder(req);
    if (prepared.error) return res.status(prepared.error.status).json({ ok: false, error: prepared.error.message });
    const { application, course, plan } = prepared;
    const userId = application.userId;

    const result = await prisma.$transaction(async (tx) => {
      // Everything below runs under a lock on the student's row, so a second
      // request (double click, another tab) waits and then sees the spent balance.
      await lockUser(tx, userId);

      const enrollment = await tx.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: course.id } } });
      if (hasValidAccess(enrollment)) return { error: { status: 400, message: "You already have access to this program." } };

      // Paying now replaces any unpaid Razorpay try at this program: free its credit.
      await releaseReservedCredit(earlierTriesAt(userId, course.id, application.id), tx);
      const pricing = await priceOrder(userId, tierTotal(plan), tx);
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
          applicationId: application.id,
          tier: plan.tier,
          creditApplied: pricing.totalDuePaise,
          orderSnapshotBasePrice: listPriceOf(plan).basePrice,
          orderSnapshotDiscountPercent: listPriceOf(plan).discountPercent,
        },
      });
      await tx.creditEntry.create({
        data: { userId, amount: -pricing.totalDuePaise, kind: "redeemed", paymentId: payment.id, note: "Paid for a training program from the wallet" },
      });
      await tx.application.update({
        where: { id: application.id },
        data: { paymentId: payment.id, tier: plan.tier, ...(application.courseId ? {} : { courseId: course.id }) },
      });
      // Access is granted here, inside the lock, rather than only afterwards: a
      // second request for the same course (another tab, a fresh application)
      // then finds the enrollment above and is refused instead of paying twice.
      // Same fields as a fresh grant in grantAccessForPayment, which will find
      // this and leave the dates alone.
      const startDate = accessStartFor(course);
      await tx.enrollment.upsert({
        where: { userId_courseId: { userId, courseId: course.id } },
        create: { userId, courseId: course.id, paymentId: payment.id, tier: plan.tier, status: "active", startDate, endDate: computeEndDate(startDate, course.durationDays) },
        update: { paymentId: payment.id, tier: plan.tier, status: "active", startDate, endDate: computeEndDate(startDate, course.durationDays) },
      });
      return { payment };
    });
    if (result.error) return res.status(result.error.status).json({ ok: false, error: result.error.message });
    const { payment } = result;

    // Access already exists; this adds the receipt. It's
    // idempotent, and the credit is spent, so a hiccup gets one retry.
    let granted;
    try {
      granted = await grantAccessForPayment(payment, payment.razorpayPaymentId);
    } catch (firstErr) {
      console.error("[payments] wallet purchase grant failed, retrying:", firstErr.message);
      granted = await grantAccessForPayment(payment, payment.razorpayPaymentId);
    }
    res.status(201).json({
      ok: true,
      courseSlug: course.slug,
      enrolled: !!(granted && granted.userId && granted.courseId),
    });
  } catch (e) {
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
    if (!isProgram(course)) return res.status(404).json({ ok: false, error: "Program not found" });

    const result = await getUpgradeOptions(req.user.sub, course);
    if (!result.ok) return res.json({ ok: true, currentTier: null, options: [], reason: result.reason });

    res.json({
      ok: true,
      currentTier: result.currentTier,
      paid: result.paidPaise / 100,
      options: result.options.map((o) => ({ tier: o.tier, planPrice: o.planPaise / 100, due: o.duePaise / 100 })),
      ...(result.note ? { reason: result.note } : {}),
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
    if (rejectWithoutTerms(req, res)) return;
    if (await rejectIfProfileIncomplete(req, res)) return;
    const { courseSlug, tier: tierName } = req.body || {};
    if (!courseSlug) return res.status(400).json({ ok: false, error: "courseSlug is required" });
    if (!isTier(tierName)) return res.status(400).json({ ok: false, error: "Choose a plan to upgrade to." });

    const course = await prisma.course.findUnique({ where: { slug: courseSlug }, include: WITH_TIERS });
    if (!isProgram(course)) return res.status(404).json({ ok: false, error: "Program not found" });

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
        refTitle: programTitle(course),
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
        termsAcceptedAt: new Date(),
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
    const valid = safeEqual(expected, sig);
    if (!valid) return res.status(400).json({ ok: false, error: "Payment could not be verified." });

    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: razorpay_order_id } });
    // Payments for admin requests are confirmed at /payment-requests/verify, and
    // aptitude-test fees at /careers/verify.
    if (!payment || payment.paymentRequestId || payment.jobApplicationId) return res.status(404).json({ ok: false, error: "Payment record not found" });

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
    const valid = safeEqual(expected, signature);
    if (!valid) return res.status(400).json({ ok: false, error: "Invalid webhook signature" });

    const event = JSON.parse(req.body.toString("utf8"));
    const entity = event?.payload?.payment?.entity;

    if (entity && event.event === "payment.captured") {
      const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: entity.order_id } });
      // A payment an admin requested (routes/paymentRequests.js) has its own
      // grant path; required here, not at the top, since that file requires this one.
      if (payment && payment.paymentRequestId) await require("./paymentRequests").grantAccessForRequestPayment(payment, entity.id);
      // (An old aptitude-test fee payment carries jobApplicationId; tests are free now, so it is left alone.)
      else if (payment && payment.jobApplicationId) { /* nothing to grant */ }
      else if (payment) await grantAccessForPayment(payment, entity.id);
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
