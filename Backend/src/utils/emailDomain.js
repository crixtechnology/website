const dns = require("dns");
const { isValidEmail } = require("./validators");
const { isDisposableEmail } = require("./disposableEmail");

// Can this email's domain receive mail at all? Answered from DNS alone —
// nothing is ever sent to the address. A real mailbox check (the SMTP
// "RCPT TO" handshake) needs outbound port 25, which Render blocks on every
// plan, so this stops at the domain: it catches "gmial.com", "company.con"
// and dead/parked domains, not a made-up name at a real provider.
//
// Fails open: if DNS itself is down or slow, the address is let through
// rather than turning a resolver hiccup into "your email is invalid".

// Providers most visitors use — a domain one or two typos away from one of
// these gets a "Did you mean …?" hint.
const COMMON_DOMAINS = [
  "gmail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "outlook.com", "hotmail.com",
  "live.com", "icloud.com", "rediffmail.com", "protonmail.com", "proton.me", "zoho.com",
  "aol.com", "msn.com", "ymail.com",
];
// Typos close enough to a real domain that they'd score as a near-miss but
// are themselves real, mail-receiving domains — never second-guess these.
const NOT_TYPOS = new Set(["mail.com", "gmx.com", "live.in", "outlook.in", "hotmail.co.uk", "yahoo.co.uk"]);

const TIMEOUT_MS = 3000;
// Node's c-ares resolver reads the OS's DNS server list; on some machines
// (a VPN, a local DNS proxy) that's an address it can't actually reach, so a
// failed lookup is retried once against public resolvers before giving up.
const systemResolver = new dns.promises.Resolver({ timeout: TIMEOUT_MS, tries: 1 });
const publicResolver = new dns.promises.Resolver({ timeout: TIMEOUT_MS, tries: 1 });
publicResolver.setServers(["1.1.1.1", "8.8.8.8"]);

// "This name has no such record" — a definite answer, not a resolver failure.
const NO_RECORD = new Set(["ENOTFOUND", "ENODATA", "ENONAME", "NXDOMAIN"]);

async function query(method, domain) {
  try {
    return await systemResolver[method](domain);
  } catch (e) {
    if (NO_RECORD.has(e.code)) throw e;
    return publicResolver[method](domain);
  }
}

// true / false, or null when DNS couldn't give an answer either way.
async function domainAcceptsMail(domain) {
  try {
    const mx = await query("resolveMx", domain);
    // A "null MX" (RFC 7505: a single record pointing at ".") is the domain
    // saying outright that it takes no mail.
    if (mx.length === 1 && (mx[0].exchange === "" || mx[0].exchange === ".")) return false;
    if (mx.length) return true;
  } catch (e) {
    if (!NO_RECORD.has(e.code)) return null;
  }
  // No MX records: mail falls back to the domain's own address (RFC 5321
  // "implicit MX"), so a domain that resolves at all can still take mail.
  for (const method of ["resolve4", "resolve6"]) {
    try {
      if ((await query(method, domain)).length) return true;
    } catch (e) {
      if (!NO_RECORD.has(e.code)) return null;
    }
  }
  return false;
}

// Plain Levenshtein distance — the strings here are short domain names.
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// The common provider this domain is probably a typo of, or "".
function suggestDomain(domain) {
  if (COMMON_DOMAINS.includes(domain) || NOT_TYPOS.has(domain)) return "";
  let best = "";
  let bestDistance = Infinity;
  for (const candidate of COMMON_DOMAINS) {
    const d = editDistance(domain, candidate);
    if (d < bestDistance) { best = candidate; bestDistance = d; }
  }
  // Short names sit close to many real domains ("aon.com" is one typo from
  // "aol.com"), so they only get a hint for a single slip.
  const allowed = domain.length <= 8 ? 1 : 2;
  return bestDistance > 0 && bestDistance <= allowed ? best : "";
}

// A domain's DNS answer barely changes, and the form asks again on every
// pause in typing — keep answers for a few hours. Bounded so a script feeding
// random domains can't grow it forever (oldest entry goes first).
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 5000;
const cache = new Map();

async function cachedAcceptsMail(domain) {
  const hit = cache.get(domain);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await domainAcceptsMail(domain);
  // Don't remember "couldn't tell" — the next ask may get a real answer.
  if (value !== null) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(domain, { value, expires: Date.now() + CACHE_TTL_MS });
  }
  return value;
}

// { ok, error, suggestion }. `error` is a full sentence for the form to show;
// `suggestion` is the corrected address ("abc@gmail.com") when the domain is
// a typo of a common provider, so the form can offer a one-click fix.
async function checkEmailDomain(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!isValidEmail(value)) return { ok: false, error: "Enter a valid email address.", suggestion: "" };
  const [local, domain] = [value.slice(0, value.lastIndexOf("@")), value.slice(value.lastIndexOf("@") + 1)];
  // A near-miss of a big provider is a typo even when it resolves — squatters
  // register "gmial.com" and friends precisely to catch mail meant for Gmail,
  // so DNS alone would wave it through. Checked before the disposable list
  // (which has some of these squatters too) so the visitor gets the fix.
  const typoOf = suggestDomain(domain);
  if (typoOf) {
    const suggestion = `${local}@${typoOf}`;
    return { ok: false, error: `Did you mean ${suggestion}? "${domain}" looks like a typo.`, suggestion };
  }
  if (isDisposableEmail(value)) {
    return { ok: false, error: "Temporary/disposable email addresses aren't allowed — please use a permanent email.", suggestion: "" };
  }
  if ((await cachedAcceptsMail(domain)) === false) {
    return { ok: false, error: `"${domain}" can't receive email. Please check the spelling.`, suggestion: "" };
  }
  return { ok: true, error: "", suggestion: "" };
}

// For the submit routes: the error sentence, or "" when the address is fine.
// Skipped under Jest — the suites use made-up domains (example.com even
// publishes a null MX) and must not depend on live DNS.
async function emailDomainError(email) {
  if (process.env.NODE_ENV === "test" && !process.env.EMAIL_DOMAIN_CHECK_IN_TESTS) return "";
  return (await checkEmailDomain(email)).error;
}

module.exports = { checkEmailDomain, emailDomainError, suggestDomain, editDistance };
