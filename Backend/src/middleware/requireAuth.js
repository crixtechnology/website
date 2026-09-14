const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Single-device-login check: student tokens carry a `sid` claim minted at
// login time (see routes/auth.js's startSession) that must still match the
// user's current activeSessionId. Logging in on a new device overwrites
// activeSessionId, so any older student token — still validly signed —
// stops working. Admin tokens never carry `sid` (admins are allowed on
// multiple devices at once), so this is a no-op for them.
async function isSessionValid(payload) {
  if (payload.role !== "student" || !payload.sid) return true;
  const user = await User.findById(payload.sub).select("activeSessionId");
  return !!user && user.activeSessionId === payload.sid;
}

// Requires a valid JWT, any role — used on student-facing routes (my
// enrollments, the learn page). Optional variant below is used where a
// route works for both guests and logged-in users but wants to know which.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
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
      const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
      if (await isSessionValid(payload)) req.user = payload;
    } catch (e) {
      // ignore — request proceeds as a guest
    }
  }
  next();
}

module.exports = { requireAuth, attachUserIfPresent };
