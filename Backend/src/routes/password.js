const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { prisma } = require("../db");
const { requireAuth } = require("../middleware/requireAuth");
const { isValidEmail } = require("../utils/validators");
const { respondNoEarlierThan } = require("../utils/authTiming");
const { issueOtp, verifyOtp, clearOtps, PURPOSES, OTP_TTL_MS } = require("../utils/otp");
const { decryptPassword } = require("../utils/passwordVault");
const { ensureDefaultPassword } = require("../utils/accounts");
const { sendOtpEmail, sendPasswordChangedEmail } = require("../utils/mailer");

// Mounted at /api/auth (app.js), alongside routes/auth.js.
//
//   POST /forgot-password          email -> emails a 6-digit code
//   POST /reset-password           email + code + newPassword -> sets it
//   POST /change-password          (logged in) current + new password
//   POST /password/reveal/request  (logged in) emails a code
//   POST /password/reveal/verify   (logged in) code -> shows the starter password
const router = express.Router();

const OTP_MINUTES = Math.round(OTP_TTL_MS / 60000);

// Same length rules as signup (routes/auth.js): 8 minimum, and 72 is bcrypt's
// own input limit — beyond it bcryptjs would silently truncate.
function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 8) return "Password must be at least 8 characters";
  if (pw.length > 72) return "Password must be at most 72 characters";
  return null;
}

const limiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Too many attempts. Please try again in a few minutes." },
  });
const forgotLimiter = limiter(10);
const resetLimiter = limiter(15);
const changeLimiter = limiter(10);
const revealLimiter = limiter(15);

// Every way a code can be wrong — no such account, no code requested, expired,
// used up, mistyped — gets this one message, so it can't be used to probe
// which emails have accounts or what state their code is in.
const BAD_CODE = "That code is invalid or has expired. Request a new one.";

// Password change/reset is an event worth telling the owner about; a failure to
// send it must never fail the change that already happened.
function notifyPasswordChanged(user) {
  sendPasswordChangedEmail({ to: user.email, name: user.name }).catch((e) =>
    console.error("[password] password-changed email failed:", e.message)
  );
}

// ---------- forgot password: step 1 — email a code ----------
router.post("/forgot-password", forgotLimiter, async (req, res, next) => {
  try {
    const { email } = req.body || {};
    const normalized = String(email || "").toLowerCase().trim();
    if (!isValidEmail(normalized)) {
      return res.status(400).json({ ok: false, error: "Enter a valid email address." });
    }

    const workStartedAt = Date.now();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (user) {
      const issued = await issueOtp(user.id, PURPOSES.RESET);
      if (issued.code) {
        // Not awaited: an SMTP round-trip's duration would otherwise tell an
        // attacker whether this email has an account. Failures are logged.
        sendOtpEmail({ to: user.email, name: user.name, code: issued.code, purpose: PURPOSES.RESET, ttlMinutes: OTP_MINUTES }).catch((e) =>
          console.error("[password] reset code email failed:", e.message)
        );
      }
    }
    // Identical response whether or not the account exists (or a code was
    // just sent) — a "forgot password" flow must never confirm an account.
    respondNoEarlierThan(workStartedAt, () =>
      res.json({ ok: true, message: "If an account exists for that email, we've sent a 6-digit code to it. It expires in 10 minutes." })
    );
  } catch (e) {
    next(e);
  }
});

// ---------- forgot password: step 2 — code + new password ----------
router.post("/reset-password", resetLimiter, async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    const normalized = String(email || "").toLowerCase().trim();
    if (!isValidEmail(normalized) || !otp) {
      return res.status(400).json({ ok: false, error: "Enter your email and the 6-digit code." });
    }
    const problem = passwordProblem(newPassword);
    if (problem) return res.status(400).json({ ok: false, error: problem });

    const workStartedAt = Date.now();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    const valid = user ? await verifyOtp(user.id, PURPOSES.RESET, otp) : false;
    if (!user || !valid) {
      return respondNoEarlierThan(workStartedAt, () => res.status(400).json({ ok: false, error: BAD_CODE }));
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        // They've now chosen their own — the encrypted starter copy must go,
        // and can never be shown again.
        defaultPasswordEnc: null,
        // Sign every device out: whoever knew the old password (or had the
        // account open) has to log in again with the new one.
        activeSessionId: null,
        activeSessionLastSeenAt: null,
      },
    });
    await clearOtps(user.id);
    notifyPasswordChanged(user);
    res.json({ ok: true, message: "Password updated. You can log in with it now." });
  } catch (e) {
    next(e);
  }
});

