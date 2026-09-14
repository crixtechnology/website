// CLIENT_ORIGIN can be a comma-separated list — e.g. localhost for the PC
// plus the machine's LAN IP so phones on the same WiFi can reach the API
// too (see index.js's CORS setup). Shared here so index.js's CORS check and
// mailer.js's Referer/admin-link origin both read the same parsed value
// instead of two independent copies that could drift apart.
function allowedOrigins() {
  return (process.env.CLIENT_ORIGIN || "*").split(",").map((o) => o.trim());
}

// The first configured origin, used wherever a single "the site's URL" is
// needed (mailer.js) rather than the full CORS allow-list.
function primaryOrigin() {
  const first = allowedOrigins()[0];
  return first && first !== "*" ? first : "";
}

module.exports = { allowedOrigins, primaryOrigin };
