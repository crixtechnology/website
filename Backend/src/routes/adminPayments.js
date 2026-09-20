const express = require("express");
const { prisma } = require("../db");
const { requireAdmin } = require("../middleware/requireAdmin");
const { round2 } = require("../utils/money");

const { queryText } = require("../utils/validators");
const router = express.Router();

// Every real sale is a paid Payment with a receipt attached (see
// routes/payments.js's attachReceipt) — this is the one condition both
// endpoints below filter on, so a payment that's merely "created" (order
// started, never completed) or somehow paid without a receipt never shows
// up as revenue.
const PAID_WITH_RECEIPT = { status: "paid", receiptNumber: { not: null } };

// ---------- admin: revenue summary (totals + this month + by course) ----------
router.get("/admin/payments/summary", requireAdmin, async (req, res, next) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [totals, monthTotals, byCourse] = await Promise.all([
      prisma.payment.aggregate({
        where: PAID_WITH_RECEIPT,
        _sum: { receiptTotalPaid: true },
        _count: { _all: true },
      }),
      prisma.payment.aggregate({
        where: { ...PAID_WITH_RECEIPT, createdAt: { gte: startOfMonth } },
        _sum: { receiptTotalPaid: true },
        _count: { _all: true },
      }),
      // Grouped by course id where we have one (real Course purchases),
      // falling back to the receipt's own item title for the rare payment
      // whose course was since deleted — still real revenue, shouldn't
      // silently vanish from the breakdown just because the course is gone.
      // Prisma's groupBy() can't group on a computed COALESCE expression, so
      // this one stays raw SQL — the two plain sum/count queries above don't
      // need that.
      prisma.$queryRaw`
        SELECT ANY_VALUE(courseId) AS courseId,
               ANY_VALUE(receiptItemTitle) AS title,
               ANY_VALUE(receiptItemType) AS type,
               SUM(receiptTotalPaid) AS revenue,
               COUNT(*) AS count
        FROM payments
        WHERE status = 'paid' AND receiptNumber IS NOT NULL
        GROUP BY COALESCE(courseId, receiptItemTitle)
        ORDER BY revenue DESC
      `,
    ]);

    res.json({
      ok: true,
      summary: {
        totalRevenue: round2(totals._sum.receiptTotalPaid || 0),
        totalTransactions: totals._count._all || 0,
        thisMonthRevenue: round2(monthTotals._sum.receiptTotalPaid || 0),
        thisMonthTransactions: monthTotals._count._all || 0,
        byCourse: byCourse.map((c) => ({
          courseId: c.courseId || null,
          title: c.title || "Untitled",
          type: c.type === "internship" ? "internship" : "course",
          revenue: round2(Number(c.revenue) || 0),
          count: Number(c.count),
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
    const q = queryText(req.query.q);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const where = { ...PAID_WITH_RECEIPT };
    if (q) {
      where.OR = [
        { receiptBuyerName: { contains: q } },
        { receiptBuyerEmail: { contains: q } },
        { receiptItemTitle: { contains: q } },
        { receiptNumber: { contains: q } },
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.payment.count({ where }),
    ]);

    res.json({
      ok: true,
      payments: payments.map((p) => ({
        paymentId: p.id,
        receiptNumber: p.receiptNumber,
        buyerName: p.receiptBuyerName,
        buyerEmail: p.receiptBuyerEmail,
        itemTitle: p.receiptItemTitle,
        itemType: p.receiptItemType,
        tier: p.tier,
        totalPaid: p.receiptTotalPaid,
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
