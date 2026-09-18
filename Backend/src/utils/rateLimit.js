const rateLimit = require("express-rate-limit");

// Shared limiter for public write endpoints that aren't a credential-
// guessing surface (that's routes/auth.js's own, stricter authLimiter) but
// still cost something per request — an outbound email (contact,
// applications) or a real call to Razorpay's API (payments/create-order).
// Looser than authLimiter since these are a spam/cost concern, not a
// brute-force one.
const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please try again in a few minutes." },
});

module.exports = { publicWriteLimiter };
