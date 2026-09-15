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

function typeFilter(req) {
  const type = req.query.type;
  return type === "course" || type === "internship" ? { type } : {};
}

// ---------- public ----------
// ?type=course or ?type=internship filters; omit for everything.
router.get("/courses", async (req, res, next) => {
  try {
    const courses = await Course.find(typeFilter(req)).sort({ createdAt: 1 });
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
    const courses = await Course.find(typeFilter(req)).sort({ createdAt: 1 });
    res.json({ ok: true, courses });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/courses", requireAdmin, async (req, res, next) => {
  try {
    const { type, title, tag, desc, points, price, discountPercent, durationDays, status } = req.body || {};
    const entryType = type === "internship" ? "internship" : "course";
    if (!title) {
      return res.status(400).json({ ok: false, error: "title is required" });
    }
    if (entryType === "course" && price == null) {
      return res.status(400).json({ ok: false, error: "price is required for a course" });
    }
    let slug = slugify(title);
    let suffix = 1;
    while (await Course.findOne({ slug })) {
      slug = `${slugify(title)}-${suffix++}`;
    }
    let course;
    try {
      course = await Course.create({
        type: entryType, title, slug, tag: tag || "", desc: desc || "",
        points: Array.isArray(points) ? points : [],
        // Internships are apply-only by default (price left null shows
        // Apply, no online purchase) but MAY carry a real price too — some
        // internship slots are sold, some are free/discounted promos decided
        // case-by-case; whichever price (or lack of one) the admin sends is
        // respected for either type, same as a course.
        price: entryType === "course" ? price : (price ?? null),
        discountPercent: discountPercent || 0,
        durationDays: durationDays || null,
        // Always starts closed, even with a price already set — saving a
        // price is not the same action as publishing it for sale. The admin
        // list's separate Open/Closed toggle is the actual trigger; opening
        // it requires that explicit second step (enforced below too).
        status: status === "open" && price != null ? "open" : "closed",
      });
    } catch (createErr) {
      // The while-loop's uniqueness check above isn't atomic with this
      // create() — two concurrent POSTs for the same title (e.g. an admin
      // double-clicking "Create" on a slow connection) can both compute the
      // same free slug and both reach here; Course.slug's unique index
      // (models/Course.js) then lets only one create() actually succeed.
      // Same class of race as auth.js's signup, same fix: a clean, specific
      // error instead of a raw 500 leaking the Mongo error string.
      if (createErr && createErr.code === 11000) {
        return res.status(409).json({ ok: false, error: "A course/internship with that title already exists — try again." });
      }
      throw createErr;
    }
    res.status(201).json({ ok: true, course });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/courses/:id", requireAdmin, async (req, res, next) => {
  try {
    const existing = await Course.findById(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: "Course not found" });

    const { type, title, tag, desc, points, price, discountPercent, durationDays, status } = req.body || {};
    const effectiveType = type === "course" || type === "internship" ? type : existing.type;

    const update = { type: effectiveType };
    if (title !== undefined) update.title = title;
    if (tag !== undefined) update.tag = tag;
    if (desc !== undefined) update.desc = desc;
    if (points !== undefined) update.points = Array.isArray(points) ? points : [];
    if (durationDays !== undefined) update.durationDays = durationDays || null;
    if (status !== undefined) update.status = status === "closed" ? "closed" : "open";

    // Price/discount are no longer forced to null for internships — an
    // internship slot may genuinely be priced (Buy now, same as a course)
    // or left apply-only (price null shows Apply instead), decided per
    // entry rather than by type. Whatever the admin sends applies to
    // either type identically.
    if (price !== undefined) update.price = price;
    if (discountPercent !== undefined) update.discountPercent = discountPercent;

    // The resolved price after this update — null means "no price set".
    const resultingPrice = update.price !== undefined ? update.price : existing.price;

    // Saving a price is not the same action as putting a course on sale —
    // setting one for the first time (null -> a real value) never opens it
    // by itself; the admin has to separately flip the list's Open/Closed
    // toggle (a plain { status } request, with no price in it) afterward.
    const settingPriceFirstTime = existing.price == null && update.price != null;
    if (settingPriceFirstTime) update.status = "closed";

    // Can't be "open" without a price, however that was attempted — via
    // the toggle on an unpriced entry, or a status sent alongside no price.
    // Checked against the RESULTING status (falls back to existing.status
    // when this request doesn't touch status at all — e.g. an admin
    // clearing an already-open course's price with a plain { price: null }
    // request), not just `update.status`: that field is only ever set when
    // the request body itself includes `status`, so a price-only edit on an
    // already-open course used to skip this guard entirely and leave the
    // course persisted as open with no price.
    const resultingStatus = update.status !== undefined ? update.status : existing.status;
    if (resultingStatus === "open" && resultingPrice == null) {
      if (update.status === "open") {
        // Attempted specifically via the toggle — clear, actionable error.
        return res.status(400).json({ ok: false, error: "Set a price before opening this for purchase." });
      }
      // Attempted via a price-only edit that would silently leave an
      // already-open course priceless — close it instead of erroring, same
      // as the settingPriceFirstTime branch above chooses to close rather
      // than reject.
      update.status = "closed";
    }

    const course = await Course.findByIdAndUpdate(req.params.id, update, { new: true });
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
