// A student deleting their own account (Profile → Delete my account) — the
// right to erasure under the Digital Personal Data Protection Act 2023.
//
//   GET  /me/account/deletion           what deleting would remove, and what is kept
//   POST /me/account/deletion/send-code emails a one-time code to the account's own address
//   POST /me/account/deletion           { code, confirm: true } — deletes it, now
//
// The code proves the request comes from the owner of the email address, not
// just from whoever has the logged-in tab open. The erasure itself is shared
// with Admin → Users (utils/accountDeletion.js).
const express = require("express");
const rateLimit = require("express-rate-limit");
const { prisma } = require("../db");
const { requireAuth } = require("../middleware/requireAuth");
const { issueOtp, verifyOtp, PURPOSES, OTP_TTL_MS } = require("../utils/otp");
const { sendOtpEmail, sendAccountDeletedEmail } = require("../utils/mailer");
const { deleteAccount, deletionSummary } = require("../utils/accountDeletion");

const router = express.Router();

const OTP_MINUTES = Math.round(OTP_TTL_MS / 60000);
const deletionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many attempts. Please try again in a few minutes." },
});

// Admin accounts are removed by another admin (Admin → Users), never from a profile page.
async function studentOrRefuse(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) {
    res.status(404).json({ ok: false, error: "Account not found" });
    return null;
  }
  if (user.role !== "student") {
    res.status(400).json({ ok: false, error: "Admin accounts can't be deleted from the profile page." });
    return null;
  }
  return user;
}

router.get("/me/account/deletion", requireAuth, async (req, res, next) => {
  try {
    const user = await studentOrRefuse(req, res);
    if (!user) return;
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, summary: await deletionSummary(user.id) });
  } catch (e) {
    next(e);
  }
});

router.post("/me/account/deletion/send-code", requireAuth, deletionLimiter, async (req, res, next) => {
  try {
    const user = await studentOrRefuse(req, res);
    if (!user) return;
    const issued = await issueOtp(user.id, PURPOSES.DELETE_ACCOUNT);
    if (!issued.code) {
      return res.status(429).json({ ok: false, error: `A code was sent a moment ago. You can request another in ${issued.wait}s.` });
    }
    let sent;
    try {
      sent = await sendOtpEmail({ to: user.email, name: user.name, code: issued.code, purpose: PURPOSES.DELETE_ACCOUNT, ttlMinutes: OTP_MINUTES });
    } catch (mailErr) {
      console.error("[account] deletion code email failed:", mailErr.message);
      sent = { sent: false };
    }
    // Same as the other codes: say plainly when the email couldn't go out, and
    // drop the code so the resend cooldown doesn't lock them out.
    if (!sent || (!sent.sent && !sent.dev)) {
      await prisma.emailOtp.deleteMany({ where: { userId: user.id, purpose: PURPOSES.DELETE_ACCOUNT } });
      return res.status(503).json({ ok: false, error: "We couldn't send the verification email right now. Please try again in a bit." });
    }
    res.json({ ok: true, sentTo: user.email, message: `We've emailed a 6-digit code to ${user.email}. It expires in ${OTP_MINUTES} minutes.` });
  } catch (e) {
    next(e);
  }
});

router.post("/me/account/deletion", requireAuth, deletionLimiter, async (req, res, next) => {
  try {
    const user = await studentOrRefuse(req, res);
    if (!user) return;
    const { code, confirm } = req.body || {};
    if (confirm !== true) {
      return res.status(400).json({ ok: false, error: "Tick the box to confirm you understand this can't be undone." });
    }
    if (!(await verifyOtp(user.id, PURPOSES.DELETE_ACCOUNT, code))) {
      return res.status(400).json({ ok: false, error: "That code isn't right or has expired. Ask for a new one and try again." });
    }

    const result = await deleteAccount(user, { requestedBy: "self" });
    if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
    console.log(`[account] user ${user.id} deleted their own account`);

    // Best-effort: the account is already gone whether or not this arrives.
    sendAccountDeletedEmail({ to: user.email, name: user.name, paymentsKept: result.paymentsKept })
      .catch((mailErr) => console.error("[account] deletion confirmation email failed:", mailErr.message));
    res.json({ ok: true, paymentsKept: result.paymentsKept });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
