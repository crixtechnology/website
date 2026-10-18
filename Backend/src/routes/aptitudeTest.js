// The aptitude test itself: start (or resume) the one attempt an application's
// payment bought, save answers as they are picked, log anti-cheating violations
// and webcam snapshots, and submit.
//
// What the browser is never trusted with:
//   - the right answers: the paper goes out without them (publicPaper) and
//     scoring happens only here (utils/careers.js scorePaper);
//   - the clock: startedAt/endsAt are stored when the test starts, every
//     request is checked against them, and an answer that arrives after the end
//     is refused — refreshing or changing the device clock adds nothing;
//   - the violation count: counted and enforced here, and reaching the limit
//     submits the test from the server;
//   - which window is "the" test: one session id per attempt, so a second
//     window or device can't drive the same attempt.
const express = require("express");
const crypto = require("crypto");
const { prisma } = require("../db");
const { requireAuth } = require("../middleware/requireAuth");
const { testApiLimiter } = require("../utils/testRateLimit");
const { getCareerSettings } = require("../utils/careerSettings");
const { saveSnapshot, PENDING_PREFIX } = require("../utils/proctorStorage");
const {
  normalizeCounts, buildPaper, publicPaper, finalizeAttempt, describeUserAgent, verifyDesktopAppToken,
} = require("../utils/careers");

const router = express.Router();

// A request already on its way when the clock hit zero still counts.
const GRACE_MS = 2000;
// A session that hasn't called in for this long is treated as gone, so the
// candidate can carry on from a refreshed tab or after a reconnect. The test
// page sends a heartbeat every 10 seconds.
const SESSION_STALE_MS = 25 * 1000;
// Violations of one incident arrive in a burst (switching tabs fires both a
// "tab hidden" and a "window lost focus"): only the first of a burst counts.
const SAME_INCIDENT_MS = 1500;

// Every violation is logged; only these count toward the auto-submit limit.
// The rest (a blocked copy, paste or right-click, a face-detector flag) are
// kept as a record for the admin's review.
const COUNTED_TYPES = ["fullscreen_exit", "tab_switch", "window_blur"];
const LOGGED_TYPES = ["copy", "cut", "paste", "context_menu", "shortcut", "no_face", "multiple_faces", "webcam_off"];
const FACE_FLAGS = ["no_face", "multiple_faces"];

const MAX_SNAPSHOT_BYTES = 400 * 1024;
const MIN_SNAPSHOT_GAP_MS = 10 * 1000;

const newSessionId = () => crypto.randomBytes(24).toString("hex");
const remainingMs = (attempt) => Math.max(0, attempt.endsAt.getTime() - Date.now());

// The rules a candidate reads before starting, for one application.
function rulesFor(opening, settings) {
  const counts = normalizeCounts(opening.questionCounts);
  return {
    durationMinutes: opening.durationMinutes,
    questions: Object.values(counts).reduce((a, b) => a + b, 0),
    marksPerQuestion: opening.marksPerQuestion,
    negativeMarks: opening.negativeMarks,
    violationLimit: settings.violationLimit,
    snapshotIntervalSeconds: settings.snapshotIntervalSeconds,
    requireWebcam: settings.requireWebcam,
    requireDesktopApp: settings.requireDesktopApp,
  };
}

// Loads the attempt a test request is about and checks the caller may drive it:
// it is theirs, still running, inside its time, and theirs is the active
// session. Answers the request itself (and returns null) when any of that fails.
async function activeAttempt(req, res) {
  const attempt = await prisma.testAttempt.findUnique({ where: { id: req.params.attemptId } });
  if (!attempt || attempt.userId !== req.user.sub) {
    res.status(404).json({ ok: false, error: "Test not found" });
    return null;
  }
  if (attempt.status !== "in_progress") {
    res.status(409).json({ ok: false, code: "submitted", reason: attempt.submitReason, error: "This test has already been submitted." });
    return null;
  }
  if (Date.now() > attempt.endsAt.getTime() + GRACE_MS) {
    await finalizeAttempt(attempt.id, "time_up");
    res.status(409).json({ ok: false, code: "submitted", reason: "time_up", error: "Time is up — your test has been submitted." });
    return null;
  }
  const session = req.get("x-test-session");
  if (!session || session !== attempt.sessionId) {
    res.status(409).json({ ok: false, code: "session", error: "This test is open in another window or device." });
    return null;
  }
  return attempt;
}

