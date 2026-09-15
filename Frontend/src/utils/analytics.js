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
const GA_ID = process.env.REACT_APP_GA_MEASUREMENT_ID || "";

let loaded = false;

function loadGtag() {
  if (loaded || !GA_ID) return;
  loaded = true;
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

// Call once, as early as app startup — safe to call even when GA_ID is
// unset (no-ops). Idempotent: later calls after the first are no-ops too.
export function initAnalytics() {
  loadGtag();
}

export function trackPageview(path) {
  if (!GA_ID || typeof window.gtag !== "function") return;
  window.gtag("event", "page_view", { page_path: path });
}

export function trackEvent(name, params = {}) {
  if (!GA_ID || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
