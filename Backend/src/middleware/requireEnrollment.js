const mongoose = require("mongoose");
const Enrollment = require("../models/Enrollment");

const DAY_MS = 24 * 60 * 60 * 1000;

// Runs AFTER requireAuth. Loads the logged-in user's active Enrollment for
// the course in req.params.courseId and works out how far into the drip
// schedule they've unlocked:
//
//   unlockedThroughDay = floor((now - startDate) / 1 day) + 1
//
// A video with dayNumber <= req.unlockedThroughDay is playable for them.
// Sets req.enrollment and req.unlockedThroughDay for the handler.
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

    const startMs = new Date(enrollment.startDate || enrollment.createdAt || Date.now()).getTime();
    const daysElapsed = Number.isFinite(startMs) ? Math.floor((Date.now() - startMs) / DAY_MS) : 0;
    req.enrollment = enrollment;
    // A paying student always has at least day 1; caps the "future startDate"
    // and any bad-data cases at 1 rather than 0 or NaN.
    req.unlockedThroughDay = Math.max(1, daysElapsed + 1);
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { requireEnrollment };
