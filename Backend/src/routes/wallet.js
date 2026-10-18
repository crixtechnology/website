const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { prisma } = require("../db");
const { publicWriteLimiter } = require("../utils/rateLimit");
const { getWallet, adjustCredit, claimSignupBonus } = require("../utils/wallet");
const { issueOtp, verifyOtp, PURPOSES, OTP_TTL_MS } = require("../utils/otp");
const { sendOtpEmail } = require("../utils/mailer");

const router = express.Router();

// ---------- student: my wallet (balance + history) ----------
router.get("/me/wallet", requireAuth, async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, wallet: await getWallet(req.user.sub) });
  } catch (e) {
    next(e);
  }
});

// ---------- student: verify my email to release the signup bonus ----------
// Sends a 6-digit code to the account's own email address (never one from the
// request), at most once a minute.
router.post("/me/signup-bonus/send-code", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { id: true, name: true, email: true, signupBonusPending: true } });
    if (!user || !user.signupBonusPending) return res.status(400).json({ ok: false, error: "There's no bonus waiting on this account." });
    const issued = await issueOtp(user.id, PURPOSES.VERIFY_EMAIL);
    if (issued.wait) return res.status(429).json({ ok: false, error: `Please wait ${issued.wait} seconds before asking for another code.` });
    let sent;
    try {
      sent = await sendOtpEmail({ to: user.email, name: user.name, code: issued.code, purpose: PURPOSES.VERIFY_EMAIL, ttlMinutes: Math.round(OTP_TTL_MS / 60000) });
    } catch (mailErr) {
      console.error("[wallet] bonus code email failed:", mailErr.message);
      sent = { sent: false };
    }
    // Same as the password-reveal code: say plainly when the email couldn't go
    // out, and drop the code so the resend cooldown doesn't lock them out.
    if (!sent || (!sent.sent && !sent.dev)) {
      await prisma.emailOtp.deleteMany({ where: { userId: user.id, purpose: PURPOSES.VERIFY_EMAIL } });
      return res.status(503).json({ ok: false, error: "We couldn't send the verification email right now. Please try again in a bit." });
    }
    res.json({ ok: true, sentTo: user.email });
  } catch (e) {
    next(e);
  }
});

// Body: { code }. A right code releases the bonus into the wallet.
router.post("/me/signup-bonus/verify", publicWriteLimiter, requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { id: true, signupBonusPending: true } });
    if (!user || !user.signupBonusPending) return res.status(400).json({ ok: false, error: "There's no bonus waiting on this account." });
    const ok = await verifyOtp(user.id, PURPOSES.VERIFY_EMAIL, req.body && req.body.code);
    if (!ok) return res.status(400).json({ ok: false, error: "That code isn't right or has expired. Ask for a new one and try again." });
    const credited = await claimSignupBonus(user.id);
    res.json({ ok: true, credited, wallet: await getWallet(user.id) });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: add credit to / take credit from a student's wallet ----------
// Body: { rupees: whole number (negative to take away), note?: string }.
router.post("/admin/users/:id/wallet", requireAdmin, async (req, res, next) => {
  try {
    const { rupees, note } = req.body || {};
    const result = await adjustCredit({ userId: req.params.id, rupees, note, adminId: req.admin.sub });
    if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
    res.status(201).json({ ok: true, wallet: await getWallet(req.params.id, 20) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
