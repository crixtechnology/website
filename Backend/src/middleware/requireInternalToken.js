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
  // Compare byte lengths, not string lengths: a token with multi-byte
  // characters can match in .length but not in bytes, and timingSafeEqual
  // throws (a 500) on buffers of different sizes.
  const given = Buffer.from(token || "");
  const want = Buffer.from(expected);
  if (!token || given.length !== want.length) {
    return res.status(401).json({ ok: false, error: "Invalid internal token" });
  }
  const ok = crypto.timingSafeEqual(given, want);
  if (!ok) return res.status(401).json({ ok: false, error: "Invalid internal token" });
  next();
}

module.exports = { requireInternalToken };
