const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { OAuth2Client } = require("google-auth-library");
const { prisma } = require("../db");
const { requireAuth } = require("../middleware/requireAuth");
const { isDisposableEmail } = require("../utils/disposableEmail");
const { isValidEmail, isValidPhone, isValidName } = require("../utils/validators");
const { signToken: signJwt } = require("../utils/jwt");
const { hasLiveSession } = require("../utils/sessionPolicy");
const { sendAccountExistsEmail } = require("../utils/mailer");
const { respondNoEarlierThan } = require("../utils/authTiming");
const { publicUser, ensureDefaultPassword, nameFromEmail } = require("../utils/accounts");
const { applyReferralCode } = require("../utils/referrals");
const { grantSignupBonus, holdSignupBonus, claimSignupBonus } = require("../utils/wallet");

const router = express.Router();
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

// Precomputed once at startup — /login compares against this whenever there's
// no real passwordHash to check (no such user, or a Google-only account), so
// a failed login always pays the same bcrypt cost no matter *why* it failed.
// Without this, "no such user"/"Google-only account" return near-instantly
// while a real wrong-password check takes ~250-300ms (bcrypt is deliberately
// slow) — an attacker can tell a valid password-based email from everything
// else purely by response time, even with an identical response body.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-account-timing-safety-only", 10);

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
  const payload = { sub: user.id, email: user.email, role: user.role, name: user.name };
  if (sessionId) payload.sid = sessionId;
  // Admin tokens aren't tied to a device session the server can end, so they
  // get a short life: a copied admin token stops working within the day.
  return signJwt(payload, { expiresIn: user.role === "admin" ? "12h" : "7d" });
}

// Single-device-login enforcement is student-only (see requireAuth.js) — an
// admin token is never given a `sid`, so it's never checked against
// activeSessionId and admins can stay logged in on as many devices as they
// like. A student who's already logged in on a still-live (not idle)
// session elsewhere is blocked below, before this ever runs — this only
// runs once that check has cleared, so it's safe to always overwrite here:
// either there was no session, or the previous one had already gone idle
// and is being replaced.
async function startSession(user) {
  if (user.role !== "student") return null;
  const sessionId = crypto.randomBytes(24).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { activeSessionId: sessionId, activeSessionLastSeenAt: new Date() },
  });
  return sessionId;
}

// Called by /login and /google (not /signup — a brand-new account can't
// already have a session) right before startSession. A student already
// live on another device gets a plain 409 here instead of the silent
// takeover startSession used to do — no override, no way around it from
// this endpoint; that device has to go idle (IDLE_TIMEOUT_MS) or log itself
// out (POST /auth/logout, which clears activeSessionId immediately) first.
function rejectIfAlreadyLoggedInElsewhere(res, user) {
  if (!hasLiveSession(user)) return false;
  res.status(409).json({ ok: false, error: "This account is already logged in on another device." });
  return true;
}

// ---------- student self-signup (role is always "student" — admin accounts
// are only ever created by scripts/seedAdmin.js) ----------
const AGE_CODE = "AGE_CONFIRMATION_REQUIRED";
const AGE_ERROR = "Please confirm you're 18 or older, or that your parent or guardian has agreed to you using Crix Technology (you must be at least 16).";

