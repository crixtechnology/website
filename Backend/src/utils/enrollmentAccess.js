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
  return { ...enrollment.toObject(), expired: isExpired(enrollment) };
}

module.exports = { hasValidAccess, isExpired, serializeEnrollment };
