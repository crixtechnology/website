const express = require("express");
const { prisma } = require("../db");
const { requireAdmin } = require("../middleware/requireAdmin");
const { requireAuth } = require("../middleware/requireAuth");
const { hasValidAccess, isAdminUser } = require("../utils/enrollmentAccess");
const { serialize } = require("../utils/serialize");
const { isValidHttpUrl } = require("../utils/validators");

const { queryText } = require("../utils/validators");
const router = express.Router();

// This router now only handles the LIVE class schedule. Recorded lectures
// moved to the drip-video system — see routes/videos.js.

// ---------- admin: CRUD the live class schedule ----------
router.get("/admin/lectures", requireAdmin, async (req, res, next) => {
  try {
    const where = {};
    if (queryText(req.query.courseId)) where.courseId = queryText(req.query.courseId);
    const lectures = await prisma.lecture.findMany({
      where,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    });
    res.json({ ok: true, lectures: serialize(lectures, "lecture") });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/lectures", requireAdmin, async (req, res, next) => {
  try {
    const { course, title, scheduledAt, scheduledEndAt, link, notes } = req.body || {};
    if (!course || !title || !scheduledAt || !scheduledEndAt || !link) {
      return res.status(400).json({ ok: false, error: "course, title, scheduledAt, scheduledEndAt and link are required" });
    }
    // This gets rendered straight into a student-facing <a href> (the "Join
    // live" button) — an http(s) requirement is what stops it ever being set
    // to a `javascript:` URI, which React won't sanitize out on its own.
    if (!isValidHttpUrl(link)) {
      return res.status(400).json({ ok: false, error: "link must be a valid http(s) URL" });
    }
    if (Number.isNaN(new Date(scheduledAt).getTime()) || Number.isNaN(new Date(scheduledEndAt).getTime())) {
      return res.status(400).json({ ok: false, error: "Start and end time must be valid dates" });
    }
    if (new Date(scheduledEndAt) <= new Date(scheduledAt)) {
      return res.status(400).json({ ok: false, error: "End time must be after the start time" });
    }
    const courseDoc = await prisma.course.findUnique({ where: { id: course } });
    if (!courseDoc) return res.status(404).json({ ok: false, error: "Course not found" });

    const lecture = await prisma.lecture.create({
      data: {
        courseId: course,
        title,
        scheduledAt: new Date(scheduledAt),
        scheduledEndAt: new Date(scheduledEndAt),
        link,
        notes: notes || "",
      },
    });
    res.status(201).json({ ok: true, lecture: serialize(lecture, "lecture") });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/lectures/:id", requireAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.lecture.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ ok: false, error: "Lecture not found" });

    const { title, scheduledAt, scheduledEndAt, link, notes } = req.body || {};
    const data = {};
    if (title !== undefined) data.title = title;
    if (scheduledAt !== undefined) data.scheduledAt = new Date(scheduledAt);
    if (scheduledEndAt !== undefined) data.scheduledEndAt = new Date(scheduledEndAt);
    if ((data.scheduledAt && Number.isNaN(data.scheduledAt.getTime())) || (data.scheduledEndAt && Number.isNaN(data.scheduledEndAt.getTime()))) {
      return res.status(400).json({ ok: false, error: "Start and end time must be valid dates" });
    }
    if (link !== undefined) {
      if (!isValidHttpUrl(link)) {
        return res.status(400).json({ ok: false, error: "link must be a valid http(s) URL" });
      }
      data.link = link;
    }
    if (notes !== undefined) data.notes = notes;

    // Validate against the resulting start/end, not just whichever of the
    // two the request happened to include.
    const resultingStart = data.scheduledAt !== undefined ? data.scheduledAt : existing.scheduledAt;
    const resultingEnd = data.scheduledEndAt !== undefined ? data.scheduledEndAt : existing.scheduledEndAt;
    if (resultingEnd <= resultingStart) {
      return res.status(400).json({ ok: false, error: "End time must be after the start time" });
    }

    const lecture = await prisma.lecture.update({ where: { id: req.params.id }, data });
    res.json({ ok: true, lecture: serialize(lecture, "lecture") });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/lectures/:id", requireAdmin, async (req, res, next) => {
  try {
    const lecture = await prisma.lecture.delete({ where: { id: req.params.id } }).catch(() => null);
    if (!lecture) return res.status(404).json({ ok: false, error: "Lecture not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- student: view a purchased course's upcoming live classes ----------
router.get("/learn/:courseSlug", requireAuth, async (req, res, next) => {
  try {
    const course = await prisma.course.findUnique({ where: { slug: req.params.courseSlug } });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });

    // Admins can open any course or internship without being enrolled.
    if (!(await isAdminUser(req.user))) {
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: req.user.sub, courseId: course.id, status: "active" },
      });
      if (!enrollment) {
        return res.status(403).json({ ok: false, error: "You haven't purchased this course" });
      }
      if (!hasValidAccess(enrollment)) {
        return res.status(403).json({ ok: false, error: "Your access to this course has expired" });
      }
    }

    // "Upcoming" means "hasn't ended yet" — not "hasn't started yet", so a
    // class currently in progress still shows (with a live Join button) for
    // a student who logs in a few minutes late. See Learn.jsx for the
    // Join-button appear/disappear window built on scheduledAt/scheduledEndAt.
    const upcoming = await prisma.lecture.findMany({
      where: { courseId: course.id, scheduledEndAt: { gte: new Date() } },
      orderBy: { scheduledAt: "asc" },
    });

    res.json({ ok: true, course: serialize(course), upcoming: serialize(upcoming, "lecture") });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
