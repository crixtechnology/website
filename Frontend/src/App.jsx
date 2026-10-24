import { Suspense, lazy, useEffect, useLayoutEffect, useRef } from "react";
import { Routes, Route, Navigate, useLocation, useNavigationType } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import SetNewPassword from "./components/SetNewPassword.jsx";
import CookieConsent from "./components/CookieConsent.jsx";
import { Navbar, Footer, Chrome, AuthModal } from "./components/ui.jsx";
import { Home, Programs, CourseDetail, Services, About, Contact, PrivacyPolicy, TermsOfService, ClientTerms, NotFound } from "./pages/pages.jsx";
import { useCopyProtection } from "./hooks/useCopyProtection.js";
import { initAnalytics, trackPageview } from "./utils/analytics.js";
import { captureReferralFromUrl } from "./utils/referral.js";
import { registerPrefetch } from "./utils/prefetch.js";

// Called at module load (not inside a useEffect) deliberately: React fires
// child effects before parent effects, so ScrollToTop's own effect (which
// calls trackPageview on mount) would otherwise run BEFORE App's effect
// got a chance to set up window.gtag — silently dropping every session's
// very first pageview (anyone who lands and bounces without navigating
// again would never be recorded at all). initAnalytics() is idempotent and
// side-effect-safe to call at import time (a no-op with no GA ID set, and
// until the visitor accepts analytics in the cookie banner).
initAnalytics();

// The student area is only ever reached by someone already
// logged in as a student — lazy-loading them keeps their code out of
// the bundle every anonymous visitor downloads just to browse the public
// marketing pages. (The PDF library behind every "Download receipt / PDF"
// button is loaded separately again, only when one is clicked —
// utils/receiptPdfLazy.js and documentPdf.js — since the Careers page and the
// navbar's payment-request banner, which are in the main script, offer them too.)
// Public marketing/legal pages (pages.jsx) stay eagerly imported above —
// they're what most visitors actually came for and where load speed/SEO
// matters most, so there's no Suspense flash on the paths that matter most.
// Each lazy route's loader, keyed by path (a trailing "/" means "starts with"); also
// registered for hover prefetching (utils/prefetch.js).
const ROUTE_LOADERS = {
  "/dashboard": () => import("./pages/student/MyCourses.jsx"),
  "/learn/": () => import("./pages/student/Learn.jsx"),
  "/profile": () => import("./pages/student/Profile.jsx"),
  "/test/": () => import("./pages/student/AptitudeTest.jsx"),
  // Public, but its code (application, payment, the test's rules) is only needed there.
  "/careers": () => import("./pages/Careers.jsx"),
  // Not linked anywhere on the site: reached by its address only.
  "/bca-internships": () => import("./pages/BcaInternships.jsx"),
};
registerPrefetch(ROUTE_LOADERS);

const MyCourses = lazy(ROUTE_LOADERS["/dashboard"]);
const Learn = lazy(ROUTE_LOADERS["/learn/"]);
const Profile = lazy(ROUTE_LOADERS["/profile"]);
const AptitudeTest = lazy(ROUTE_LOADERS["/test/"]);
const Careers = lazy(ROUTE_LOADERS["/careers"]);
const BcaInternships = lazy(ROUTE_LOADERS["/bca-internships"]);


// Matches the "Loading..." convention every data-fetching page here already
// uses (MyCourses etc.) rather than a full-screen splash
// — this only ever shows for the fraction of a second a lazy chunk takes to
// download, so it should read as consistent with the rest of the app, not
// like a separate, heavier loading state.
// At least a screen tall, so the footer stays below the fold while a page loads
// instead of showing and then being pushed down (a layout shift: Lighthouse
// measured 0.39 on /careers with the old 60vh).
function RouteLoading() {
  return (
    <section className="section" style={{ paddingTop: 140, minHeight: "100vh" }}>
      <div className="wrap"><p style={{ color: "var(--muted)" }}>Loading...</p></div>
    </section>
  );
}

// Where the page was scrolled to, per history entry (react-router's
// location.key survives Back/Forward and even a reload). Lets "Back" from a
// course's page land on the card that was clicked instead of the top of the
// list. sessionStorage, so it's per-tab and gone when the tab closes.
const scrollKey = (key) => `crix-scroll:${key}`;
const savedScroll = (key) => {
  try {
    const y = Number(sessionStorage.getItem(scrollKey(key)));
    return Number.isFinite(y) && y > 0 ? y : null;
  } catch (e) { return null; }
};

