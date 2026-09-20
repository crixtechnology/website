const { prisma } = require("../db");
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
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { activeSessionId: true, activeSessionLastSeenAt: true },
  });
  if (!user || user.activeSessionId !== payload.sid) return false;

  const now = Date.now();
  const lastSeen = user.activeSessionLastSeenAt ? user.activeSessionLastSeenAt.getTime() : 0;
  if (now - lastSeen > IDLE_TIMEOUT_MS) return false;

  if (now - lastSeen > ACTIVITY_WRITE_THROTTLE_MS) {
    // Fire-and-forget: this request shouldn't wait on it, and a lost write
    // just means the next request tries again.
    prisma.user
      .updateMany({
        where: { id: payload.sub, activeSessionId: payload.sid },
        data: { activeSessionLastSeenAt: new Date(now) },
      })
      .catch(() => {});
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
  let payload;
  try {
    payload = verifyToken(token);
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
  // Only a bad token is a 401 (the client logs the user out on one). The database
  // being unreachable is NOT the user's session ending: it used to land in the same
  // catch and answer 401, so a database outage signed every logged-in student out.
  // Let the error handler answer 503 instead; the session survives and works again
  // as soon as the database is back.
  let valid;
  try {
    valid = await isSessionValid(payload);
  } catch (e) {
    return next(e);
  }
  if (!valid) {
    return res.status(401).json({ ok: false, error: "Logged out — this account was signed in on another device" });
  }
  req.user = payload;
  next();
}

// Attaches req.user if a valid token is present; never rejects the request.
async function attachUserIfPresent(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    let payload = null;
    try {
      payload = verifyToken(token);
    } catch (e) {
      // ignore — a bad token just means the request proceeds as a guest
    }
    if (payload) {
      try {
        if (await isSessionValid(payload)) req.user = payload;
      } catch (e) {
        // The database is away: don't quietly turn a logged-in user into a guest
        // (an application would be saved with no account); say so instead.
        return next(e);
      }
    }
  }
  next();
}

module.exports = { requireAuth, attachUserIfPresent };
