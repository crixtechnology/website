const crypto = require("crypto");

// The signed-URL scheme shared by three places that MUST agree byte-for-byte:
//   - this Express app (routes/videos.js) mints URLs here
//   - the Cloudflare Worker (cloudflare-worker/) verifies them
//   - scripts/test-tools/generate-signed-link.js builds them for manual testing
//
// URL shape:  <gateway>/videos/<b2Key>?exp=<unixSeconds>&token=<hmac>
// token = base64url( HMAC-SHA256(`${b2Key}:${exp}`, SIGNING_SECRET) )
//
// SIGNING_SECRET lives in Backend/.env and in the Worker's secrets — it never
// reaches the browser. The B2 credentials themselves live ONLY in the Worker.

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The token for a given key + expiry. `secret` defaults to env so callers
// can stay a one-liner, but the test tools pass it explicitly.
function signToken(b2Key, exp, secret = process.env.SIGNING_SECRET) {
  if (!secret) throw new Error("SIGNING_SECRET is not set");
  return base64url(crypto.createHmac("sha256", secret).update(`${b2Key}:${exp}`).digest());
}

// Percent-encode each path segment but keep the "/" separators, so a key
// like "web-dev/day-3/lecture.mp4" stays a readable path in the URL.
function encodeKey(b2Key) {
  return String(b2Key).split("/").map(encodeURIComponent).join("/");
}

// Build the full signed URL. gatewayBase is VIDEO_GATEWAY_URL (the Worker's
// public origin, e.g. https://videos.crixtechnology.com), no trailing slash
// required.
function buildSignedUrl(gatewayBase, b2Key, ttlSeconds, secret = process.env.SIGNING_SECRET) {
  const exp = Math.floor(Date.now() / 1000) + Number(ttlSeconds);
  const token = signToken(b2Key, exp, secret);
  const base = String(gatewayBase || "").replace(/\/+$/, "");
  return `${base}/videos/${encodeKey(b2Key)}?exp=${exp}&token=${encodeURIComponent(token)}`;
}

// Constant-time check that a presented token matches, and that exp is in the
// future. Used by the Worker's Node-side test harness; the Worker itself
// reimplements this with Web Crypto.
function verifyToken(b2Key, exp, token, secret = process.env.SIGNING_SECRET) {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return false;
  let expected;
  try {
    expected = signToken(b2Key, expNum, secret);
  } catch (e) {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { base64url, signToken, encodeKey, buildSignedUrl, verifyToken };
