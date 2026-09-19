const express = require("express");
const { prisma } = require("../db");
const { requireAdmin } = require("../middleware/requireAdmin");
const { serialize } = require("../utils/serialize");
const { WITH_TIERS, parseTiers } = require("../utils/tiers");

const router = express.Router();

function slugify(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Blank / null means "no fixed duration" (lifetime access); anything else must
// be a positive whole number of days — a stray string would otherwise reach the
// database and come back as a 500.
function validDuration(value) {
  if (value === undefined || value === null || value === "" || value === 0) return true;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 36500;
}

function typeFilter(req) {
  const type = req.query.type;
  return type === "course" || type === "internship" ? { type } : {};
}

// ---------- public ----------
// ?type=course or ?type=internship filters; omit for everything.
router.get("/courses", async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({ where: typeFilter(req), orderBy: { createdAt: "asc" }, include: WITH_TIERS });
    res.json({ ok: true, courses: serialize(courses) });
  } catch (e) {
    next(e);
  }
});

router.get("/courses/:slug", async (req, res, next) => {
  try {
    const course = await prisma.course.findUnique({ where: { slug: req.params.slug }, include: WITH_TIERS });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });
    res.json({ ok: true, course: serialize(course) });
  } catch (e) {
    next(e);
  }
});

// ---------- admin ----------
router.get("/admin/courses", requireAdmin, async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({ where: typeFilter(req), orderBy: { createdAt: "asc" }, include: WITH_TIERS });
    res.json({ ok: true, courses: serialize(courses) });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/courses", requireAdmin, async (req, res, next) => {
  try {
    const { type, title, tag, desc, points, tiers, durationDays, status } = req.body || {};
    const entryType = type === "internship" ? "internship" : "course";
    if (!title || !String(title).trim()) {
      return res.status(400).json({ ok: false, error: "title is required" });
    }
    if (!validDuration(durationDays)) {
      return res.status(400).json({ ok: false, error: "durationDays must be a positive whole number of days" });
    }
    const parsed = parseTiers(tiers === undefined ? [] : tiers);
    if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
    if (entryType === "course" && parsed.tiers.length === 0) {
      return res.status(400).json({ ok: false, error: "Set a price on at least one plan (Basic, Plus or Pro) for a course." });
    }
    let slug = slugify(title);
    let suffix = 1;
    while (await prisma.course.findUnique({ where: { slug } })) {
      slug = `${slugify(title)}-${suffix++}`;
    }
    let course;
    try {
      course = await prisma.course.create({
        data: {
          type: entryType,
          title,
          slug,
          tag: tag || "",
          desc: desc || "",
          points: Array.isArray(points) ? points : [],
          // A course/internship offers up to three plans (Basic/Plus/Pro).
          // Internships are apply-only when they have none (shows Request to
          // apply, no online purchase) but MAY carry plans too — some slots
          // are sold, some are free/discounted promos decided case-by-case.
          tiers: { create: parsed.tiers },
          durationDays: durationDays ? Number(durationDays) : null,
          // Always starts closed, even with plans already set — saving a
          // price is not the same action as publishing it for sale. The admin
          // list's separate Open/Closed toggle is the actual trigger; opening
          // it requires that explicit second step (enforced below too).
          status: status === "open" && parsed.tiers.length > 0 ? "open" : "closed",
        },
        include: WITH_TIERS,
      });
    } catch (createErr) {
      // The while-loop's uniqueness check above isn't atomic with this
      // create() — two concurrent POSTs for the same title (e.g. an admin
      // double-clicking "Create" on a slow connection) can both compute the
      // same free slug and both reach here; Course.slug's unique index
      // (prisma/schema.prisma) then lets only one create() actually succeed.
      // Same class of race as auth.js's signup, same fix: a clean, specific
      // error instead of a raw 500 leaking the SQL error string.
      if (createErr && createErr.code === "P2002") {
        return res.status(409).json({ ok: false, error: "A course/internship with that title already exists — try again." });
      }
      throw createErr;
    }
    res.status(201).json({ ok: true, course: serialize(course) });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/courses/:id", requireAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ ok: false, error: "Course not found" });

    const { type, title, tag, desc, points, tiers, durationDays, status } = req.body || {};
    const effectiveType = type === "course" || type === "internship" ? type : existing.type;

    const update = { type: effectiveType };
    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ ok: false, error: "title can't be empty" });
      update.title = title;
    }
    if (tag !== undefined) update.tag = tag;
    if (desc !== undefined) update.desc = desc;
    if (points !== undefined) update.points = Array.isArray(points) ? points : [];
    if (durationDays !== undefined) {
      if (!validDuration(durationDays)) {
        return res.status(400).json({ ok: false, error: "durationDays must be a positive whole number of days" });
      }
      update.durationDays = durationDays ? Number(durationDays) : null;
    }
    if (status !== undefined) update.status = status === "closed" ? "closed" : "open";

    // `tiers`, when sent, is the COMPLETE set of plans this item offers: any
    // existing plan missing from it is removed, so the admin form can just post
    // all three rows and leave the ones it doesn't sell blank. Omitted entirely
    // (e.g. the Open/Closed toggle's plain { status } request) leaves the plans
    // alone. An internship may have plans or stay apply-only, per entry.
    let parsed = null;
    if (tiers !== undefined) {
      parsed = parseTiers(tiers);
      if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
    }

    const existingPlanCount = await prisma.courseTier.count({ where: { courseId: existing.id } });
    // The number of plans after this update — 0 means nothing to buy.
    const resultingPlanCount = parsed ? parsed.tiers.length : existingPlanCount;

    // Saving plans is not the same action as putting a course on sale —
    // adding the first one (none -> some) never opens it by itself; the admin
    // has to separately flip the list's Open/Closed toggle (a plain
    // { status } request, with no tiers in it) afterward.
    const addingFirstPlan = existingPlanCount === 0 && resultingPlanCount > 0;
    if (addingFirstPlan) update.status = "closed";

    // Can't be "open" with nothing to buy, however that was attempted — via
    // the toggle on an unpriced entry, or a status sent alongside no plans.
    // Checked against the RESULTING status (falls back to existing.status
    // when this request doesn't touch status at all — e.g. an admin clearing
    // every plan of an already-open course), not just `update.status`: that
    // field is only ever set when the request body itself includes `status`,
    // so a plans-only edit on an already-open course would otherwise skip
    // this guard and leave it open with no price.
    const resultingStatus = update.status !== undefined ? update.status : existing.status;
    if (resultingStatus === "open" && resultingPlanCount === 0) {
      if (update.status === "open") {
        // Attempted specifically via the toggle — clear, actionable error.
        return res.status(400).json({ ok: false, error: "Set a price on at least one plan before opening this for purchase." });
      }
      // Attempted via a plans-only edit that would silently leave an
      // already-open course with nothing to buy — close it instead of
      // erroring, same as addingFirstPlan above chooses to close rather
      // than reject.
      update.status = "closed";
    }

    // One transaction so a failure part-way can't leave the plan set and the
    // course row disagreeing (e.g. plans removed but the status still open).
    // The course update runs last and re-reads the plans it includes.
    const ops = [];
    if (parsed) {
      ops.push(prisma.courseTier.deleteMany({
        where: { courseId: existing.id, tier: { notIn: parsed.tiers.map((t) => t.tier) } },
      }));
      for (const t of parsed.tiers) {
        ops.push(prisma.courseTier.upsert({
          where: { courseId_tier: { courseId: existing.id, tier: t.tier } },
          create: { courseId: existing.id, ...t },
          update: { price: t.price, discountPercent: t.discountPercent, features: t.features },
        }));
      }
    }
    ops.push(prisma.course.update({ where: { id: existing.id }, data: update, include: WITH_TIERS }));
    const results = await prisma.$transaction(ops);
    const course = results[results.length - 1];

    res.json({ ok: true, course: serialize(course) });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/courses/:id", requireAdmin, async (req, res, next) => {
  try {
    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });

    // A purchase is a record of what a student paid for — never wiped as a
    // side effect of tidying up the catalogue. (This used to fall through a
    // blanket .catch() and answer "Course not found" for any course that
    // still had students, lectures or videos, which was simply wrong.)
    const enrolled = await prisma.enrollment.count({ where: { courseId: course.id } });
    if (enrolled > 0) {
      return res.status(409).json({
        ok: false,
        error: `${enrolled} student${enrolled === 1 ? " is" : "s are"} enrolled in this. Remove their subscriptions first (Students page), or just set it to Closed.`,
      });
    }

    // Schedule and video rows only exist for this course, so they go with it;
    // its plans cascade, and past applications/payments keep their history
    // (the link to the course is simply cleared).
    await prisma.$transaction([
      prisma.lecture.deleteMany({ where: { courseId: course.id } }),
      prisma.video.deleteMany({ where: { courseId: course.id } }),
      prisma.course.delete({ where: { id: course.id } }),
    ]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
