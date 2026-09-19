const express = require("express");
const { prisma } = require("../db");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

function serializeReceipt(payment) {
  return {
    paymentId: payment.id,
    razorpay_payment_id: payment.razorpayPaymentId,
    currency: payment.currency,
    receiptNumber: payment.receiptNumber,
    issuedAt: payment.receiptIssuedAt,
    buyerName: payment.receiptBuyerName,
    buyerEmail: payment.receiptBuyerEmail,
    buyerPhone: payment.receiptBuyerPhone,
    itemType: payment.receiptItemType,
    itemTitle: payment.receiptItemTitle,
    tier: payment.tier,
    fromTier: payment.fromTier,
    courseId: payment.courseId,
    basePrice: payment.receiptBasePrice,
    discountPercent: payment.receiptDiscountPercent,
    discountAmount: payment.receiptDiscountAmount,
    totalPaid: payment.receiptTotalPaid,
    paymentMode: payment.receiptPaymentMode,
  };
}

// ---------- student: "My Receipts" list (every paid course/internship) ----------
router.get("/me/receipts", requireAuth, async (req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { userId: req.user.sub, status: "paid", receiptNumber: { not: null } },
      orderBy: { createdAt: "desc" },
    });

    res.json({ ok: true, receipts: payments.map(serializeReceipt) });
  } catch (e) {
    next(e);
  }
});

// ---------- fetch one receipt's full details (for PDF generation) ----------
// Open to the buyer themself or an admin — not to any other logged-in
// student, since a receipt carries personal purchase details.
router.get("/receipts/:paymentId", requireAuth, async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.paymentId } });
    if (!payment || payment.status !== "paid" || !payment.receiptNumber) {
      return res.status(404).json({ ok: false, error: "Receipt not found" });
    }
    const isOwner = payment.userId && payment.userId === req.user.sub;
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Not your receipt" });
    }

    res.json({ ok: true, receipt: serializeReceipt(payment) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
