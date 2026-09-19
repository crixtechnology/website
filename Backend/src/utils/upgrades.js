const { prisma } = require("../db");
const { hasValidAccess } = require("./enrollmentAccess");
const { tierRank, tierTotal } = require("./tiers");

// Razorpay's smallest chargeable order is ₹1. A "difference" below that (the
// higher plan is priced at or below what's already been paid) can't be sold
// as an upgrade, so it's not offered rather than creating an unpayable order.
const MIN_UPGRADE_PAISE = 100;

// What a student can upgrade to on a course, and what each step costs.
//
// The price of an upgrade is the target plan's current price minus everything
// the student has already paid for this course (the original purchase plus any
// earlier upgrades), so Basic -> Plus -> Pro costs the same in total as going
// straight from Basic to Pro. Amounts are paise, like Payment.amount.
//
// `course` must include its tiers (see WITH_TIERS). Returns
//   { ok: true, currentTier, paidPaise, options: [{ tier, planPaise, duePaise }] }
// — `options` is empty when they're already on the top plan — or
//   { ok: false, reason } when upgrading isn't possible at all.
async function getUpgradeOptions(userId, course) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
  });
  if (!hasValidAccess(enrollment)) {
    return { ok: false, reason: "You don't have access to this course, so there's nothing to upgrade." };
  }
  if (!enrollment.tier) {
    // Access an admin granted (or that predates plans) has no purchase to
    // credit the difference against.
    return { ok: false, reason: "This access wasn't bought as a plan, so it can't be upgraded online. Contact us to change it." };
  }
  if (course.status === "closed") {
    return { ok: false, reason: "This course isn't taking new purchases right now." };
  }

  const paid = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: { status: "paid", application: { userId, courseId: course.id } },
  });
  const paidPaise = paid._sum.amount || 0;

  const options = course.tiers
    .filter((plan) => tierRank(plan.tier) > tierRank(enrollment.tier))
    .map((plan) => {
      const planPaise = Math.round(tierTotal(plan) * 100);
      return { tier: plan.tier, planPaise, duePaise: planPaise - paidPaise };
    })
    .filter((option) => option.duePaise >= MIN_UPGRADE_PAISE);

  return { ok: true, currentTier: enrollment.tier, paidPaise, options };
}

module.exports = { getUpgradeOptions };
