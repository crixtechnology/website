import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Navbar, Footer, Chrome, AuthModal } from "./components/ui.jsx";
import { Home, Programs, CourseDetail, Services, About, Contact, PrivacyPolicy, TermsOfService, ClientTerms } from "./pages/pages.jsx";
import MyCourses from "./pages/student/MyCourses.jsx";
import Learn from "./pages/student/Learn.jsx";
import Profile from "./pages/student/Profile.jsx";
import {
  AdminDashboard, AdminCourses, AdminLectures, AdminVideos, AdminStudents,
  AdminUsers, AdminMessages, AdminApplications, AdminServices, AdminGuard,
} from "./pages/admin/index.js";

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
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
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Chrome />
      <Navbar />
      <main>
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
          <Route path="/admin/courses" element={<AdminGuard><AdminCourses /></AdminGuard>} />
          <Route path="/admin/lectures" element={<AdminGuard><AdminLectures /></AdminGuard>} />
          <Route path="/admin/videos" element={<AdminGuard><AdminVideos /></AdminGuard>} />
          <Route path="/admin/students" element={<AdminGuard><AdminStudents /></AdminGuard>} />
          <Route path="/admin/users" element={<AdminGuard><AdminUsers /></AdminGuard>} />
          <Route path="/admin/messages" element={<AdminGuard><AdminMessages /></AdminGuard>} />
          <Route path="/admin/applications" element={<AdminGuard><AdminApplications /></AdminGuard>} />
          <Route path="/admin/services" element={<AdminGuard><AdminServices /></AdminGuard>} />

          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <Footer />
      <AuthModal />
    </>
  );
}
