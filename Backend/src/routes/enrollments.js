const express = require("express");
const mongoose = require("mongoose");
const Enrollment = require("../models/Enrollment");
const User = require("../models/User");
const Course = require("../models/Course");
const { requireAdmin } = require("../middleware/requireAdmin");
const { requireAuth } = require("../middleware/requireAuth");
const { isExpired } = require("../utils/enrollmentAccess");

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
    res.json({
      ok: true,
      enrollments: enrollments.map((e) => ({ ...e.toObject(), expired: isExpired(e) })),
    });
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
    let userIds = null;
    if (q) {
      // Enrollment itself has no searchable text (it's just refs + dates) —
      // resolve matching users/courses first, then filter by either ref.
      const [users, courses] = await Promise.all([
        User.find({ $or: [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }] }).select("_id"),
        Course.find({ title: new RegExp(q, "i") }).select("_id"),
      ]);
      const userIdList = users.map((u) => u._id);
      const courseIdList = courses.map((c) => c._id);
      if (!userIdList.length && !courseIdList.length) {
        return res.json({ ok: true, enrollments: [] });
      }
      userIds = { $or: [{ user: { $in: userIdList } }, { course: { $in: courseIdList } }] };
    }

    const filter = { status: "active", ...(userIds || {}) };
    const enrollments = await Enrollment.find(filter)
      .populate("user", "name email phone")
      .populate("course", "title slug")
      .sort({ createdAt: -1 });

    res.json({
      ok: true,
      enrollments: enrollments.map((e) => ({ ...e.toObject(), expired: isExpired(e) })),
    });
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

    res.status(201).json({ ok: true, enrollment: { ...enrollment.toObject(), expired: isExpired(enrollment) } });
  } catch (e) {
    next(e);
  }
});

// Edit a subscription's validity dates.
router.patch("/admin/enrollments/:id", requireAdmin, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.body || {};
    const update = {};
    if (startDate !== undefined) update.startDate = startDate ? new Date(startDate) : new Date();
    if (endDate !== undefined) update.endDate = endDate ? new Date(endDate) : null; // null clears expiry -> lifetime

    const enrollment = await Enrollment.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate("user", "name email phone")
      .populate("course", "title slug");
    if (!enrollment) return res.status(404).json({ ok: false, error: "Subscription not found" });

    res.json({ ok: true, enrollment: { ...enrollment.toObject(), expired: isExpired(enrollment) } });
  } catch (e) {
    next(e);
  }
});

// Remove a subscription outright (revoke access immediately).
router.delete("/admin/enrollments/:id", requireAdmin, async (req, res, next) => {
  try {
    const enrollment = await Enrollment.findByIdAndDelete(req.params.id);
    if (!enrollment) return res.status(404).json({ ok: false, error: "Subscription not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
