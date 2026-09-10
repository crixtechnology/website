const crypto = require("crypto");

// Guards the /api/internal/* routes — the only caller is scripts/drive-to-b2-sync,
// which authenticates with a static bearer token (COURSE_API_INTERNAL_TOKEN,
// shared secret in both .env files). Server-to-server only; no user, no JWT.
function requireInternalToken(req, res, next) {
  const expected = process.env.COURSE_API_INTERNAL_TOKEN;
  if (!expected) {
    return res.status(503).json({ ok: false, error: "Internal API is not configured" });
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || token.length !== expected.length) {
    return res.status(401).json({ ok: false, error: "Invalid internal token" });
  }
  const ok = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) return res.status(401).json({ ok: false, error: "Invalid internal token" });
  next();
}

module.exports = { requireInternalToken };