// ---------- before the test: its rules and where it stands ----------
router.get("/me/job-applications/:id/test", requireAuth, testApiLimiter, async (req, res, next) => {
  try {
    const application = await prisma.jobApplication.findUnique({ where: { id: req.params.id }, include: { opening: true, attempt: true } });
    if (!application || application.userId !== req.user.sub) return res.status(404).json({ ok: false, error: "Application not found" });
    let attempt = application.attempt;
    if (attempt && attempt.status === "in_progress" && Date.now() > attempt.endsAt.getTime() + GRACE_MS) {
      attempt = await finalizeAttempt(attempt.id, "time_up");
    }
    const settings = await getCareerSettings();
    const state = attempt
      ? (attempt.status === "in_progress" ? "in_progress" : "submitted")
      : application.status === "test_pending" ? "ready" : application.status === "payment_pending" ? "locked" : "submitted";
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      state,
      role: application.opening.title,
      rules: rulesFor(application.opening, settings),
      serverNow: new Date(),
      attempt: attempt ? { _id: attempt.id, endsAt: attempt.endsAt, submitReason: attempt.submitReason, violationCount: attempt.violationCount } : null,
    });
  } catch (e) {
    next(e);
  }
});

// ---------- start, or come back to, the test ----------
// Body: { consent: true, sessionId?: <the session this tab already holds> }.
// The first call creates the attempt: draws the paper and starts the clock.
// Every later call (a refresh, a reconnect) returns the SAME paper, the answers
// saved so far and the time left on the SAME clock.
router.post("/me/job-applications/:id/test/start", requireAuth, testApiLimiter, async (req, res, next) => {
  try {
    const { consent, adult, sessionId: claimed } = req.body || {};
    const application = await prisma.jobApplication.findUnique({ where: { id: req.params.id }, include: { opening: true, attempt: true } });
    if (!application || application.userId !== req.user.sub) return res.status(404).json({ ok: false, error: "Application not found" });

    const settings = await getCareerSettings();
    const viaDesktopApp = verifyDesktopAppToken(req.get("x-crix-app-token"), req.user.sub);
    if (settings.requireDesktopApp && !viaDesktopApp) {
      return res.status(403).json({ ok: false, code: "desktop_app", error: "This test can only be taken in the Crix test app." });
    }

    let attempt = application.attempt;
    let sessionId = null;
    if (!attempt) {
      if (application.status === "payment_pending") return res.status(400).json({ ok: false, error: "Pay the test fee to unlock this test." });
      if (application.status !== "test_pending") return res.status(400).json({ ok: false, error: "This test has already been taken." });
      if (consent !== true) return res.status(400).json({ ok: false, error: "Please accept the test rules and webcam monitoring to start." });
      // Adults only. Confirmed when the fee was paid; an application paid before
      // that existed confirms it here, with the same box as the rules.
      if (!application.adultConfirmedAt) {
        if (adult !== true) return res.status(400).json({ ok: false, code: "ADULT_REQUIRED", error: "The aptitude test is only for candidates aged 18 or older. Please confirm your age to start." });
        await prisma.jobApplication.update({ where: { id: application.id }, data: { adultConfirmedAt: new Date() } });
      }

      const paper = await buildPaper(application.opening, settings);
      if (paper.length === 0) {
        return res.status(503).json({ ok: false, error: "This test isn't ready yet. Please try again a little later, or contact us." });
      }
      const { browser, device } = describeUserAgent(req.get("user-agent"));
      const now = new Date();
      sessionId = newSessionId();
      try {
        attempt = await prisma.$transaction(async (tx) => {
          // One attempt per payment: the application row is locked, so two
          // "Start" clicks can't both find no attempt and each create one.
          await tx.$queryRaw`SELECT id FROM job_applications WHERE id = ${application.id} FOR UPDATE`;
          const fresh = await tx.jobApplication.findUnique({ where: { id: application.id }, include: { attempt: true } });
          if (fresh.attempt) return null;
          if (fresh.status !== "test_pending") return null;
          return tx.testAttempt.create({
            data: {
              applicationId: application.id,
              userId: req.user.sub,
              startedAt: now,
              endsAt: new Date(now.getTime() + application.opening.durationMinutes * 60 * 1000),
              settings: {
                durationMinutes: application.opening.durationMinutes,
                marksPerQuestion: application.opening.marksPerQuestion,
                negativeMarks: application.opening.negativeMarks,
                cutoffScore: application.opening.cutoffScore,
                violationLimit: settings.violationLimit,
                snapshotIntervalSeconds: settings.snapshotIntervalSeconds,
                requireWebcam: settings.requireWebcam,
              },
              paper,
              sessionId,
              sessionSeenAt: now,
              webcamConsent: true,
              ip: String(req.ip || "").slice(0, 190),
              userAgent: String(req.get("user-agent") || "").slice(0, 500),
              browser,
              device,
              viaDesktopApp,
            },
          });
        });
      } catch (e) {
        if (!(e && e.code === "P2002")) throw e;
        attempt = null;
      }
      if (!attempt) {
        // Another request created it a moment ago — carry on as a return visit.
        sessionId = null;
        attempt = await prisma.testAttempt.findUnique({ where: { applicationId: application.id } });
        if (!attempt) return res.status(400).json({ ok: false, error: "This test has already been taken." });
      }
    }

    if (attempt.status !== "in_progress") {
      return res.status(409).json({ ok: false, code: "submitted", reason: attempt.submitReason, error: "This test has already been submitted." });
    }
    if (Date.now() > attempt.endsAt.getTime() + GRACE_MS) {
      await finalizeAttempt(attempt.id, "time_up");
      return res.status(409).json({ ok: false, code: "submitted", reason: "time_up", error: "Time is up — your test has been submitted." });
    }

    if (!sessionId) {
      // A return visit. The tab that already holds the session keeps it; anyone
      // else gets in only once that session has stopped calling in.
      if (typeof claimed === "string" && claimed && claimed === attempt.sessionId) {
        sessionId = claimed;
        await prisma.testAttempt.updateMany({ where: { id: attempt.id, sessionId }, data: { sessionSeenAt: new Date() } });
      } else {
        const lastSeen = attempt.sessionSeenAt ? attempt.sessionSeenAt.getTime() : 0;
        if (attempt.sessionId && Date.now() - lastSeen < SESSION_STALE_MS) {
          return res.status(409).json({ ok: false, code: "session", error: "This test is already open in another window or device. Close it there, wait a few seconds, and try again." });
        }
        sessionId = newSessionId();
        // Compare-and-swap on the old session: of two takeovers racing, one wins.
        const won = await prisma.testAttempt.updateMany({
          where: { id: attempt.id, status: "in_progress", sessionId: attempt.sessionId },
          data: { sessionId, sessionSeenAt: new Date() },
        });
        if (won.count !== 1) {
          return res.status(409).json({ ok: false, code: "session", error: "This test is already open in another window or device." });
        }
      }
    }

    const answers = await prisma.testAnswer.findMany({ where: { attemptId: attempt.id }, select: { questionId: true, selected: true, marked: true } });
    const rules = attempt.settings || {};
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      sessionId,
      role: application.opening.title,
      attempt: {
        _id: attempt.id,
        startedAt: attempt.startedAt,
        endsAt: attempt.endsAt,
        serverNow: new Date(),
        remainingMs: remainingMs(attempt),
        violationCount: attempt.violationCount,
        violationLimit: rules.violationLimit || settings.violationLimit,
        snapshotIntervalSeconds: rules.snapshotIntervalSeconds || settings.snapshotIntervalSeconds,
        marksPerQuestion: rules.marksPerQuestion,
        negativeMarks: rules.negativeMarks,
      },
      questions: publicPaper(attempt.paper),
      answers,
    });
  } catch (e) {
    next(e);
  }
});