// ---------- change password (logged in) ----------
router.post("/change-password", requireAuth, changeLimiter, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword) return res.status(400).json({ ok: false, error: "Enter your current password." });
    const problem = passwordProblem(newPassword);
    if (problem) return res.status(400).json({ ok: false, error: problem });

    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    if (!user.passwordHash) {
      return res.status(400).json({
        ok: false,
        error: "This account doesn't have a password yet. Use \"View password\" below to get your starter password first, or reset it via Forgot password.",
      });
    }

    // A wrong current password is a 400, not a 401: the client treats every 401
    // as "session ended" and logs the user out.
    if (!(await bcrypt.compare(String(currentPassword), user.passwordHash))) {
      return res.status(400).json({ ok: false, error: "Your current password is incorrect." });
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({ ok: false, error: "Choose a new password that's different from your current one." });
    }

    await prisma.user.update({
      where: { id: user.id },
      // Their own password from here on; drop the encrypted starter copy.
      // The active session is left alone — this is the person using it.
      data: { passwordHash: await bcrypt.hash(newPassword, 10), defaultPasswordEnc: null },
    });
    notifyPasswordChanged(user);
    res.json({ ok: true, message: "Password changed." });
  } catch (e) {
    next(e);
  }
});

// ---------- view your starter password (logged in) ----------
// Only a SYSTEM-generated password can be shown (see utils/passwordVault.js).
// One the user chose is bcrypt-only — there's nothing to reveal, and the UI
// says so instead of offering this.
router.post("/password/reveal/request", requireAuth, revealLimiter, async (req, res, next) => {
  try {
    let user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    // A Google account from before starter passwords existed: create its one
    // now, so there's something to show.
    if (!user.passwordHash && user.googleId) user = await ensureDefaultPassword(user);

    if (!user.defaultPasswordEnc) {
      return res.status(400).json({
        ok: false,
        code: "NOT_REVEALABLE",
        error: "Your password was set by you, so it's stored in a form nobody can read back. Use \"Change password\" to set a new one, or \"Forgot password\" on the login form if you've lost it.",
      });
    }

    const issued = await issueOtp(user.id, PURPOSES.REVEAL);
    if (!issued.code) {
      return res.status(429).json({ ok: false, error: `A code was sent a moment ago. You can request another in ${issued.wait}s.` });
    }

    let sent;
    try {
      sent = await sendOtpEmail({ to: user.email, name: user.name, code: issued.code, purpose: PURPOSES.REVEAL, ttlMinutes: OTP_MINUTES });
    } catch (mailErr) {
      console.error("[password] reveal code email failed:", mailErr.message);
      sent = { sent: false };
    }
    // Unlike forgot-password this caller is a logged-in owner (nothing to
    // enumerate), so tell them plainly if the email couldn't go out — and drop
    // the code, so the cooldown doesn't lock them out of retrying.
    if (!sent.sent && !sent.dev) {
      await prisma.emailOtp.deleteMany({ where: { userId: user.id, purpose: PURPOSES.REVEAL } });
      return res.status(503).json({ ok: false, error: "We couldn't send the verification email right now. Please try again in a bit." });
    }
    res.json({ ok: true, message: `We've emailed a 6-digit code to ${user.email}. It expires in ${OTP_MINUTES} minutes.` });
  } catch (e) {
    next(e);
  }
});

router.post("/password/reveal/verify", requireAuth, revealLimiter, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    if (!(await verifyOtp(user.id, PURPOSES.REVEAL, (req.body || {}).otp))) {
      return res.status(400).json({ ok: false, error: BAD_CODE });
    }
    const password = user.defaultPasswordEnc ? decryptPassword(user.defaultPasswordEnc) : null;
    if (!password) {
      return res.status(400).json({ ok: false, code: "NOT_REVEALABLE", error: "There's no starter password to show for this account." });
    }
    // The one place a plaintext password leaves the server: never cache it.
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, password });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
