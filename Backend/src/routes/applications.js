const express = require("express");
const Application = require("../models/Application");
const Course = require("../models/Course");
const { attachUserIfPresent } = require("../middleware/requireAuth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { searchRegex } = require("../utils/searchRegex");
const { sendApplicationEmail } = require("../utils/mailer");

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

    // Best-effort notification email; a delivery failure here shouldn't turn
    // a successfully-saved application into a 500 for the applicant.
    try {
      await sendApplicationEmail({ type, refTitle, name, email, phone, college });
    } catch (mailErr) {
      console.error("[applications] notification email failed:", mailErr.message);
    }

    res.status(201).json({ ok: true, application });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: internship/course inquiries inbox ----------
// Lists every Application row — guest Apply/Inquire submissions and the
// Application docs the Buy-now flow creates on its way to payment alike —
// so a submission is never only visible by querying Mongo directly.
router.get("/admin/applications", requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const filter = q
      ? { $or: [{ name: searchRegex(q) }, { email: searchRegex(q) }, { refTitle: searchRegex(q) }, { college: searchRegex(q) }] }
      : {};
    if (req.query.type === "internship" || req.query.type === "course") filter.type = req.query.type;

    const applications = await Application.find(filter).sort({ createdAt: -1 });
    res.json({ ok: true, applications });
  } catch (e) {
    next(e);
  }
});

router.patch("/admin/applications/:id", requireAdmin, async (req, res, next) => {
  try {
    const { contacted } = req.body || {};
    if (typeof contacted !== "boolean") {
      return res.status(400).json({ ok: false, error: "contacted must be a boolean" });
    }
    const application = await Application.findByIdAndUpdate(req.params.id, { contacted }, { new: true });
    if (!application) return res.status(404).json({ ok: false, error: "Application not found" });
    res.json({ ok: true, application });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/applications/:id", requireAdmin, async (req, res, next) => {
  try {
    const application = await Application.findByIdAndDelete(req.params.id);
    if (!application) return res.status(404).json({ ok: false, error: "Application not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
