const express = require("express");
const Course = require("../models/Course");
const { requireAdmin } = require("../middleware/requireAdmin");

const router = express.Router();

function slugify(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ---------- public ----------
router.get("/courses", async (req, res, next) => {
  try {
    const courses = await Course.find().sort({ createdAt: 1 });
    res.json({ ok: true, courses });
  } catch (e) {
    next(e);
  }
});

router.get("/courses/:slug", async (req, res, next) => {
  try {
    const course = await Course.findOne({ slug: req.params.slug });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });
    res.json({ ok: true, course });
  } catch (e) {
    next(e);
  }
});

// ---------- admin ----------
router.get("/admin/courses", requireAdmin, async (req, res, next) => {
  try {
    const courses = await Course.find().sort({ createdAt: 1 });
    res.json({ ok: true, courses });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/courses", requireAdmin, async (req, res, next) => {
  try {
    const { title, tag, desc, points, price, discountPercent, durationDays, status } = req.body || {};
    if (!title || price == null) {
      return res.status(400).json({ ok: false, error: "title and price are required" });
    }
    let slug = slugify(title);
    let suffix = 1;
    while (await Course.findOne({ slug })) {
      slug = `${slugify(title)}-${suffix++}`;
    }
    const course = await Course.create({
      title, slug, tag: tag || "", desc: desc || "",
      points: Array.isArray(points) ? points : [],
      price, discountPercent: discountPercent || 0,
      durationDays: durationDays || null,
      status: status === "closed" ? "closed" : "open",
    });
    res.status(201).json({ ok: true, course });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/courses/:id", requireAdmin, async (req, res, next) => {
  try {
    const { title, tag, desc, points, price, discountPercent, durationDays, status } = req.body || {};
    const update = {};
    if (title !== undefined) update.title = title;
    if (tag !== undefined) update.tag = tag;
    if (desc !== undefined) update.desc = desc;
    if (points !== undefined) update.points = Array.isArray(points) ? points : [];
    if (price !== undefined) update.price = price;
    if (discountPercent !== undefined) update.discountPercent = discountPercent;
    if (durationDays !== undefined) update.durationDays = durationDays || null;
    if (status !== undefined) update.status = status === "closed" ? "closed" : "open";

    const course = await Course.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });
    res.json({ ok: true, course });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/courses/:id", requireAdmin, async (req, res, next) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
