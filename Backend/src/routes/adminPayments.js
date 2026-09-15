const express = require("express");
const Payment = require("../models/Payment");
const { requireAdmin } = require("../middleware/requireAdmin");
const { searchRegex } = require("../utils/searchRegex");
const { round2 } = require("../utils/money");

const router = express.Router();

// Every real sale is a paid Payment with a receipt attached (see
// routes/payments.js's attachReceipt) — this is the one condition both
// endpoints below filter on, so a payment that's merely "created" (order
// started, never completed) or somehow paid without a receipt never shows
// up as revenue.
const PAID_WITH_RECEIPT = { status: "paid", "receipt.number": { $ne: null } };

// ---------- admin: revenue summary (totals + this month + by course) ----------
router.get("/admin/payments/summary", requireAdmin, async (req, res, next) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [totals, monthTotals, byCourse] = await Promise.all([
      Payment.aggregate([
        { $match: PAID_WITH_RECEIPT },
        { $group: { _id: null, revenue: { $sum: "$receipt.totalPaid" }, count: { $sum: 1 } } },
      ]),
      Payment.aggregate([
        { $match: { ...PAID_WITH_RECEIPT, createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, revenue: { $sum: "$receipt.totalPaid" }, count: { $sum: 1 } } },
      ]),
      // Grouped by course id where we have one (real Course purchases),
      // falling back to the receipt's own item title for the rare payment
      // whose course was since deleted — still real revenue, shouldn't
      // silently vanish from the breakdown just because the course is gone.
      Payment.aggregate([
        { $match: PAID_WITH_RECEIPT },
        {
          $group: {
            _id: { $ifNull: ["$course", "$receipt.itemTitle"] },
            title: { $first: "$receipt.itemTitle" },
            type: { $first: "$receipt.itemType" },
            revenue: { $sum: "$receipt.totalPaid" },
            count: { $sum: 1 },
          },
        },
        { $sort: { revenue: -1 } },
      ]),
    ]);

    res.json({
      ok: true,
      summary: {
        totalRevenue: round2(totals[0]?.revenue || 0),
        totalTransactions: totals[0]?.count || 0,
        thisMonthRevenue: round2(monthTotals[0]?.revenue || 0),
        thisMonthTransactions: monthTotals[0]?.count || 0,
        byCourse: byCourse.map((c) => ({
          courseId: typeof c._id === "string" ? null : c._id,
          title: c.title || "Untitled",
          type: c.type === "internship" ? "internship" : "course",
          revenue: round2(c.revenue || 0),
          count: c.count,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: transaction list (paginated + searchable) ----------
// Paginated from the start (unlike most other admin lists here, which fetch
// their whole collection unbounded) — this one is the most likely to grow
// large fast (a row per sale, not per course/user), so it doesn't repeat
// that gap on day one.
router.get("/admin/payments", requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const filter = { ...PAID_WITH_RECEIPT };
    if (q) {
      filter.$or = [
        { "receipt.buyerName": searchRegex(q) },
        { "receipt.buyerEmail": searchRegex(q) },
        { "receipt.itemTitle": searchRegex(q) },
        { "receipt.number": searchRegex(q) },
      ];
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Payment.countDocuments(filter),
    ]);

    res.json({
      ok: true,
      payments: payments.map((p) => ({
        paymentId: p._id,
        receiptNumber: p.receipt.number,
        buyerName: p.receipt.buyerName,
        buyerEmail: p.receipt.buyerEmail,
        itemTitle: p.receipt.itemTitle,
        itemType: p.receipt.itemType,
        totalPaid: p.receipt.totalPaid,
        createdAt: p.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
