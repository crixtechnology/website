const { prisma } = require("../db");
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

// When a new grant's access period begins: now, or the course's start date
// if that's still ahead — buying early must not use up the access period
// before the course has even begun.
function accessStartFor(course, now = new Date()) {
  const startsAt = course && course.startsAt ? new Date(course.startsAt) : null;
  return startsAt && startsAt.getTime() > now.getTime() ? startsAt : now;
}

// Has the course begun? Content (videos, live classes) stays locked until then.
// Checked against the course's CURRENT start date, so postponing it re-locks.
function hasStarted(course, now = new Date()) {
  return !(course && course.startsAt) || new Date(course.startsAt).getTime() <= now.getTime();
}

// "1 Nov 2026" in India time — what students see for a course's start date.
function formatStartDate(date) {
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

// The 403 a student gets for a course they own that hasn't started yet.
function notStartedResponse(course) {
  const kind = course.type === "internship" ? "internship" : "course";
  return {
    ok: false,
    code: "NOT_STARTED",
    startsAt: course.startsAt,
    error: `This ${kind} starts on ${formatStartDate(course.startsAt)}. You'll get access then.`,
  };
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

// Admins get every course and internship with no purchase or enrollment —
// requireEnrollment.js, routes/lectures.js's /learn/:slug and routes/
// enrollments.js's /me/enrollments all defer to this. The JWT's role claim
// alone isn't trusted: like middleware/requireAdmin.js, the DB is the source
// of truth, so a demoted admin's still-validly-signed token stops working
// as an admin pass immediately.
async function isAdminUser(payload) {
  if (!payload || payload.role !== "admin") return false;
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { role: true } });
  return !!user && user.role === "admin";
}

// Shape sent to the frontend everywhere an Enrollment is serialized (routes/
// enrollments.js, routes/adminUsers.js) — plain fields plus the derived
// `expired` flag, so every endpoint agrees on this shape instead of each
// hand-rolling its own `{...e.toObject(), expired: isExpired(e)}`.
function serializeEnrollment(enrollment) {
  return { ...serialize(enrollment, "enrollment"), expired: isExpired(enrollment) };
}

module.exports = {
  hasValidAccess, isExpired, isAdminUser, serializeEnrollment, computeEndDate,
  accessStartFor, hasStarted, formatStartDate, notStartedResponse,
};
