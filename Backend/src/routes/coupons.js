const express = require("express");
const { prisma } = require("../db");
const { requireAdmin } = require("../middleware/requireAdmin");
const { normalizeCouponCode, CODE_MIN_LENGTH, CODE_MAX_LENGTH } = require("../utils/coupons");

const router = express.Router();

// Admin-only CRUD for offer codes. Students never call these — they only ever
// enter a code at checkout (POST /api/payments/quote and /create-order).

const DISCOUNT_TYPES = ["percent", "fixed"];
const SCOPES = ["all", "course", "internship", "selected"];
const MAX_PERCENT = 90; // same ceiling as the referral welcome discount
const MAX_RUPEES = 100000;

// undefined = not sent (keep what's stored); null / "" = clear it.
const isBlank = (v) => v === null || v === "";

function parseWholeNumber(v, { min, max, label }) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return { error: `${label} must be a whole number from ${min} to ${max}.` };
  return { value: n };
}

function parseDate(v, label) {
  if (v === undefined || isBlank(v)) return { value: null };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { error: `${label} isn't a valid date.` };
  return { value: d };
}

// Validates a create (existing = null) or a partial update, and returns exactly
// the columns to write. Rules that depend on several fields (a percent can't
// exceed 90 but rupees can; "selected" needs courses) are checked against the
// values the code will END UP with, not just the ones in this request.
async function parseCoupon(body, existing) {
  const b = body || {};
  const has = (k) => b[k] !== undefined;
  const data = {};

  if (has("code") || !existing) {
    const code = normalizeCouponCode(b.code);
    if (code.length < CODE_MIN_LENGTH || code.length > CODE_MAX_LENGTH) {
      return { error: `The code must be ${CODE_MIN_LENGTH}-${CODE_MAX_LENGTH} letters or numbers.` };
    }
    data.code = code;
  }

  if (has("description")) {
    const d = String(b.description || "").trim();
    if (d.length > 120) return { error: "The description can be at most 120 characters." };
    data.description = d;
  }

  const type = has("discountType") ? b.discountType : existing && existing.discountType;
  if (!DISCOUNT_TYPES.includes(type)) return { error: "Choose whether the discount is a percentage or a fixed amount." };
  data.discountType = type;

  const valueRaw = has("discountValue") ? b.discountValue : existing && existing.discountValue;
  const value = type === "percent"
    ? parseWholeNumber(valueRaw, { min: 1, max: MAX_PERCENT, label: "The discount percentage" })
    : parseWholeNumber(valueRaw, { min: 1, max: MAX_RUPEES, label: "The discount amount (₹)" });
  if (value.error) return { error: value.error };
  data.discountValue = value.value;

  // "Up to ₹X off" only means something on a percentage code.
  if (type === "percent") {
    const capRaw = has("maxDiscount") ? b.maxDiscount : existing && existing.maxDiscount;
    if (capRaw === undefined || capRaw === null || capRaw === "") data.maxDiscount = null;
    else {
      const cap = parseWholeNumber(capRaw, { min: 1, max: MAX_RUPEES, label: "The maximum discount (₹)" });
      if (cap.error) return { error: cap.error };
      data.maxDiscount = cap.value;
    }
  } else {
    data.maxDiscount = null;
  }

  const scope = has("appliesTo") ? b.appliesTo : (existing && existing.appliesTo) || "all";
  if (!SCOPES.includes(scope)) return { error: "Choose what the code applies to." };
  data.appliesTo = scope;
  if (scope === "selected") {
    // An update that doesn't touch the list (e.g. just switching the code off)
    // leaves it alone — it must not start failing because a course it targets
    // was deleted since.
    const untouched = existing && existing.appliesTo === "selected" && !has("courseIds");
    if (!untouched) {
      const ids = has("courseIds") ? b.courseIds : existing && existing.courseIds;
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === "string" && i)) {
        return { error: "Pick at least one course or internship for this code." };
      }
      const unique = [...new Set(ids)];
      const found = await prisma.course.count({ where: { id: { in: unique } } });
      if (found !== unique.length) return { error: "One of the selected courses or internships no longer exists." };
      data.courseIds = unique;
    }
  } else {
    data.courseIds = [];
  }

  if (has("startsAt") || !existing) {
    const d = parseDate(b.startsAt, "The start date");
    if (d.error) return { error: d.error };
    data.startsAt = d.value;
  }
  if (has("expiresAt") || !existing) {
    const d = parseDate(b.expiresAt, "The expiry date");
    if (d.error) return { error: d.error };
    data.expiresAt = d.value;
  }
  const startsAt = data.startsAt !== undefined ? data.startsAt : existing && existing.startsAt;
  const expiresAt = data.expiresAt !== undefined ? data.expiresAt : existing && existing.expiresAt;
  if (startsAt && expiresAt && expiresAt <= startsAt) return { error: "The expiry must be after the start." };

  if (has("maxUses") || !existing) {
    if (b.maxUses === undefined || isBlank(b.maxUses)) data.maxUses = null;
    else {
      const m = parseWholeNumber(b.maxUses, { min: 1, max: 1000000, label: "The total number of uses" });
      if (m.error) return { error: m.error };
      data.maxUses = m.value;
    }
  }
  if (has("perUserLimit") || !existing) {
    const p = parseWholeNumber(has("perUserLimit") ? b.perUserLimit : 1, { min: 1, max: 100, label: "Uses per student" });
    if (p.error) return { error: p.error };
    data.perUserLimit = p.value;
  }

  if (has("active")) {
    if (typeof b.active !== "boolean") return { error: "active must be true or false." };
    data.active = b.active;
  }

  return { data };
}