// ---------- save one answer (called the moment it is picked) ----------
// Body: { questionId, selected: <option number> | null, marked?: boolean }.
router.put("/me/test/:attemptId/answers", requireAuth, testApiLimiter, async (req, res, next) => {
  try {
    const attempt = await activeAttempt(req, res);
    if (!attempt) return;
    const { questionId, selected, marked } = req.body || {};
    const question = typeof questionId === "string" ? (attempt.paper || []).find((q) => q.qid === questionId) : null;
    if (!question) return res.status(400).json({ ok: false, error: "That question isn't part of this test." });
    if (selected !== null && selected !== undefined && !(Number.isInteger(selected) && selected >= 0 && selected < question.options.length)) {
      return res.status(400).json({ ok: false, error: "That isn't one of the options." });
    }
    if (marked !== undefined && typeof marked !== "boolean") return res.status(400).json({ ok: false, error: "marked must be true or false" });

    const data = {
      ...(selected !== undefined ? { selected } : {}),
      ...(marked !== undefined ? { marked } : {}),
    };
    await prisma.testAnswer.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId } },
      create: { attemptId: attempt.id, questionId, selected: selected ?? null, marked: !!marked },
      update: data,
    });
    res.json({ ok: true, remainingMs: remainingMs(attempt) });
  } catch (e) {
    // Two saves of the same never-saved answer racing: the loser's insert hits
    // the unique key. Its value is as good as saved by the next change; say so.
    if (e && e.code === "P2002") return res.status(409).json({ ok: false, code: "retry", error: "Please try that again." });
    next(e);
  }
});

