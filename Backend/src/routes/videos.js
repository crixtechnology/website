const express = require("express");
const mongoose = require("mongoose");
const Course = require("../models/Course");
const Video = require("../models/Video");
const { requireAuth } = require("../middleware/requireAuth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { requireEnrollment } = require("../middleware/requireEnrollment");
const { requireInternalToken } = require("../middleware/requireInternalToken");
const { buildSignedUrl } = require("../utils/signedVideoUrl");

const router = express.Router();

// Long enough to cover a full ~3h lecture plus pauses. The React player
// re-fetches a fresh URL and resumes if playback ever errors on expiry.
const PLAY_URL_TTL_SECONDS = 6 * 60 * 60;

// ---------- student: list a course's videos ----------
// requireEnrollment has already confirmed the student has active access.
// Every recorded video is playable any time once a student is enrolled —
// there's no drip schedule.
router.get("/courses/:courseId/videos", requireAuth, requireEnrollment, async (req, res, next) => {
  try {
    const videos = await Video.find({ course: req.params.courseId }).sort({ dayNumber: 1, createdAt: 1 });
    res.json({
      ok: true,
      videos: videos.map((v) => ({
        _id: v._id,
        title: v.title,
        dayNumber: v.dayNumber,
        durationSeconds: v.durationSeconds,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// ---------- student: mint a short-lived signed play URL ----------
router.get("/courses/:courseId/videos/:videoId/play-url", requireAuth, requireEnrollment, async (req, res, next) => {
  try {
    const gateway = process.env.VIDEO_GATEWAY_URL;
    if (!gateway || !process.env.SIGNING_SECRET) {
      return res.status(503).json({ ok: false, error: "Video delivery is not configured yet" });
    }

    if (!mongoose.isValidObjectId(req.params.videoId)) {
      return res.status(404).json({ ok: false, error: "Video not found" });
    }
    const video = await Video.findOne({ _id: req.params.videoId, course: req.params.courseId });
    if (!video) return res.status(404).json({ ok: false, error: "Video not found" });

    const url = buildSignedUrl(gateway, video.b2Key, PLAY_URL_TTL_SECONDS);
    res.json({
      ok: true,
      url,
      expiresAt: new Date(Date.now() + PLAY_URL_TTL_SECONDS * 1000).toISOString(),
      durationSeconds: video.durationSeconds,
    });
  } catch (e) {
    next(e);
  }
});

// ---------- internal: preflight ----------
// The sync script calls this once before it starts uploading, so a bad token
// or COURSE_ID fails fast instead of after gigabytes have been pushed to B2.
router.get("/internal/preflight", requireInternalToken, async (req, res, next) => {
  try {
    const { courseId } = req.query;
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ ok: false, error: "courseId is missing or not a valid id" });
    }
    const course = await Course.findById(courseId).select("title");
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });
    res.json({ ok: true, course: { _id: course._id, title: course.title } });
  } catch (e) {
    next(e);
  }
});

// ---------- internal: register a freshly uploaded video ----------
// Called only by scripts/drive-to-b2-sync after it streams a Drive recording
// into B2. If dayNumber isn't given, it becomes (highest existing day + 1).
router.post("/internal/videos", requireInternalToken, async (req, res, next) => {
  try {
    const { course, courseId, title, b2Key, sourceDriveFileId, dayNumber, durationSeconds } = req.body || {};
    const courseRef = course || courseId;
    if (!courseRef || !title || !b2Key) {
      return res.status(400).json({ ok: false, error: "course, title and b2Key are required" });
    }
    if (!mongoose.isValidObjectId(courseRef)) {
      return res.status(400).json({ ok: false, error: "course is not a valid id" });
    }

    const courseDoc = await Course.findById(courseRef);
    if (!courseDoc) return res.status(404).json({ ok: false, error: "Course not found" });

    const existing = await Video.findOne({ b2Key });
    if (existing) {
      // Idempotent: the sync script's state file should prevent this, but if
      // it re-registers the same object, hand back the existing row.
      return res.status(200).json({ ok: true, video: existing, alreadyRegistered: true });
    }

    let day = Number(dayNumber);
    if (!Number.isInteger(day) || day < 1) {
      // One past the current highest day for this course — never collides with
      // an existing dayNumber the way a plain count would after a deletion.
      const last = await Video.findOne({ course: courseRef }).sort({ dayNumber: -1 }).select("dayNumber");
      day = (last ? last.dayNumber : 0) + 1;
    }

    const video = await Video.create({
      course: courseRef,
      title,
      b2Key,
      sourceDriveFileId: sourceDriveFileId || null,
      dayNumber: day,
      durationSeconds: Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : null,
    });
    res.status(201).json({ ok: true, video });
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ ok: false, error: "A video with this b2Key already exists" });
    }
    next(e);
  }
});

// ---------- admin: manage the drip schedule ----------
router.get("/admin/videos", requireAdmin, async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.courseId) filter.course = req.query.courseId;
    const videos = await Video.find(filter).sort({ course: 1, dayNumber: 1, createdAt: 1 });
    res.json({ ok: true, videos });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/videos/:id", requireAdmin, async (req, res, next) => {
  try {
    const { title, dayNumber } = req.body || {};
    const update = {};
    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ ok: false, error: "Title can't be empty" });
      update.title = String(title).trim();
    }
    if (dayNumber !== undefined) {
      const day = Number(dayNumber);
      if (!Number.isInteger(day) || day < 1) {
        return res.status(400).json({ ok: false, error: "dayNumber must be a positive whole number" });
      }
      update.dayNumber = day;
    }
    const video = await Video.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!video) return res.status(404).json({ ok: false, error: "Video not found" });
    res.json({ ok: true, video });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/videos/:id", requireAdmin, async (req, res, next) => {
  try {
    // Only removes the metadata row — the object stays in B2 (delete it there
    // separately if you really want it gone).
    const video = await Video.findByIdAndDelete(req.params.id);
    if (!video) return res.status(404).json({ ok: false, error: "Video not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
