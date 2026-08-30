const express = require("express");
const Application = require("../models/Application");

const router = express.Router();

// Stores both internship applications and course enrollments — same shape,
// distinguished by `type`. Used before payment (course/paid tracks attach
// a Payment doc afterwards via /api/payments/create-order).
router.post("/applications", async (req, res, next) => {
  try {
    const { type, refTitle, name, email, phone, college, track } = req.body || {};
    if (!type || !refTitle || !name || !email || !phone) {
      return res.status(400).json({ ok: false, error: "type, refTitle, name, email and phone are required" });
    }
    if (!["internship", "course"].includes(type)) {
      return res.status(400).json({ ok: false, error: "type must be 'internship' or 'course'" });
    }
    const application = await Application.create({
      type, refTitle, name, email, phone, college: college || "", track: track || "",
    });
    res.status(201).json({ ok: true, application });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
