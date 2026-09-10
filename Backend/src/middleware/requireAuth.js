const jwt = require("jsonwebtoken");

// Requires a valid JWT, any role — used on student-facing routes (my
// enrollments, the learn page). Optional variant below is used where a
// route works for both guests and logged-in users but wants to know which.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

// Attaches req.user if a valid token is present; never rejects the request.
function attachUserIfPresent(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      // ignore — request proceeds as a guest
    }
  }
  next();
}

module.exports = { requireAuth, attachUserIfPresent };
