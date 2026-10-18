// Optional, env-var-gated analytics — same pattern as Google Sign-In
// (components/ui.jsx's GOOGLE_CLIENT_ID): cleanly absent when unset, no
// crash, nothing loaded or sent anywhere. Set REACT_APP_GA_MEASUREMENT_ID
// (Google Analytics 4 "G-XXXXXXXXXX" measurement ID) in Frontend/.env to
// turn it on.
//
// Without this, there was no visibility at all into where visitors drop
// off between browsing a course and actually buying it — trackEvent calls
// are placed at the handful of funnel steps that actually matter (viewing
// a course's detail, starting checkout, completing a purchase, submitting
// an apply/enrol/service inquiry) rather than instrumenting every click
// site-wide.
//
// Consent first: Google Analytics sets cookies, so nothing is loaded until the
// visitor says yes in the cookie banner (components/CookieConsent.jsx). Their
// answer is remembered in this browser; "Cookie settings" in the footer lets
// them change it. Saying no after yes stops it straight away and clears its cookies.
const GA_ID = process.env.REACT_APP_GA_MEASUREMENT_ID || "";

export const CONSENT_KEY = "crix_analytics_consent"; // "granted" | "denied"
export const OPEN_COOKIE_SETTINGS_EVENT = "crix:cookie-settings";

let loaded = false;

// Whether there is anything to ask about at all.
export const analyticsAvailable = () => !!GA_ID;

export function getAnalyticsConsent() {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch (e) {
    return null; // storage blocked: ask again, and load nothing meanwhile
  }
}

function loadGtag() {
  if (loaded || !GA_ID) return;
  loaded = true;
  window[`ga-disable-${GA_ID}`] = false;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  // gtag.js expects `arguments`, not a rest/spread array — this has to stay
  // a real `function`, an arrow function here would break it.
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  // Page views are sent manually via trackPageview on each route change
  // (App.jsx's ScrollToTop) instead of gtag's own automatic pageview, since
  // this is a client-routed SPA — the automatic one only fires once, on
  // the very first full page load, and never again on navigation.
  window.gtag("config", GA_ID, { send_page_view: false });
}

// Google Analytics' own cookies (_ga, _ga_<id>) on this site's domain and its parents.
function clearAnalyticsCookies() {
  const names = document.cookie.split(";").map((c) => c.split("=")[0].trim()).filter((n) => n === "_ga" || n.startsWith("_ga_"));
  const parts = window.location.hostname.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join(".")}`);
  for (const name of names) for (const d of domains) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
}

// Called by the cookie banner. "granted" starts analytics now (and counts the
// page they're on); "denied" stops it and removes its cookies.
export function setAnalyticsConsent(value) {
  const choice = value === "granted" ? "granted" : "denied";
  try { window.localStorage.setItem(CONSENT_KEY, choice); } catch (e) { /* remembered for this visit only */ }
  if (!GA_ID) return;
  if (choice === "granted") {
    const first = !loaded;
    loadGtag();
    window[`ga-disable-${GA_ID}`] = false;
    if (first) trackPageview(window.location.pathname + window.location.search);
  } else {
    window[`ga-disable-${GA_ID}`] = true;
    clearAnalyticsCookies();
  }
}

export function openCookieSettings() {
  try { window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT)); } catch (e) { /* non-browser env */ }
}

// Call once, as early as app startup — safe to call even when GA_ID is
// unset (no-ops). Loads analytics only for a visitor who has already said yes.
// Idempotent: later calls after the first are no-ops too.
export function initAnalytics() {
  if (getAnalyticsConsent() === "granted") loadGtag();
}

const allowed = () => GA_ID && loaded && typeof window.gtag === "function" && getAnalyticsConsent() === "granted";

export function trackPageview(path) {
  if (!allowed()) return;
  window.gtag("event", "page_view", { page_path: path });
}

export function trackEvent(name, params = {}) {
  if (!allowed()) return;
  window.gtag("event", name, params);
}
