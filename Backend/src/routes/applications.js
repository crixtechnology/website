const express = require("express");
const Application = require("../models/Application");
const Course = require("../models/Course");
const { attachUserIfPresent } = require("../middleware/requireAuth");

const router = express.Router();

// Stores both internship applications and course enrollments — same shape,
// distinguished by `type`. Used before payment (course/paid tracks attach
// a Payment doc afterwards via /api/payments/create-order).
//
// Internship applications stay fully guest — no login required. Course
// applications are expected to come from a logged-in student (the frontend
// gates "Buy now" behind /login); when a valid token is present it's
// attached here so the payment webhook can grant course access afterwards.
router.post("/applications", attachUserIfPresent, async (req, res, next) => {
  try {
    const { type, refTitle, name, email, phone, college, track, courseSlug } = req.body || {};
    if (!type || !refTitle || !name || !email || !phone) {
      return res.status(400).json({ ok: false, error: "type, refTitle, name, email and phone are required" });
    }
    if (!["internship", "course"].includes(type)) {
      return res.status(400).json({ ok: false, error: "type must be 'internship' or 'course'" });
    }

    let course = null;
    if (type === "course" && courseSlug) {
      course = await Course.findOne({ slug: courseSlug });
    }

    const application = await Application.create({
      type, refTitle, name, email, phone, college: college || "", track: track || "",
      user: req.user ? req.user.sub : null,
      course: course ? course._id : null,
    });
    res.status(201).json({ ok: true, application });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
