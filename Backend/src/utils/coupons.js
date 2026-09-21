const { prisma } = require("../db");
const { MIN_CHARGE_PAISE } = require("./referrals");

// Offer codes: an admin creates them in the admin panel (routes/coupons.js) and
// a student enters one at checkout for a course or internship.
//
// All money in the pricing helpers is PAISE, like Payment.amount, unless a name
// says "Rupees". A code's own value is stored as entered: whole percent, or
// whole rupees.
//
// How a code combines with the referral programme (see priceOrder in
// utils/referrals.js): the offer code comes off the plan price FIRST, then the
// referral welcome discount is taken from what's left, then referral credit —
// and the buyer always pays at least ₹1.

// An order that was started but not paid still holds its place against a code's
// limits for this long — the same window referral credit uses — so two people
// can't both take the last redemption by having checkout open at once.
const RESERVATION_WINDOW_MS = 30 * 60 * 1000;

const CODE_MIN_LENGTH = 3;
const CODE_MAX_LENGTH = 20;

// People type codes in any case, with or without dashes/spaces. Codes are
// stored the same way, so "diwali-25", "DIWALI 25" and "Diwali25" are one code.
function normalizeCouponCode(input) {
  return String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// A code's discount on a plan, in paise. Whole rupees only, capped so the
// buyer is left paying at least ₹1 (Razorpay's minimum).
function couponDiscountPaise(coupon, planRupees) {
  let off;
  if (coupon.discountType === "percent") {
    off = Math.round((planRupees * coupon.discountValue) / 100);
    if (coupon.maxDiscount) off = Math.min(off, coupon.maxDiscount);
  } else {
    off = coupon.discountValue;
  }
  off = Math.min(off, planRupees - MIN_CHARGE_PAISE / 100);
  return Math.max(0, off) * 100;
}

function appliesToCourse(coupon, course) {
  switch (coupon.appliesTo) {
    case "course": return course.type === "course";
    case "internship": return course.type === "internship";
    case "selected": return Array.isArray(coupon.courseIds) && coupon.courseIds.includes(course.id);
    default: return true;
  }
}

// Redemptions that count against a code's limits: paid orders, plus orders
// started within the reservation window and not yet paid. `userId` narrows it
// to one student.
async function countUses(couponId, userId) {
  const since = new Date(Date.now() - RESERVATION_WINDOW_MS);
  return prisma.payment.count({
    where: {
      couponId,
      OR: [{ status: "paid" }, { status: "created", createdAt: { gte: since } }],
      ...(userId ? { application: { userId } } : {}),
    },
  });
}

// Is this code usable right now, by this student, on this plan? Returns
// { ok: true, coupon, discountPaise } or { ok: false, error } — the error is
// written for the student. Never trusts anything the client says about price.
async function checkCoupon({ rawCode, userId, course, planRupees }) {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, error: "Enter an offer code." };

  const coupon = await prisma.coupon.findUnique({ where: { code } });
  // A switched-off code answers the same as one that never existed.
  if (!coupon || !coupon.active) return { ok: false, error: "That offer code isn't valid." };

  const now = Date.now();
  if (coupon.startsAt && coupon.startsAt.getTime() > now) return { ok: false, error: "That offer code isn't active yet." };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now) return { ok: false, error: "That offer code has expired." };

  if (!appliesToCourse(coupon, course)) {
    return { ok: false, error: `That offer code doesn't apply to this ${course.type === "internship" ? "internship" : "course"}.` };
  }

  if (coupon.maxUses != null && (await countUses(coupon.id)) >= coupon.maxUses) {
    return { ok: false, error: "That offer code has been fully redeemed." };
  }
  if (userId && (await countUses(coupon.id, userId)) >= coupon.perUserLimit) {
    return { ok: false, error: "You've already used that offer code." };
  }

  const discountPaise = couponDiscountPaise(coupon, planRupees);
  if (discountPaise <= 0) return { ok: false, error: "That offer code doesn't reduce this price." };
  return { ok: true, coupon, discountPaise };
}

// Called right AFTER an order carrying the code has been saved. Two students
// can pass checkCoupon for the last redemption at the same moment; now that
// this order is counted, whoever pushed the total over the limit is turned
// away (worst case both retry — never an oversold code). Returns an error
// message, or null if all is well.
async function overLimitAfterReserving(coupon, userId) {
  if (coupon.maxUses != null && (await countUses(coupon.id)) > coupon.maxUses) {
    return "That offer code has just been fully redeemed.";
  }
  if (userId && (await countUses(coupon.id, userId)) > coupon.perUserLimit) {
    return "You've already used that offer code.";
  }
  return null;
}

module.exports = {
  CODE_MIN_LENGTH,
  CODE_MAX_LENGTH,
  normalizeCouponCode,
  couponDiscountPaise,
  appliesToCourse,
  countUses,
  checkCoupon,
  overLimitAfterReserving,
};
