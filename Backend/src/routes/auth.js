const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { requireAuth } = require("../middleware/requireAuth");
const { isDisposableEmail } = require("../utils/disposableEmail");
const { isValidEmail, isValidPhone } = require("../utils/validators");
const { signToken: signJwt } = require("../utils/jwt");

const router = express.Router();
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

// Throttles the credential-guessing surface — /login (password brute-force),
// /signup (mass account creation) and /google (token-verification spam) all
// cost a bcrypt hash or a network round-trip per attempt, so a stuck client
// or a script hammering any of them is worth capping well before it becomes
// abuse. Keyed by IP (the default), which is what actually limits a single
// attacker's guess rate; a shared office/NAT IP just gets a generous budget,
// not blocked outright. 429's body deliberately says nothing about *why* a
// given request was the one that tipped the limit — same "don't help an
// attacker calibrate" reasoning as the generic "Invalid credentials" below.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many attempts. Please try again in a few minutes." },
});

function signToken(user, sessionId) {
  const payload = { sub: user._id.toString(), email: user.email, role: user.role, name: user.name };
  if (sessionId) payload.sid = sessionId;
  return signJwt(payload, { expiresIn: "7d" });
}

// Single-device-login enforcement is student-only (see requireAuth.js) — an
// admin token is never given a `sid`, so it's never checked against
// activeSessionId and admins can stay logged in on as many devices as they
// like. For a student, every fresh login mints a new session id and writes
// it onto the user doc, which invalidates any token issued to that account
// on another device.
async function startSession(user) {
  if (user.role !== "student") return null;
  const sessionId = crypto.randomBytes(24).toString("hex");
  user.activeSessionId = sessionId;
  await user.save();
  return sessionId;
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role };
}

// ---------- student self-signup (role is always "student" — admin accounts
// are only ever created by scripts/seedAdmin.js) ----------
router.post("/signup", authLimiter, async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: "name, email and password are required" });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ ok: false, error: "Enter a valid email address." });
    }
    // Lower bound matches modern guidance (length over complexity rules —
    // NIST SP 800-63B); upper bound isn't a strength rule, it's a hard cap
    // matching bcrypt's own 72-byte input limit, so a very long password
    // fails loudly here instead of hashing to the same value as its first
    // 72 bytes (bcryptjs silently truncates beyond that).
    if (String(password).length < 8) {
      return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
    }
    if (String(password).length > 72) {
      return res.status(400).json({ ok: false, error: "Password must be at most 72 characters" });
    }
    if (isDisposableEmail(normalizedEmail)) {
      return res.status(400).json({
        ok: false,
        error: "Temporary/disposable email addresses aren't allowed — please use a permanent email.",
      });
    }
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ ok: false, error: "An account with this email already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(), email: normalizedEmail, phone: phone || "", passwordHash, role: "student",
    });
    const sessionId = await startSession(user);
    const token = signToken(user, sessionId);
    res.status(201).json({ ok: true, token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// ---------- unified login — works for both students and admins ----------
router.post("/login", authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required" });
    }
    // Deliberately NOT rejecting long passwords here the way signup does —
    // the 72-char cap above is a going-forward rule for accounts created
    // after it existed. Signup had no upper bound before this change, so an
    // account from before it could have a real, correct password longer
    // than 72 characters; bcryptjs truncates consistently on both hash and
    // compare, so bcrypt.compare below still resolves it correctly. Rate
    // limiting (authLimiter above) is what actually bounds abuse here.
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(401).json({ ok: false, error: "Invalid credentials" });
    if (!user.passwordHash) {
      return res.status(401).json({ ok: false, error: "This account uses Google Sign-In. Continue with Google instead." });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    const sessionId = await startSession(user);
    const token = signToken(user, sessionId);
    res.json({ ok: true, token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// ---------- Google Sign-In (student popup only — see Frontend AuthModal) ----------
// Body is { credential }: the ID token Google's Identity Services button
// hands back client-side. Verified server-side against GOOGLE_CLIENT_ID —
// the client is never trusted for who the user actually is.
router.post("/google", authLimiter, async (req, res, next) => {
  try {
    if (!googleClient) {
      return res.status(503).json({ ok: false, error: "Google Sign-In isn't configured yet." });
    }
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ ok: false, error: "Missing Google credential" });

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch (e) {
      return res.status(401).json({ ok: false, error: "Could not verify Google sign-in" });
    }
    if (!payload || !payload.email_verified) {
      return res.status(401).json({ ok: false, error: "Google account email is not verified" });
    }

    const email = String(payload.email).toLowerCase().trim();
    let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] });

    if (!user) {
      user = await User.create({
        name: payload.name || email.split("@")[0],
        email, phone: "", googleId: payload.sub, role: "student",
      });
    } else if (!user.googleId) {
      // Existing email/password account signing in with Google for the
      // first time — link it rather than creating a duplicate.
      user.googleId = payload.sub;
      await user.save();
    }

    const sessionId = await startSession(user);
    const token = signToken(user, sessionId);
    res.json({ ok: true, token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// ---------- current user (used to restore a session on page load) ----------
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    res.json({ ok: true, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// ---------- update your own profile (name + phone) ----------
// Email is deliberately NOT editable here — it's the login identifier and,
// for Google accounts, the link key. Changing it is a separate verified
// flow, not a plain profile field.
router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    const { name, phone } = req.body || {};

    if (name !== undefined) {
      const n = String(name).trim();
      if (!n) return res.status(400).json({ ok: false, error: "Name can't be empty." });
      if (n.length > 80) return res.status(400).json({ ok: false, error: "Name is too long." });
      user.name = n;
    }

    if (phone !== undefined) {
      const p = String(phone).trim();
      if (p && !isValidPhone(p)) {
        return res.status(400).json({ ok: false, error: "Enter a valid phone number." });
      }
      user.phone = p;
    }

    await user.save();
    res.json({ ok: true, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
