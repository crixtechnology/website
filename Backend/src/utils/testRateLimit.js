const rateLimit = require("express-rate-limit");

// Limiter for the aptitude-test API (routes/aptitudeTest.js). A real sitting is
// chatty — every answer is saved the moment it is picked, plus a heartbeat and
// a webcam snapshot now and then — so the budget is generous, and it is counted
// per signed-in candidate rather than per IP (a college lab shares one IP).
// Mount it AFTER requireAuth so req.user is there to key on.
const testApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.sub) || req.ip,
  message: { ok: false, error: "Too many requests. Please slow down for a moment." },
});

module.exports = { testApiLimiter };