// ---------- heartbeat: keeps the session alive, and syncs the clock ----------
router.post("/me/test/:attemptId/heartbeat", requireAuth, testApiLimiter, async (req, res, next) => {
  try {
    const attempt = await activeAttempt(req, res);
    if (!attempt) return;
    await prisma.testAttempt.updateMany({ where: { id: attempt.id, sessionId: attempt.sessionId }, data: { sessionSeenAt: new Date() } });
    res.json({ ok: true, serverNow: new Date(), remainingMs: remainingMs(attempt), violationCount: attempt.violationCount });
  } catch (e) {
    next(e);
  }
});

// Records one violation under a lock on the attempt (so a burst is counted
// once) and returns { count, counted }.
async function recordViolation(attemptId, type, detail) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM test_attempts WHERE id = ${attemptId} FOR UPDATE`;
    let counted = COUNTED_TYPES.includes(type);
    if (counted) {
      const last = await tx.testViolation.findFirst({ where: { attemptId, counted: true }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      if (last && Date.now() - last.createdAt.getTime() < SAME_INCIDENT_MS) counted = false;
    }
    await tx.testViolation.create({ data: { attemptId, type, detail: String(detail || "").slice(0, 190), counted } });
    const attempt = counted
      ? await tx.testAttempt.update({ where: { id: attemptId }, data: { violationCount: { increment: 1 } }, select: { violationCount: true } })
      : await tx.testAttempt.findUnique({ where: { id: attemptId }, select: { violationCount: true } });
    return { count: attempt.violationCount, counted };
  });
}

// ---------- log a violation ----------
// Body: { type, detail? }. Every one is stored with its time. When the count
// reaches the limit the test is submitted here, on the server.
router.post("/me/test/:attemptId/violations", requireAuth, testApiLimiter, async (req, res, next) => {
  try {
    const attempt = await activeAttempt(req, res);
    if (!attempt) return;
    const { type, detail } = req.body || {};
    if (typeof type !== "string" || !(COUNTED_TYPES.includes(type) || LOGGED_TYPES.includes(type))) {
      return res.status(400).json({ ok: false, error: "Unknown violation type" });
    }
    if (detail !== undefined && typeof detail !== "string") return res.status(400).json({ ok: false, error: "detail must be text" });

    const { count, counted } = await recordViolation(attempt.id, type, detail);
    const limit = (attempt.settings && attempt.settings.violationLimit) || (await getCareerSettings()).violationLimit;
    let submitted = false;
    if (count >= limit) {
      await finalizeAttempt(attempt.id, "violations");
      submitted = true;
    }
    res.json({ ok: true, counted, count, limit, submitted });
  } catch (e) {
    next(e);
  }
});

// ---------- upload a webcam snapshot ----------
// The request body IS the JPEG (Content-Type: image/jpeg). An optional
// X-Face-Flag header carries what the browser's face detector saw. The file
// goes to file storage; only its key is saved here.
router.post(
  "/me/test/:attemptId/snapshots",
  requireAuth,
  testApiLimiter,
  express.raw({ type: "image/jpeg", limit: MAX_SNAPSHOT_BYTES }),
  async (req, res, next) => {
    try {
      const attempt = await activeAttempt(req, res);
      if (!attempt) return;
      const body = req.body;
      const isJpeg = Buffer.isBuffer(body) && body.length > 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
      if (!isJpeg) return res.status(400).json({ ok: false, error: "Send the snapshot as a JPEG image." });

      const rawFlag = String(req.get("x-face-flag") || "");
      const flag = FACE_FLAGS.includes(rawFlag) ? rawFlag : "";

      // No faster than the page is meant to send them, so this can't be used to
      // fill the disk. The check and the row that claims the slot happen under
      // a lock on the attempt, so uploads sent all at once can't all get in;
      // the image itself is uploaded after the lock is let go.
      const slot = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM test_attempts WHERE id = ${attempt.id} FOR UPDATE`;
        const last = await tx.testSnapshot.findFirst({ where: { attemptId: attempt.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
        if (last && Date.now() - last.createdAt.getTime() < MIN_SNAPSHOT_GAP_MS) return null;
        return tx.testSnapshot.create({ data: { attemptId: attempt.id, storageKey: `${PENDING_PREFIX}${crypto.randomBytes(8).toString("hex")}`, flag } });
      });
      if (!slot) return res.status(429).json({ ok: false, error: "Snapshots are being sent too quickly." });

      let storageKey;
      try {
        storageKey = await saveSnapshot(attempt.id, body);
      } catch (uploadErr) {
        // Free the slot, so the next photo isn't refused as "too quick".
        await prisma.testSnapshot.delete({ where: { id: slot.id } }).catch(() => {});
        throw uploadErr;
      }
      await prisma.testSnapshot.update({ where: { id: slot.id }, data: { storageKey } });
      if (flag) await recordViolation(attempt.id, flag, "Flagged by face detection on a webcam snapshot");
      res.status(201).json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

// ---------- submit ----------
router.post("/me/test/:attemptId/submit", requireAuth, testApiLimiter, async (req, res, next) => {
  try {
    const found = await prisma.testAttempt.findUnique({ where: { id: req.params.attemptId } });
    if (!found || found.userId !== req.user.sub) return res.status(404).json({ ok: false, error: "Test not found" });
    let attempt = found;
    if (attempt.status === "in_progress") {
      const session = req.get("x-test-session");
      if (!session || session !== attempt.sessionId) {
        return res.status(409).json({ ok: false, code: "session", error: "This test is open in another window or device." });
      }
      attempt = await finalizeAttempt(attempt.id, Date.now() > attempt.endsAt.getTime() ? "time_up" : "manual");
    }
    // Only that it is in, and how it ended. The score is the admin's to see
    // (routes/adminCareers.js): it is never sent to the candidate.
    res.json({ ok: true, submitted: true, reason: attempt.submitReason });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
