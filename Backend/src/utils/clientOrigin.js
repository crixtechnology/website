// CLIENT_ORIGIN can be a comma-separated list — e.g. localhost for the PC
// plus the machine's LAN IP so phones on the same WiFi can reach the API
// too (see index.js's CORS setup). Shared here so index.js's CORS check and
// mailer.js's Referer/admin-link origin both read the same parsed value
// instead of two independent copies that could drift apart.
//
// Deliberately fails CLOSED (empty allowlist, so every cross-origin browser
// request is rejected) when the var is unset, rather than falling back to
// "*" — a dropped/misconfigured env var on deploy should break CORS loudly,
// not silently open the API to any origin. Set CLIENT_ORIGIN=* explicitly if
// you really want that.
function allowedOrigins() {
  const raw = process.env.CLIENT_ORIGIN;
  if (!raw) {
    console.warn(
      "CLIENT_ORIGIN is not set — rejecting all cross-origin browser requests. " +
      "Set it in .env (see .env.example) to your frontend's URL."
    );
    return [];
  }
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

// The first configured origin, used wherever a single "the site's URL" is
// needed (mailer.js) rather than the full CORS allow-list.
function primaryOrigin() {
  const first = allowedOrigins()[0];
  return first && first !== "*" ? first : "";
}

module.exports = { allowedOrigins, primaryOrigin };
