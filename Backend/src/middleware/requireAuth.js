const User = require("../models/User");
const { verifyToken } = require("../utils/jwt");
const { IDLE_TIMEOUT_MS, ACTIVITY_WRITE_THROTTLE_MS } = require("../utils/sessionPolicy");

// Single-device-login check: student tokens carry a `sid` claim minted at
// login time (see routes/auth.js's startSession) that must still match the
// user's current activeSessionId. Logging in on a new device overwrites
// activeSessionId, so any older student token — still validly signed —
// stops working. Admin tokens never carry `sid` (admins are allowed on
// multiple devices at once), so this is a no-op for them.
//
// Also expires a session that's gone idle for IDLE_TIMEOUT_MS server-side —
// this is the backstop for the client's own idle-logout timer (useIdleLogout
// in the frontend): if that device's JS never got to run (tab killed, app
// closed, no network), the session still can't be used or block a fresh
// login elsewhere forever. On an otherwise-valid, non-idle request, bumps
// activeSessionLastSeenAt — throttled to at most once a minute so this
// doesn't turn into a DB write on every single API call — so routes/auth.js
// can tell a live session from an idle one when a login attempt comes in
// from another device.
async function isSessionValid(payload) {
  if (payload.role !== "student" || !payload.sid) return true;
  const user = await User.findById(payload.sub).select("activeSessionId activeSessionLastSeenAt");
  if (!user || user.activeSessionId !== payload.sid) return false;

  const now = Date.now();
  const lastSeen = user.activeSessionLastSeenAt ? user.activeSessionLastSeenAt.getTime() : 0;
  if (now - lastSeen > IDLE_TIMEOUT_MS) return false;

  if (now - lastSeen > ACTIVITY_WRITE_THROTTLE_MS) {
    // Fire-and-forget: this request shouldn't wait on it, and a lost write
    // just means the next request tries again.
    User.updateOne(
      { _id: payload.sub, activeSessionId: payload.sid },
      { $set: { activeSessionLastSeenAt: new Date(now) } }
    ).catch(() => {});
  }
  return true;
}

// Requires a valid JWT, any role — used on student-facing routes (my
// enrollments, the learn page). Optional variant below is used where a
// route works for both guests and logged-in users but wants to know which.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });
  try {
    const payload = verifyToken(token);
    if (!(await isSessionValid(payload))) {
      return res.status(401).json({ ok: false, error: "Logged out — this account was signed in on another device" });
    }
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

// Attaches req.user if a valid token is present; never rejects the request.
async function attachUserIfPresent(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      const payload = verifyToken(token);
      if (await isSessionValid(payload)) req.user = payload;
    } catch (e) {
      // ignore — request proceeds as a guest
    }
  }
  next();
}

module.exports = { requireAuth, attachUserIfPresent };
