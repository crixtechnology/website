const express = require("express");
const { prisma } = require("../db");
const { requireAuth } = require("../middleware/requireAuth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { requireEnrollment } = require("../middleware/requireEnrollment");
const { requireInternalToken } = require("../middleware/requireInternalToken");
const { buildSignedUrl } = require("../utils/signedVideoUrl");
const { isB2Configured, deleteObjectAllVersions } = require("../utils/b2Storage");
const { serialize } = require("../utils/serialize");

const { queryText } = require("../utils/validators");
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
    const videos = await prisma.video.findMany({
      where: { courseId: req.params.courseId },
      orderBy: [{ dayNumber: "asc" }, { createdAt: "asc" }],
    });
    res.json({
      ok: true,
      videos: videos.map((v) => ({
        _id: v.id,
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

    const video = await prisma.video.findFirst({ where: { id: req.params.videoId, courseId: req.params.courseId } });
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
    if (!courseId) {
      return res.status(400).json({ ok: false, error: "courseId is missing or not a valid id" });
    }
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true } });
    if (!course) return res.status(404).json({ ok: false, error: "Course not found" });
    res.json({ ok: true, course: { _id: course.id, title: course.title } });
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

    const courseDoc = await prisma.course.findUnique({ where: { id: courseRef } });
    if (!courseDoc) return res.status(404).json({ ok: false, error: "Course not found" });

    const existing = await prisma.video.findUnique({ where: { b2Key } });
    if (existing) {
      // Idempotent: the sync script's state file should prevent this, but if
      // it re-registers the same object, hand back the existing row.
      return res.status(200).json({ ok: true, video: serialize(existing, "video"), alreadyRegistered: true });
    }

    let day = Number(dayNumber);
    if (!Number.isInteger(day) || day < 1) {
      // One past the current highest day for this course — never collides with
      // an existing dayNumber the way a plain count would after a deletion.
      const last = await prisma.video.findFirst({ where: { courseId: courseRef }, orderBy: { dayNumber: "desc" } });
      day = (last ? last.dayNumber : 0) + 1;
    }

    let video;
    try {
      video = await prisma.video.create({
        data: {
          courseId: courseRef,
          title,
          b2Key,
          sourceDriveFileId: sourceDriveFileId || null,
          dayNumber: day,
          durationSeconds: Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : null,
        },
      });
    } catch (createErr) {
      if (createErr && createErr.code === "P2002") {
        return res.status(409).json({ ok: false, error: "A video with this b2Key already exists" });
      }
      throw createErr;
    }
    res.status(201).json({ ok: true, video: serialize(video, "video") });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: curate a course's recorded videos ----------
router.get("/admin/videos", requireAdmin, async (req, res, next) => {
  try {
    const where = {};
    if (queryText(req.query.courseId)) where.courseId = queryText(req.query.courseId);
    const videos = await prisma.video.findMany({
      where,
      orderBy: [{ courseId: "asc" }, { dayNumber: "asc" }, { createdAt: "asc" }],
    });
    res.json({ ok: true, videos: serialize(videos, "video") });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/videos/:id", requireAdmin, async (req, res, next) => {
  try {
    const { title, dayNumber, courseId } = req.body || {};
    const data = {};
    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ ok: false, error: "Title can't be empty" });
      data.title = String(title).trim();
    }
    if (dayNumber !== undefined) {
      const day = Number(dayNumber);
      if (!Number.isInteger(day) || day < 1) {
        return res.status(400).json({ ok: false, error: "dayNumber must be a positive whole number" });
      }
      data.dayNumber = day;
    }

    const existing = await prisma.video.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ ok: false, error: "Video not found" });

    // Move the video to another course or internship — for a recording the
    // sync filed under the wrong one. Only the database row moves: the file in
    // B2 is keyed by its own name, not by course, so nothing is re-uploaded.
    if (courseId !== undefined && courseId !== existing.courseId) {
      if (typeof courseId !== "string" || !courseId) {
        return res.status(400).json({ ok: false, error: "courseId must be a course or internship id" });
      }
      const target = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
      if (!target) return res.status(404).json({ ok: false, error: "Course not found" });
      data.courseId = courseId;
      // Unless the admin gave a day too, it goes at the end of the target's
      // list — a day number from the old course would just collide there.
      if (dayNumber === undefined) {
        const last = await prisma.video.findFirst({ where: { courseId }, orderBy: { dayNumber: "desc" } });
        data.dayNumber = (last ? last.dayNumber : 0) + 1;
      }
    }

    const video = await prisma.video.update({ where: { id: req.params.id }, data }).catch(() => null);
    if (!video) return res.status(404).json({ ok: false, error: "Video not found" });
    res.json({ ok: true, video: serialize(video, "video") });
  } catch (e) {
    next(e);
  }
});

// Two separate actions on the same endpoint:
//   DELETE /admin/videos/:id                    remove it from the site only — the
//                                               file stays in Backblaze.
//   DELETE /admin/videos/:id?deleteFile=true    also permanently delete the file
//                                               from Backblaze (every version).
// Deleting the file is opt-in, so a plain DELETE can never destroy one. When it
// IS asked for it either fully succeeds or changes nothing: the file goes first,
// and if that fails (or Backblaze isn't configured on this server, see
// utils/b2Storage.js) the row is kept, so the video isn't left pointing at a
// missing file or a file nobody can see.
router.delete("/admin/videos/:id", requireAdmin, async (req, res, next) => {
  try {
    const video = await prisma.video.findUnique({ where: { id: req.params.id } });
    if (!video) return res.status(404).json({ ok: false, error: "Video not found" });

    let storage = "kept";
    let filesRemoved = 0;
    if (req.query.deleteFile === "true") {
      if (!isB2Configured()) {
        return res.status(503).json({
          ok: false,
          error: "This server isn't connected to Backblaze, so the file can't be deleted. Nothing was changed. Use \"Remove from site\" to take it off the site only.",
        });
      }
      try {
        ({ removed: filesRemoved } = await deleteObjectAllVersions(video.b2Key));
        storage = "deleted";
      } catch (storageErr) {
        console.error(`[videos] Backblaze delete failed for ${video.b2Key}:`, storageErr.message);
        return res.status(502).json({
          ok: false,
          error: `Couldn't delete the file from Backblaze (${storageErr.message}). Nothing was changed.`,
        });
      }
    }

    await prisma.video.delete({ where: { id: video.id } }).catch(() => null);
    res.json({ ok: true, storage, filesRemoved });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
