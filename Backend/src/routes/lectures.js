const express = require("express");
const Lecture = require("../models/Lecture");
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const { requireAdmin } = require("../middleware/requireAdmin");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

// This router now only handles the LIVE class schedule. Recorded lectures
// moved to the drip-video system — see routes/videos.js.

// ---------- admin: CRUD the live class schedule ----------
router.get("/admin/lectures", requireAdmin, async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.courseId) filter.course = req.query.courseId;
    const lectures = await Lecture.find(filter).sort({ scheduledAt: 1, createdAt: -1 });
    res.json({ ok: true, lectures });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/lectures", requireAdmin, async (req, res, next) => {
  try {
    const { course, title, scheduledAt, link, notes } = req.body || {};
    if (!course || !title || !scheduledAt || !link) {
      return res.status(400).json({ ok: false, error: "course, title, scheduledAt and link are required" });
    }
    const courseDoc = await Course.findById(course);
    if (!courseDoc) return res.status(404).json({ ok: false, error: "Course not found" });

    const lecture = await Lecture.create({ course, title, scheduledAt, link, notes: notes || "" });
    res.status(201).json({ ok: true, lecture });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/lectures/:id", requireAdmin, async (req, res, next) => {
  try {
    const { title, scheduledAt, link, notes } = req.body || {};
    const update = {};
    if (title !== undefined) update.title = title;
    if (scheduledAt !== undefined) update.scheduledAt = scheduledAt;
    if (link !== undefined) update.link = link;
    if (notes !== undefined) update.notes = notes;

    const lecture = await Lecture.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!lecture) return res.status(404).json({ ok: false, error: "Lecture not found" });
    res.json({ ok: true, lecture });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/lectures/:id", requireAdmin, async (req, res, next) => {
  try {
    const lecture = await Lecture.findByIdAndDelete(req.params.id);
    if (!lecture) return res.status(404).json({ ok: false, error: "Lecture not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- student: view a purchased course's upcoming live classes ----------
router.get("/learn/:courseSlug", requireAuth, async (req, res, next) => {
  try {
    const course = await Course.findOne({ slug: req.params.courseSlug });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });

    const enrollment = await Enrollment.findOne({
      user: req.user.sub, course: course._id, status: "active",
    });
    if (!enrollment) {
      return res.status(403).json({ ok: false, error: "You haven't purchased this course" });
    }

    const upcoming = await Lecture.find({
      course: course._id, scheduledAt: { $gte: new Date() },
    }).sort({ scheduledAt: 1 });

    res.json({ ok: true, course, upcoming });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
