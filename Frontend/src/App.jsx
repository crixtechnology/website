import { Suspense, lazy, useEffect, useLayoutEffect, useRef } from "react";
import { Routes, Route, Navigate, useLocation, useNavigationType } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { Navbar, Footer, Chrome, AuthModal } from "./components/ui.jsx";
import { Home, Programs, CourseDetail, Services, About, Contact, PrivacyPolicy, TermsOfService, ClientTerms, NotFound } from "./pages/pages.jsx";
import AdminGuard from "./pages/admin/AdminGuard.jsx";
import { initAnalytics, trackPageview } from "./utils/analytics.js";
import { captureReferralFromUrl } from "./utils/referral.js";

// Called at module load (not inside a useEffect) deliberately: React fires
// child effects before parent effects, so ScrollToTop's own effect (which
// calls trackPageview on mount) would otherwise run BEFORE App's effect
// got a chance to set up window.gtag — silently dropping every session's
// very first pageview (anyone who lands and bounces without navigating
// again would never be recorded at all). initAnalytics() is idempotent and
// side-effect-safe to call at import time (a no-op with no GA ID set).
initAnalytics();

// The student and admin areas are only ever reached by someone already
// logged in as a student/admin — lazy-loading them keeps their code out of
// the bundle every anonymous visitor downloads just to browse the public
// marketing pages. MyCourses in particular pulls in jsPDF + jspdf-autotable
// (receipt generation) purely for its own "Download Receipt" button; those
// libraries have no reason to ship to someone reading the homepage.
// Public marketing/legal pages (pages.jsx) stay eagerly imported above —
// they're what most visitors actually came for and where load speed/SEO
// matters most, so there's no Suspense flash on the paths that matter most.
const MyCourses = lazy(() => import("./pages/student/MyCourses.jsx"));
const Learn = lazy(() => import("./pages/student/Learn.jsx"));
const Profile = lazy(() => import("./pages/student/Profile.jsx"));

// AdminGuard itself stays eager (imported above, not lazy): it wraps EVERY
// admin route, so lazy-loading it too meant React couldn't start fetching
// an admin page's own chunk until AdminGuard's chunk had first loaded and
// rendered — two sequential round-trips instead of one before any admin
// page became interactive. It's small, so bundling it with the main app
// costs little; the actual weight (each admin page's own code) still only
// loads on demand.
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.jsx"));
const AdminRevenue = lazy(() => import("./pages/admin/AdminRevenue.jsx"));
const AdminCourses = lazy(() => import("./pages/admin/AdminCourses.jsx"));
const AdminLectures = lazy(() => import("./pages/admin/AdminLectures.jsx"));
const AdminVideos = lazy(() => import("./pages/admin/AdminVideos.jsx"));
const AdminStudents = lazy(() => import("./pages/admin/AdminStudents.jsx"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers.jsx"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages.jsx"));
const AdminApplications = lazy(() => import("./pages/admin/AdminApplications.jsx"));
const AdminServices = lazy(() => import("./pages/admin/AdminServices.jsx"));
const AdminReferrals = lazy(() => import("./pages/admin/AdminReferrals.jsx"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons.jsx"));
const AdminAmbassadors = lazy(() => import("./pages/admin/AdminAmbassadors.jsx"));
const Ambassador = lazy(() => import("./pages/Ambassador.jsx"));

// Matches the "Loading..." convention every data-fetching page here already
// uses (MyCourses, every Admin list, etc.) rather than a full-screen splash
// — this only ever shows for the fraction of a second a lazy chunk takes to
// download, so it should read as consistent with the rest of the app, not
// like a separate, heavier loading state.
function RouteLoading() {
  return (
    <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
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
  // so it can pre-fill the signup form and checkout later.
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
    // Nav links to /programs#internships / #courses land here — the target
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
            <Route path="/internships" element={<Navigate to="/programs#internships" replace />} />
            <Route path="/courses" element={<Navigate to="/programs#courses" replace />} />
            <Route path="/services" element={<Services />} />
            <Route path="/ambassador" element={<Ambassador />} />
            <Route path="/about" element={<About />} />
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

            {/* Admin — logs in through the same popup as students (AuthModal
                below); AdminGuard shows an inline login prompt if you land
                here logged out or without admin access, no dedicated page. */}
            <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
            <Route path="/admin/revenue" element={<AdminGuard><AdminRevenue /></AdminGuard>} />
            <Route path="/admin/courses" element={<AdminGuard><AdminCourses /></AdminGuard>} />
            <Route path="/admin/lectures" element={<AdminGuard><AdminLectures /></AdminGuard>} />
            <Route path="/admin/videos" element={<AdminGuard><AdminVideos /></AdminGuard>} />
            <Route path="/admin/students" element={<AdminGuard><AdminStudents /></AdminGuard>} />
            <Route path="/admin/users" element={<AdminGuard><AdminUsers /></AdminGuard>} />
            <Route path="/admin/messages" element={<AdminGuard><AdminMessages /></AdminGuard>} />
            <Route path="/admin/applications" element={<AdminGuard><AdminApplications /></AdminGuard>} />
            <Route path="/admin/services" element={<AdminGuard><AdminServices /></AdminGuard>} />
            <Route path="/admin/referrals" element={<AdminGuard><AdminReferrals /></AdminGuard>} />
            <Route path="/admin/coupons" element={<AdminGuard><AdminCoupons /></AdminGuard>} />
            <Route path="/admin/ambassadors" element={<AdminGuard><AdminAmbassadors /></AdminGuard>} />

            {/* Any other address: a real "not found" page, not the home page under a wrong URL. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </div>
        </ErrorBoundary>
      </main>
      <Footer />
      <AuthModal />
    </>
  );
}