function ScrollToTop() {
  const { pathname, hash, key, search } = useLocation();

  // A shared referral link (?ref=CODE) can land on any page — remember the code
  // so it goes with the new account (login form) and checkout later.
  useEffect(() => { captureReferralFromUrl(search); }, [search]);

  const navType = useNavigationType();

  // The browser's own restoration runs at popstate, before this route's
  // content exists, so it lands wrong — this component takes over instead.
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  // Record the scroll position under the CURRENT history entry. The key ref is
  // updated in a layout effect (i.e. synchronously at commit) so a scroll event
  // caused by the next route rendering can never be filed under the old entry.
  const keyRef = useRef(key);
  useLayoutEffect(() => { keyRef.current = key; }, [key]);
  useEffect(() => {
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      // A short timer rather than requestAnimationFrame: rAF is paused in a
      // background/hidden tab, and a position that never gets saved is worse
      // than one saved a tick late.
      setTimeout(() => {
        queued = false;
        // An open popup pins <body> with position:fixed (useBodyScrollLock in
        // ui.jsx), which makes scrollY read 0 even though the page is still
        // scrolled — don't overwrite the real position with that.
        if (document.body.style.position === "fixed") return;
        try { sessionStorage.setItem(scrollKey(keyRef.current), String(Math.round(window.scrollY))); } catch (e) { /* storage blocked — skip */ }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    trackPageview(pathname + hash);
    if (!hash && navType === "POP") {
      const y = savedScroll(key);
      if (y !== null) {
        // The list may still be growing (courses arrive from the API), so keep
        // trying for a moment until the page is tall enough to reach the spot.
        let tries = 0;
        let timer;
        const restore = () => {
          window.scrollTo({ top: y, behavior: "instant" });
          if (Math.abs(window.scrollY - y) > 2 && ++tries < 60) timer = setTimeout(restore, 50);
        };
        timer = setTimeout(restore, 0);
        return () => clearTimeout(timer);
      }
    }
    if (!hash) { window.scrollTo(0, 0); return; }
    // Links to a section (e.g. the old /programs#internships) land here — the target
    // section exists as soon as Programs mounts, but give it a tick so the
    // route has actually rendered before we look it up.
    const id = hash.slice(1);
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname, hash, key, navType]);
  return null;
}

// Shown if a page crashes, or if its script can't be fetched (typically a tab left open
// across a new deploy, which has since replaced the file it asks for). Reloading fixes both.
function PageError() {
  return (
    <section className="section error-page" style={{ paddingTop: 140, minHeight: "60vh" }}>
      <div className="wrap" style={{ maxWidth: 560 }}>
        <span className="eyebrow">Something went wrong</span>
        <h1 className="title-lg" style={{ margin: "14px 0 16px" }}>This page hit a problem.</h1>
        <p style={{ color: "var(--muted)", marginBottom: 28, lineHeight: 1.7 }}>
          Reloading usually fixes it. If it keeps happening, please contact us and we'll sort it out.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="btn btn-solid" onClick={() => window.location.reload()}>Reload the page</button>
          <a className="btn btn-ghost" href="/">Go to the home page</a>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const location = useLocation();
  // No copying the site's text (hooks/useCopyProtection.js).
  useCopyProtection(true);
  return (
    <>
      <ScrollToTop />
      <Chrome />
      <Navbar />
      <main>
        {/* Keyed by the address, so moving to another page starts with a clean slate. */}
        <ErrorBoundary key={location.pathname} fallback={<PageError />}>
        {/* Remounts with the ErrorBoundary on every page change, replaying the
            fade/slide-in in upgrade.css (.page-enter). */}
        <div className="page-enter">
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/programs" element={<Programs />} />
            <Route path="/programs/:slug" element={<CourseDetail />} />
            {/* Internships and Courses used to be separate pages — keep the
                old URLs working by sending them to the merged page, straight
                to the section a bookmark of that old URL actually meant. */}
            <Route path="/internships" element={<Navigate to="/programs" replace />} />
            <Route path="/courses" element={<Navigate to="/programs" replace />} />
            <Route path="/services" element={<Services />} />
            <Route path="/about" element={<About />} />
            <Route path="/careers" element={<Careers />} />
            {/* Unlisted: no menu, footer or sitemap link, and noindex — shared by URL only. */}
            <Route path="/bca-internships" element={<BcaInternships />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/client-terms" element={<ClientTerms />} />

            {/* Student account — login/signup are a popup (AuthModal below),
                not dedicated pages; only the pages that need an account stay
                routed, and prompt the popup themselves if you land here logged out. */}
            <Route path="/dashboard" element={<MyCourses />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/learn/:slug" element={<Learn />} />
            {/* The aptitude test an application's fee unlocks (My Dashboard → Apply / Aptitude Test). */}
            <Route path="/test/:applicationId" element={<AptitudeTest />} />

            {/* Any other address: a real "not found" page, not the home page under a wrong URL. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </div>
        </ErrorBoundary>
      </main>
      <Footer />
      <CookieConsent />
      <AuthModal />
      <SetNewPassword />
    </>
  );
}
