const express = require("express");
const { prisma } = require("../db");
const { requireAdmin } = require("../middleware/requireAdmin");
const { requireAuth } = require("../middleware/requireAuth");
const { serializeEnrollment } = require("../utils/enrollmentAccess");

const router = express.Router();

const USER_SUMMARY = { id: true, name: true, email: true, phone: true };
const COURSE_SUMMARY = { id: true, title: true, slug: true };

// ---------- student: "My Courses" ----------
router.get("/me/enrollments", requireAuth, async (req, res, next) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: req.user.sub, status: "active" },
      include: { course: true },
      orderBy: { createdAt: "desc" },
    });
    // `expired` is derived, not stored — see utils/enrollmentAccess.js. The
    // frontend uses it to grey out/label a course whose access has lapsed
    // rather than just hiding it, so the student still sees what they bought.
    res.json({ ok: true, enrollments: enrollments.map((e) => serializeEnrollment(e)) });
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
    // Enrollment itself has no searchable text (it's just refs + dates) —
    // matched here via nested relation filters on the joined user/course
    // instead of Mongo's old two-step "resolve refs first, then $in" dance;
    // a search for a student's name surfaces all of their courses, a search
    // for a course title surfaces every student in it.
    const where = {
      status: "active",
      ...(q
        ? {
            OR: [
              { user: { OR: [{ name: { contains: q } }, { email: { contains: q } }] } },
              { course: { title: { contains: q } } },
            ],
          }
        : {}),
    };

    const enrollments = await prisma.enrollment.findMany({
      where,
      include: { user: { select: USER_SUMMARY }, course: { select: COURSE_SUMMARY } },
      orderBy: { createdAt: "desc" },
    });

    res.json({ ok: true, enrollments: enrollments.map((e) => serializeEnrollment(e)) });
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
    if (!courseId) {
      return res.status(400).json({ ok: false, error: "A valid courseId is required" });
    }
    if (!userId && !email) {
      return res.status(400).json({ ok: false, error: "userId or email is required" });
    }

    let user = null;
    if (userId) {
      user = await prisma.user.findUnique({ where: { id: userId } });
    } else {
      user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    }
    if (!user) {
      return res.status(404).json({ ok: false, error: "No account with that email — they need to sign up first." });
    }

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });

    const dateFields = {};
    if (startDate) dateFields.startDate = new Date(startDate);
    if (endDate !== undefined) dateFields.endDate = endDate ? new Date(endDate) : null;

    const enrollment = await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: user.id, courseId: course.id } },
      create: { userId: user.id, courseId: course.id, status: "active", ...dateFields },
      update: { status: "active", ...dateFields },
      include: { user: { select: USER_SUMMARY }, course: { select: COURSE_SUMMARY } },
    });

    res.status(201).json({ ok: true, enrollment: serializeEnrollment(enrollment) });
  } catch (e) {
    next(e);
  }
});

// Edit a subscription's validity dates.
router.patch("/admin/enrollments/:id", requireAdmin, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.body || {};
    const update = {};
    // A falsy/empty startDate means "leave it alone" (same partial-update
    // convention as every other field here) — it must NOT silently reset
    // the drip schedule's day-1 to right now, which would relock videos a
    // student had already unlocked.
    if (startDate) update.startDate = new Date(startDate);
    if (endDate !== undefined) update.endDate = endDate ? new Date(endDate) : null; // null clears expiry -> lifetime

    const enrollment = await prisma.enrollment
      .update({
        where: { id: req.params.id },
        data: update,
        include: { user: { select: USER_SUMMARY }, course: { select: COURSE_SUMMARY } },
      })
      .catch(() => null);
    if (!enrollment) return res.status(404).json({ ok: false, error: "Subscription not found" });

    res.json({ ok: true, enrollment: serializeEnrollment(enrollment) });
  } catch (e) {
    next(e);
  }
});

// Remove a subscription outright (revoke access immediately).
router.delete("/admin/enrollments/:id", requireAdmin, async (req, res, next) => {
  try {
    const enrollment = await prisma.enrollment.delete({ where: { id: req.params.id } }).catch(() => null);
    if (!enrollment) return res.status(404).json({ ok: false, error: "Subscription not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