router.post("/signup", authLimiter, async (req, res, next) => {
  try {
    const { name, email, phone, password, referralCode, ageConfirmed } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: "name, email and password are required" });
    }
    // Users must be 16+; anyone under 18 needs a parent's or guardian's permission
    // (DPDP Act 2023). The sign-up form's checkbox confirms one or the other.
    if (ageConfirmed !== true) {
      return res.status(400).json({ ok: false, code: AGE_CODE, error: AGE_ERROR });
    }
    if (!isValidName(name)) {
      return res.status(400).json({ ok: false, error: "Enter a valid name." });
    }
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ ok: false, error: "Enter a valid phone number." });
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
    // Deliberately ambiguous: telling the caller outright that this email
    // already has an account (the old 409 "An account with this email
    // already exists") is an email-enumeration leak — anyone can probe
    // arbitrary addresses and learn which ones are registered. The P2002
    // catch below returns the exact same { ok: true, token: null, ... }
    // shape as a real signup — same status code, same fields, no signal
    // either way — and the real account owner (not whoever's asking) is the
    // one who actually finds out, via email, the same way a "forgot
    // password" flow never confirms account existence in its own response
    // either.
    const workStartedAt = Date.now();

    // Hashed unconditionally — bcrypt.hash() is deliberately slow (~250-
    // 300ms; see DUMMY_PASSWORD_HASH above, same reasoning for /login), and
    // skipping it on a "taken" branch would itself be a timing leak.
    const passwordHash = await bcrypt.hash(password, 10);

    // No upfront findUnique() check — going straight to create() and
    // catching the unique-constraint violation instead means a taken email
    // still costs one write attempt, not zero, tightening the timing gap
    // this whole thing is about — though the real close is
    // respondNoEarlierThan below, padding out whatever's left over.
    let user;
    try {
      user = await prisma.user.create({
        data: { name: String(name).trim(), email: normalizedEmail, phone: phone ? String(phone).trim() : "", passwordHash, role: "student", ageConfirmedAt: new Date() },
      });
    } catch (createErr) {
      if (createErr && createErr.code === "P2002") {
        // Deliberately ambiguous: telling the caller outright that this
        // email already has an account (the old 409 "An account with this
        // email already exists") is an email-enumeration leak — anyone can
        // probe arbitrary addresses and learn which ones are registered.
        // This returns the exact same shape as a real signup below — same
        // status code, same fields, no signal either way, response time
        // included (respondNoEarlierThan) — and the real account owner (not
        // whoever's asking) is the one who actually finds out, via email,
        // the same way a "forgot password" flow never confirms account
        // existence in its own response either.
        sendAccountExistsEmail({ to: normalizedEmail }).catch((mailErr) => {
          console.error("[auth] account-exists notification failed:", mailErr.message);
        });
        return respondNoEarlierThan(workStartedAt, () =>
          res.status(201).json({
            ok: true,
            token: null,
            user: null,
            message: "If this email already has an account, we've sent a reminder to that inbox — check it to log in.",
          })
        );
      }
      throw createErr;
    }
    // A referral code that came with the signup (typed in, or remembered from a
    // shared link). A bad or stale code never blocks the account — the student
    // can still enter one at checkout, where a wrong code is reported.
    if (referralCode) {
      await applyReferralCode(user.id, referralCode).catch((e) => console.error("[auth] referral apply failed:", e.message));
    }
    // The welcome credit (utils/wallet.js) waits until the email is verified. Never blocks the account either.
    await holdSignupBonus(user).catch((e) => console.error("[auth] signup bonus hold failed:", e.message));
    const sessionId = await startSession(user);
    const token = signToken(user, sessionId);
    respondNoEarlierThan(workStartedAt, () => res.status(201).json({ ok: true, token, user: publicUser(user) }));
  } catch (e) {
    next(e);
  }
});

// ---------- unified login — works for both students and admins ----------
// Also the only way a student account is made from the site's form: an email
// with no account gets NEW_ACCOUNT back, and the form asks the person to
// confirm (and tick the age box) before sending the same email and password
// again with createAccount: true. The new account starts with a placeholder
// name (from the email) and no phone, flagged profilePending — Profile is
// where they add the rest, and every payment waits until they have.
router.post("/login", authLimiter, async (req, res, next) => {
  try {
    const { email, password, createAccount, ageConfirmed, referralCode } = req.body || {};
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
    const workStartedAt = Date.now();
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) return createFromLogin(req, res, { email: normalizedEmail, password, createAccount, ageConfirmed, referralCode, workStartedAt });
    // Always runs, against DUMMY_PASSWORD_HASH when there's no real one to
    // check (no such user, or a Google-only account) — see that constant's
    // own comment. Every failure path below (no user, Google-only, wrong
    // password) now takes the same time and returns the exact same message;
    // the old distinct "This account uses Google Sign-In..." text was itself
    // a second leak (confirmed both that the email existed AND its type).
    const match = await bcrypt.compare(password, (user && user.passwordHash) || DUMMY_PASSWORD_HASH);
    if (!user || !user.passwordHash || !match) {
      return respondNoEarlierThan(workStartedAt, () => res.status(401).json({ ok: false, error: "Invalid credentials" }));
    }

    if (rejectIfAlreadyLoggedInElsewhere(res, user)) return;

    const sessionId = await startSession(user);
    const token = signToken(user, sessionId);
    respondNoEarlierThan(workStartedAt, () => res.json({ ok: true, token, user: publicUser(user) }));
  } catch (e) {
    next(e);
  }
});

// The "no account for this email yet" half of /login.
async function createFromLogin(req, res, { email, password, createAccount, ageConfirmed, referralCode, workStartedAt }) {
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: "Enter a valid email address." });
  }
  // First ask: tell the form this is a new email, so a mistyped address of an
  // existing account never silently becomes a second account.
  if (createAccount !== true) {
    return respondNoEarlierThan(workStartedAt, () => res.status(400).json({
      ok: false,
      code: "NEW_ACCOUNT",
      error: "There's no account with this email yet. Confirm below to create one with this password.",
    }));
  }
  // Users must be 16+; anyone under 18 needs a parent's or guardian's permission (DPDP Act 2023).
  if (ageConfirmed !== true) {
    return res.status(400).json({ ok: false, code: AGE_CODE, error: AGE_ERROR });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
  }
  if (String(password).length > 72) {
    return res.status(400).json({ ok: false, error: "Password must be at most 72 characters" });
  }
  if (isDisposableEmail(email)) {
    return res.status(400).json({ ok: false, error: "Temporary/disposable email addresses aren't allowed — please use a permanent email." });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await prisma.user.create({
      data: { name: nameFromEmail(email), email, phone: "", passwordHash, role: "student", ageConfirmedAt: new Date(), profilePending: true },
    });
  } catch (createErr) {
    // Made a moment ago by another request (double click): log in normally instead.
    if (createErr && createErr.code === "P2002") {
      return respondNoEarlierThan(workStartedAt, () => res.status(409).json({ ok: false, error: "This account was just created — please log in again." }));
    }
    throw createErr;
  }
  if (referralCode) {
    await applyReferralCode(user.id, referralCode).catch((e) => console.error("[auth] referral apply failed:", e.message));
  }
  // The welcome credit (utils/wallet.js) waits until the email is verified.
  await holdSignupBonus(user).catch((e) => console.error("[auth] signup bonus hold failed:", e.message));
  const sessionId = await startSession(user);
  const token = signToken(user, sessionId);
  respondNoEarlierThan(workStartedAt, () => res.status(201).json({ ok: true, created: true, token, user: publicUser(user) }));
}

