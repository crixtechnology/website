const jwt = require("jsonwebtoken");

// Requires a valid JWT AND role === "admin" (see routes/auth.js — the token
// payload carries { sub, email, role }). Used on every /api/admin/* route.
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Admin access required" });
    }
    req.admin = payload;
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }
}

module.exports = { requireAdmin };
