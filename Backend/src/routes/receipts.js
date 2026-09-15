const express = require("express");
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

function serializeReceipt(payment) {
  const r = payment.receipt.toObject();
  return {
    paymentId: payment._id,
    razorpay_payment_id: payment.razorpay_payment_id,
    currency: payment.currency,
    receiptNumber: r.number,
    issuedAt: r.issuedAt,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
    buyerPhone: r.buyerPhone,
    itemType: r.itemType,
    itemTitle: r.itemTitle,
    basePrice: r.basePrice,
    discountPercent: r.discountPercent,
    discountAmount: r.discountAmount,
    totalPaid: r.totalPaid,
    paymentMode: r.paymentMode,
  };
}

// ---------- student: "My Receipts" list (every paid course/internship) ----------
router.get("/me/receipts", requireAuth, async (req, res, next) => {
  try {
    const payments = await Payment.find({
      user: req.user.sub,
      status: "paid",
      "receipt.number": { $ne: null },
    }).sort({ createdAt: -1 });

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
    if (!mongoose.isValidObjectId(req.params.paymentId)) {
      return res.status(404).json({ ok: false, error: "Receipt not found" });
    }
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment || payment.status !== "paid" || !payment.receipt || !payment.receipt.number) {
      return res.status(404).json({ ok: false, error: "Receipt not found" });
    }
    const isOwner = payment.user && String(payment.user) === req.user.sub;
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Not your receipt" });
    }

    res.json({ ok: true, receipt: serializeReceipt(payment) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
