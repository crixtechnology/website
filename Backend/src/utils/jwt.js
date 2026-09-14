const jwt = require("jsonwebtoken");

// Single place that pins the signing/verification algorithm — before this,
// `{ algorithms: ["HS256"] }` / `algorithm: "HS256"` was hand-typed at 4
// separate call sites (routes/auth.js's signToken, and 3 jwt.verify calls
// across middleware/requireAuth.js and requireAdmin.js), so a future
// protected route that calls jwt.verify directly could easily forget the
// option and silently reopen an algorithm-confusion gap. Route/middleware
// files should always go through signToken/verifyToken below instead of
// calling jsonwebtoken directly.
const ALGORITHM = "HS256";

function signToken(payload, options = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, { ...options, algorithm: ALGORITHM });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
}

module.exports = { signToken, verifyToken };