// ---------- Google Sign-In (student popup only — see Frontend AuthModal) ----------
// Body is { credential }: the ID token Google's Identity Services button
// hands back client-side. Verified server-side against GOOGLE_CLIENT_ID —
// the client is never trusted for who the user actually is.
router.post("/google", authLimiter, async (req, res, next) => {
  try {
    if (!googleClient) {
      return res.status(503).json({ ok: false, error: "Google Sign-In isn't configured yet." });
    }
    const { credential, referralCode, ageConfirmed } = req.body || {};
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
    let user = await prisma.user.findFirst({ where: { OR: [{ googleId: payload.sub }, { email }] } });

    // Admin accounts log in with their email and password only — Google
    // sign-in would skip the password entirely (and would link the Google
    // account to the admin by email alone).
    if (user && user.role === "admin") {
      return res.status(403).json({ ok: false, error: "Admin accounts sign in with email and password." });
    }

    if (!user) {
      // A brand-new account needs the same age confirmation as the sign-up form;
      // someone who already has an account just logs in.
      if (ageConfirmed !== true) {
        return res.status(400).json({ ok: false, code: AGE_CODE, error: AGE_ERROR });
      }
      user = await prisma.user.create({
        data: { name: payload.name || email.split("@")[0], email, phone: "", googleId: payload.sub, role: "student", ageConfirmedAt: new Date() },
      });
      if (referralCode) {
        await applyReferralCode(user.id, referralCode).catch((e) => console.error("[auth] referral apply failed:", e.message));
      }
      await grantSignupBonus(user).catch((e) => console.error("[auth] signup bonus failed:", e.message));
    } else if (!user.googleId) {
      // Existing email/password account signing in with Google for the
      // first time — link it rather than creating a duplicate.
      user = await prisma.user.update({ where: { id: user.id }, data: { googleId: payload.sub } });
      // Google has verified this email, so a bonus held for verification is released.
      await claimSignupBonus(user.id).catch((e) => console.error("[auth] signup bonus release failed:", e.message));
    }

    if (rejectIfAlreadyLoggedInElsewhere(res, user)) return;

    // New Google accounts (and older Google-only ones with no password yet)
    // get a starter password so email+password login and "Change password"
    // work for them too.
    user = await ensureDefaultPassword(user);

    const sessionId = await startSession(user);
    const token = signToken(user, sessionId);
    res.json({ ok: true, token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// ---------- logout — frees this account's device slot immediately instead
// of waiting for it to go idle (see IDLE_TIMEOUT_MS) ----------
router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === "student" && req.user.sid) {
      // Only clears the slot if it's still THIS session's — a token from a
      // device that's already been superseded elsewhere can't accidentally
      // free up a newer, different session.
      await prisma.user.updateMany({
        where: { id: req.user.sub, activeSessionId: req.user.sid },
        data: { activeSessionId: null, activeSessionLastSeenAt: null },
      });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- current user (used to restore a session on page load) ----------
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
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
    const existing = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!existing) return res.status(404).json({ ok: false, error: "User not found" });

    const { name, phone } = req.body || {};
    const update = {};

    if (name !== undefined) {
      const n = String(name).trim();
      if (!n) return res.status(400).json({ ok: false, error: "Name can't be empty." });
      if (n.length > 80) return res.status(400).json({ ok: false, error: "Name is too long." });
      update.name = n;
      // The login form's placeholder name stops counting as missing only when the
      // owner confirms a name from Profile (confirmName), or types a different one.
      if (existing.profilePending && (req.body.confirmName === true || n !== existing.name)) update.profilePending = false;
    }

    if (phone !== undefined) {
      const p = String(phone).trim();
      if (p && !isValidPhone(p)) {
        return res.status(400).json({ ok: false, error: "Enter a valid phone number." });
      }
      update.phone = p;
    }

    const user = await prisma.user.update({ where: { id: req.user.sub }, data: update });
    res.json({ ok: true, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
