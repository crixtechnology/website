const express = require("express");
const Enrollment = require("../models/Enrollment");
const { requireAdmin } = require("../middleware/requireAdmin");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

// ---------- student: "My Courses" ----------
router.get("/me/enrollments", requireAuth, async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ user: req.user.sub, status: "active" })
      .populate("course")
      .sort({ createdAt: -1 });
    res.json({ ok: true, enrollments });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: read-only students/enrollments list ----------
router.get("/admin/enrollments", requireAdmin, async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ status: "active" })
      .populate("user", "name email phone")
      .populate("course", "title slug")
      .sort({ createdAt: -1 });
    res.json({ ok: true, enrollments });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
