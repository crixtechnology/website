import { Suspense, lazy, useEffect } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import AdminGuard from "./pages/admin/AdminGuard.jsx";

// Each admin page loads on demand.
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.jsx"));
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
const AdminPaymentRequests = lazy(() => import("./pages/admin/AdminPaymentRequests.jsx"));

const ROUTES = [
  ["/admin", AdminDashboard],
  ["/admin/courses", AdminCourses],
  ["/admin/lectures", AdminLectures],
  ["/admin/videos", AdminVideos],
  ["/admin/students", AdminStudents],
  ["/admin/users", AdminUsers],
  ["/admin/messages", AdminMessages],
  ["/admin/applications", AdminApplications],
  ["/admin/services", AdminServices],
  ["/admin/referrals", AdminReferrals],
  ["/admin/coupons", AdminCoupons],
  ["/admin/ambassadors", AdminAmbassadors],
  ["/admin/payment-requests", AdminPaymentRequests],
];

function RouteLoading() {
  return (
    <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
      <div className="wrap"><p style={{ color: "var(--muted)" }}>Loading...</p></div>
    </section>
  );
}

function PageError() {
  return (
    <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
      <div className="wrap" style={{ maxWidth: 560 }}>
        <span className="eyebrow">Something went wrong</span>
        <h1 className="title-lg" style={{ margin: "14px 0 16px" }}>This page hit a problem.</h1>
        <p style={{ color: "var(--muted)", marginBottom: 28, lineHeight: 1.7 }}>Reloading usually fixes it.</p>
        <button className="btn btn-solid" onClick={() => window.location.reload()}>Reload the page</button>
      </div>
    </section>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// Minimal header: the panel has no public navigation, only a way home.
function Header() {
  return (
    <nav className="topbar">
      <div className="wrap nav-in">
        <Link to="/admin" className="logo" aria-label="Admin home">
          <img src="/logo-icon.png" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <span className="logo-text">
            <span className="logo-top">CRIX</span>
            <span className="logo-bottom">ADMIN</span>
          </span>
        </Link>
      </div>
    </nav>
  );
}

export default function App() {
  const location = useLocation();
  return (
    <>
      <ScrollToTop />
      <Header />
      <main>
        <ErrorBoundary key={location.pathname} fallback={<PageError />}>
          <div className="page-enter">
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Navigate to="/admin" replace />} />
                {ROUTES.map(([path, Page]) => (
                  <Route key={path} path={path} element={<AdminGuard><Page /></AdminGuard>} />
                ))}
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Routes>
            </Suspense>
          </div>
        </ErrorBoundary>
      </main>
    </>
  );
}
