// Keeps the API awake on Render's free plan, which puts a service to sleep
// after 15 minutes without incoming requests (the next visitor then waits
// 30-60 seconds for it to start). Every 14 minutes the server calls its own
// public /api/health address. That request leaves and comes back in through
// Render, so it counts as incoming traffic and the idle timer never runs out.
//
// Runs only on Render: Render sets RENDER_EXTERNAL_URL itself (e.g.
// https://crix-api.onrender.com). KEEP_AWAKE=off turns it off, e.g. after
// moving to a paid plan that never sleeps.
const EVERY_MS = 14 * 60 * 1000;
const TIMEOUT_MS = 30 * 1000;

function keepAwakeUrl(env = process.env) {
  const base = String(env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, "");
  if (!base || String(env.KEEP_AWAKE || "").toLowerCase() === "off") return null;
  return `${base}/api/health`;
}

async function ping(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) console.error(`[keep-awake] ${url} answered ${res.status}`);
  } catch (e) {
    console.error(`[keep-awake] ping failed (will try again in 14 min): ${e.message}`);
  }
}

function startKeepAwake() {
  const url = keepAwakeUrl();
  if (!url) return null;
  console.log(`[keep-awake] pinging ${url} every 14 minutes`);
  // Not unref'd on purpose: this timer is what keeps the service alive.
  return setInterval(() => ping(url), EVERY_MS);
}

module.exports = { startKeepAwake, keepAwakeUrl, EVERY_MS };