// Where a code stands right now, for the admin list's badge.
function stateOf(c, redeemed) {
  const now = Date.now();
  if (!c.active) return "inactive";
  if (c.expiresAt && c.expiresAt.getTime() < now) return "expired";
  if (c.startsAt && c.startsAt.getTime() > now) return "scheduled";
  if (c.maxUses != null && redeemed >= c.maxUses) return "used-up";
  return "live";
}

function toAdmin(c, stats) {
  const redeemed = (stats && stats.count) || 0;
  return {
    _id: c.id,
    code: c.code,
    description: c.description,
    discountType: c.discountType,
    discountValue: c.discountValue,
    maxDiscount: c.maxDiscount,
    appliesTo: c.appliesTo,
    courseIds: Array.isArray(c.courseIds) ? c.courseIds : [],
    startsAt: c.startsAt,
    expiresAt: c.expiresAt,
    maxUses: c.maxUses,
    perUserLimit: c.perUserLimit,
    active: c.active,
    createdAt: c.createdAt,
    redeemed, // paid orders that used it
    totalDiscount: ((stats && stats.discountPaise) || 0) / 100, // rupees given away
    state: stateOf(c, redeemed),
  };
}

async function usageStats() {
  const rows = await prisma.payment.groupBy({
    by: ["couponId"],
    where: { couponId: { not: null }, status: "paid" },
    _count: { _all: true },
    _sum: { couponDiscount: true },
  });
  return new Map(rows.map((r) => [r.couponId, { count: r._count._all, discountPaise: r._sum.couponDiscount || 0 }]));
}

router.get("/admin/coupons", requireAdmin, async (req, res, next) => {
  try {
    const [coupons, stats] = await Promise.all([
      prisma.coupon.findMany({ orderBy: { createdAt: "desc" } }),
      usageStats(),
    ]);
    res.json({ ok: true, coupons: coupons.map((c) => toAdmin(c, stats.get(c.id))) });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/coupons", requireAdmin, async (req, res, next) => {
  try {
    const parsed = await parseCoupon(req.body, null);
    if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });
    try {
      const coupon = await prisma.coupon.create({ data: { active: true, ...parsed.data } });
      res.status(201).json({ ok: true, coupon: toAdmin(coupon) });
    } catch (e) {
      if (e && e.code === "P2002") return res.status(409).json({ ok: false, error: `A code named ${parsed.data.code} already exists.` });
      throw e;
    }
  } catch (e) {
    next(e);
  }
});

router.put("/admin/coupons/:id", requireAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ ok: false, error: "Offer code not found" });
    const parsed = await parseCoupon(req.body, existing);
    if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });
    try {
      const coupon = await prisma.coupon.update({ where: { id: existing.id }, data: parsed.data });
      const stats = (await usageStats()).get(coupon.id);
      res.json({ ok: true, coupon: toAdmin(coupon, stats) });
    } catch (e) {
      if (e && e.code === "P2002") return res.status(409).json({ ok: false, error: `A code named ${parsed.data.code} already exists.` });
      throw e;
    }
  } catch (e) {
    next(e);
  }
});

// A code that has been used is kept, so its history (and the "one use per
// student" rule) stays honest — switch it off instead of deleting it.
router.delete("/admin/coupons/:id", requireAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ ok: false, error: "Offer code not found" });
    const used = await prisma.payment.count({ where: { couponId: existing.id } });
    if (used > 0) {
      return res.status(409).json({ ok: false, error: `${existing.code} has already been used on ${used} order${used === 1 ? "" : "s"}, so it can't be deleted. Switch it off instead.` });
    }
    await prisma.coupon.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
