// Blocks signup with throwaway/temp-mail addresses. Two layers:
//  1. The bundled `disposable-email-domains` npm package (~120k domains) —
//     always available, works offline, but is a frozen snapshot from
//     whenever it was installed.
//  2. A live, actively-maintained community list fetched from GitHub at
//     startup and refreshed daily — catches newly-registered temp-mail
//     domains (random-string ones like "ruutukf.com") that the frozen
//     snapshot doesn't have yet. If the fetch fails (no internet, GitHub
//     down/rate-limited), signup just falls back to the bundled list —
//     never blocks on this.
const localExact = new Set(require("disposable-email-domains").map((d) => d.toLowerCase()));
const localWildcard = new Set(require("disposable-email-domains/wildcard.json").map((d) => d.toLowerCase()));

const LIVE_LIST_URL =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";
const REFRESH_MS = 24 * 60 * 60 * 1000; // 24h

let liveDomains = new Set();

async function refreshLiveList() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(LIVE_LIST_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const domains = text.split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean);
    liveDomains = new Set(domains);
    console.log(`disposableEmail: refreshed live block list — ${liveDomains.size} domains`);
  } catch (e) {
    console.warn("disposableEmail: could not refresh live block list, using bundled list only —", e.message);
  }
}

refreshLiveList();
setInterval(refreshLiveList, REFRESH_MS).unref();

function isDisposableEmail(email) {
  const domain = String(email || "").split("@")[1]?.toLowerCase().trim();
  if (!domain) return false;
  if (localExact.has(domain) || liveDomains.has(domain)) return true;

  // Check domain and every parent suffix (e.g. "a.b.tk" -> "a.b.tk", "b.tk")
  // against the wildcard list, so subdomains of a listed base domain match.
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (localWildcard.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

module.exports = { isDisposableEmail, refreshLiveList };
