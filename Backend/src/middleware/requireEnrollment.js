const mongoose = require("mongoose");
const Enrollment = require("../models/Enrollment");
const { hasValidAccess } = require("../utils/enrollmentAccess");

// Runs AFTER requireAuth. Loads the logged-in user's active Enrollment for
// the course in req.params.courseId and confirms their access hasn't
// expired. Sets req.enrollment for the handler.
async function requireEnrollment(req, res, next) {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ ok: false, error: "Invalid course id" });
    }

    const enrollment = await Enrollment.findOne({
      user: req.user.sub,
      course: courseId,
      status: "active",
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
