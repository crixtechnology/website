// Single place that decides whether an Enrollment still grants access, so
// requireEnrollment.js (videos) and routes/lectures.js's /learn/:slug (live
// schedule) can't drift out of sync on what "expired" means.
function hasValidAccess(enrollment) {
  if (!enrollment || enrollment.status !== "active") return false;
  if (!enrollment.endDate) return true; // no expiry set = lifetime access
  return new Date(enrollment.endDate).getTime() > Date.now();
}

function isExpired(enrollment) {
  return !!(enrollment && enrollment.endDate && new Date(enrollment.endDate).getTime() <= Date.now());
}

module.exports = { hasValidAccess, isExpired };
