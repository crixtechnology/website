import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Navbar, Footer, Chrome } from "./components/ui.jsx";
import { Home, Programs, CourseDetail, Services, About, Contact, PrivacyPolicy, TermsOfService, ClientTerms } from "./pages/pages.jsx";
import { AdminLogin, AdminCourses } from "./pages/admin/index.js";

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
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/courses" element={<AdminCourses />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
