const { prisma } = require("../db");
const { verifyToken } = require("../utils/jwt");

// Requires a valid JWT AND role === "admin" (see routes/auth.js — the token
// payload carries { sub, email, role }). The DB is the source of truth for
// role, not just the JWT claim: routes/adminUsers.js can now demote or
// delete an admin, and without re-checking here a demoted/deleted admin's
// still-validly-signed token would keep working for up to its remaining
// 7-day lifetime — same reasoning as the student-side session check in
// requireAuth.js, just for role instead of device.
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });
  try {
    const payload = verifyToken(token);
    if (payload.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Admin access required" });
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { role: true } });
    if (!user || user.role !== "admin") {
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
