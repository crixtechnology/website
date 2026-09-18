const { serialize } = require("./serialize");

const DAY_MS = 24 * 60 * 60 * 1000;

// A course's `durationDays` (Backend/prisma/schema.prisma's Course model) is how long a
// purchased/granted enrollment stays valid for, counted from `startDate` —
// see routes/payments.js's grantAccessForPayment. No durationDays set on the
// course means lifetime access (returns null, same as leaving endDate
// unset).
function computeEndDate(startDate, durationDays) {
  if (!durationDays) return null;
  return new Date(new Date(startDate).getTime() + durationDays * DAY_MS);
}

// Single place that decides whether an Enrollment still grants access, so
// requireEnrollment.js (videos) and routes/lectures.js's /learn/:slug (live
// schedule) can't drift out of sync on what "expired" means.
function hasValidAccess(enrollment) {
  if (!enrollment || enrollment.status !== "active") return false;
  if (!enrollment.endDate) return true; // no expiry set = lifetime access
  return new Date(enrollment.endDate).getTime() > Date.now();
}

// Derived from hasValidAccess rather than its own date comparison — an
// active-but-expired enrollment is exactly the `false` case above, minus the
// "no enrollment at all" / "not active" cases, which never show up here
// since every caller only calls isExpired on an enrollment it already knows
// is `status: "active"`.
function isExpired(enrollment) {
  return !!(enrollment && enrollment.status === "active" && !hasValidAccess(enrollment));
}

// Shape sent to the frontend everywhere an Enrollment is serialized (routes/
// enrollments.js, routes/adminUsers.js) — plain fields plus the derived
// `expired` flag, so every endpoint agrees on this shape instead of each
// hand-rolling its own `{...e.toObject(), expired: isExpired(e)}`.
function serializeEnrollment(enrollment) {
  return { ...serialize(enrollment, "enrollment"), expired: isExpired(enrollment) };
}

module.exports = { hasValidAccess, isExpired, serializeEnrollment, computeEndDate };
