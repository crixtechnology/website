const crypto = require("crypto");

// Constant-time "is this the signature we expected?" for HMAC checks (Razorpay
// payments and webhooks, the desktop test app's token). timingSafeEqual throws
// when the two buffers differ in BYTE length, and a string's length isn't its
// byte length once it has non-ASCII characters — so the lengths are compared
// as bytes, and anything that isn't a string is simply not a match.
function safeEqual(expected, given) {
  if (typeof expected !== "string" || typeof given !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { safeEqual };
