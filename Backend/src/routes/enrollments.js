const express = require("express");
const mongoose = require("mongoose");
const Enrollment = require("../models/Enrollment");
const User = require("../models/User");
const Course = require("../models/Course");
const { requireAdmin } = require("../middleware/requireAdmin");
const { requireAuth } = require("../middleware/requireAuth");
const { serializeEnrollment } = require("../utils/enrollmentAccess");
const { searchRegex } = require("../utils/searchRegex");

const router = express.Router();

// ---------- student: "My Courses" ----------
router.get("/me/enrollments", requireAuth, async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ user: req.user.sub, status: "active" })
      .populate("course")
      .sort({ createdAt: -1 });
    // `expired` is derived, not stored — see utils/enrollmentAccess.js. The
    // frontend uses it to grey out/label a course whose access has lapsed
    // rather than just hiding it, so the student still sees what they bought.
    res.json({ ok: true, enrollments: enrollments.map(serializeEnrollment) });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: subscriptions/enrollments — full CRUD ----------
// A "subscription" here IS an Enrollment: admin can grant one to any user
// for any course with no payment involved, edit its start/end (validity)
// dates, or remove it outright — same record the Razorpay webhook creates
// on a real purchase, so granted/paid access behaves identically everywhere
// else in the app (learn page, drip videos).
router.get("/admin/enrollments", requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    // Enrollment itself has no searchable text (it's just refs + dates) —
    // resolve matching users/courses first, then filter to enrollments
    // whose EITHER side matches (a search for a student's name surfaces all
    // of their courses; a search for a course title surfaces every student
    // in it). `{ $in: [] }` already matches nothing in MongoDB, so there's
    // no need for a separate empty-results short-circuit.
    let matchFilter = {};
    if (q) {
      const [users, courses] = await Promise.all([
        User.find({ $or: [{ name: searchRegex(q) }, { email: searchRegex(q) }] }).select("_id"),
        Course.find({ title: searchRegex(q) }).select("_id"),
      ]);
      matchFilter = {
        $or: [
          { user: { $in: users.map((u) => u._id) } },
          { course: { $in: courses.map((c) => c._id) } },
        ],
      };
    }

    const enrollments = await Enrollment.find({ status: "active", ...matchFilter })
      .populate("user", "name email phone")
      .populate("course", "title slug")
      .sort({ createdAt: -1 });

    res.json({ ok: true, enrollments: enrollments.map(serializeEnrollment) });
  } catch (e) {
    next(e);
  }
});

// Grant a subscription: admin picks a user (by id or email) + a course, with
// optional start/end dates. Upserts so re-granting an already-enrolled user
// just updates their dates instead of erroring on the unique index.
router.post("/admin/enrollments", requireAdmin, async (req, res, next) => {
  try {
    const { userId, email, courseId, startDate, endDate } = req.body || {};
    if (!courseId || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ ok: false, error: "A valid courseId is required" });
    }
    if (!userId && !email) {
      return res.status(400).json({ ok: false, error: "userId or email is required" });
    }

    let user = null;
    if (userId) {
      if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ ok: false, error: "Invalid userId" });
      user = await User.findById(userId);
    } else {
      user = await User.findOne({ email: String(email).toLowerCase().trim() });
    }
    if (!user) {
      return res.status(404).json({ ok: false, error: "No account with that email — they need to sign up first." });
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });

    const set = { status: "active" };
    if (startDate) set.startDate = new Date(startDate);
    if (endDate !== undefined) set.endDate = endDate ? new Date(endDate) : null;

    const enrollment = await Enrollment.findOneAndUpdate(
      { user: user._id, course: course._id },
      { $set: set, $setOnInsert: { user: user._id, course: course._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await enrollment.populate([{ path: "user", select: "name email phone" }, { path: "course", select: "title slug" }]);

    res.status(201).json({ ok: true, enrollment: serializeEnrollment(enrollment) });
  } catch (e) {
    next(e);
  }
});

// Edit a subscription's validity dates.
router.patch("/admin/enrollments/:id", requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ ok: false, error: "Subscription not found" });
    }
    const { startDate, endDate } = req.body || {};
    const update = {};
    // A falsy/empty startDate means "leave it alone" (same partial-update
    // convention as every other field here) — it must NOT silently reset
    // the drip schedule's day-1 to right now, which would relock videos a
    // student had already unlocked.
    if (startDate) update.startDate = new Date(startDate);
    if (endDate !== undefined) update.endDate = endDate ? new Date(endDate) : null; // null clears expiry -> lifetime

    const enrollment = await Enrollment.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate("user", "name email phone")
      .populate("course", "title slug");
    if (!enrollment) return res.status(404).json({ ok: false, error: "Subscription not found" });

    res.json({ ok: true, enrollment: serializeEnrollment(enrollment) });
  } catch (e) {
    next(e);
  }
});

// Remove a subscription outright (revoke access immediately).
router.delete("/admin/enrollments/:id", requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ ok: false, error: "Subscription not found" });
    }
    const enrollment = await Enrollment.findByIdAndDelete(req.params.id);
    if (!enrollment) return res.status(404).json({ ok: false, error: "Subscription not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
