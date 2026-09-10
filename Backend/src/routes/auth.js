const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { requireAuth } = require("../middleware/requireAuth");
const { isDisposableEmail } = require("../utils/disposableEmail");

const router = express.Router();
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role };
}

// ---------- student self-signup (role is always "student" — admin accounts
// are only ever created by scripts/seedAdmin.js) ----------
router.post("/signup", async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: "name, email and password are required" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
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
    const token = signToken(user);
    res.status(201).json({ ok: true, token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// ---------- unified login — works for both students and admins ----------
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required" });
    }
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(401).json({ ok: false, error: "Invalid credentials" });
    if (!user.passwordHash) {
      return res.status(401).json({ ok: false, error: "This account uses Google Sign-In. Continue with Google instead." });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    const token = signToken(user);
    res.json({ ok: true, token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// ---------- Google Sign-In (student popup only — see Frontend AuthModal) ----------
// Body is { credential }: the ID token Google's Identity Services button
// hands back client-side. Verified server-side against GOOGLE_CLIENT_ID —
// the client is never trusted for who the user actually is.
router.post("/google", async (req, res, next) => {
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

    const token = signToken(user);
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
      if (p) {
        const digits = p.replace(/\D/g, "");
        if (digits.length < 8 || digits.length > 15) {
          return res.status(400).json({ ok: false, error: "Enter a valid phone number." });
        }
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
