const { prisma } = require("../db");
const { hasValidAccess, isAdminUser } = require("../utils/enrollmentAccess");

// Runs AFTER requireAuth. Loads the logged-in user's active Enrollment for
// the course in req.params.courseId and confirms their access hasn't
// expired. Sets req.enrollment for the handler.
//
// Admins skip the check entirely (req.enrollment stays null) — they can view
// every course's content without being enrolled or paying.
//
// No explicit "is this a valid id" pre-check is needed the way Mongo's
// isValidObjectId guard was — a malformed courseId here just matches no row
// (Prisma ids are plain strings, not a special format that throws a cast
// error), so it falls straight through to the same 403 as "not enrolled".
async function requireEnrollment(req, res, next) {
  try {
    const { courseId } = req.params;

    if (await isAdminUser(req.user)) {
      req.enrollment = null;
      return next();
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { userId: req.user.sub, courseId, status: "active" },
    });
    if (!enrollment) {
      return res.status(403).json({ ok: false, error: "You aren't enrolled in this course" });
    }
    if (!hasValidAccess(enrollment)) {
      return res.status(403).json({ ok: false, error: "Your access to this course has expired" });
    }

    req.enrollment = enrollment;
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { requireEnrollment };
