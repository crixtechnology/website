import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Navbar, Footer, Chrome, AuthModal } from "./components/ui.jsx";
import { Home, Programs, CourseDetail, Services, About, Contact, PrivacyPolicy, TermsOfService, ClientTerms } from "./pages/pages.jsx";
import MyCourses from "./pages/student/MyCourses.jsx";
import Learn from "./pages/student/Learn.jsx";
import Profile from "./pages/student/Profile.jsx";
import { AdminDashboard, AdminCourses, AdminLectures, AdminVideos, AdminStudents, AdminGuard } from "./pages/admin/index.js";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
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
              old URLs working by sending them to the merged page. */}
          <Route path="/internships" element={<Navigate to="/programs" replace />} />
          <Route path="/courses" element={<Navigate to="/programs" replace />} />
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

          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <Footer />
      <AuthModal />
    </>
  );
}
