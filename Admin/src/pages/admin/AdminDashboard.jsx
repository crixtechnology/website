import { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserContext } from "../../context/UserContext.jsx";
import { adminGetCourses, adminGetEnrollments, adminGetUsers, adminGetContacts, adminGetApplications, adminGetReferrals, adminGetBotQuestions, adminGetJobApplications, adminGetJobOpenings } from "../../services/api.js";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { offeredTiers } from "../../utils/tiers.js";

// One line icon per dashboard tile (keyed by the tile's label).
const TILE_ICONS = {
  "Courses & Internships": <path d="M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z M20 5h-7a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h7z" />,
  Users: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6 M16 4.5a3.5 3.5 0 0 1 0 6.5 M18 14c2 .7 3.5 2.8 3.5 6" />,
  Subscriptions: <path d="M3 6h18v12H3z M3 10h18 M7 15h4" />,
  "Live class schedule": <path d="M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4 M9 14l2 2 4-4" />,
  "Course videos": <path d="M3 5h18v14H3z M10 9.5v5l4.5-2.5z" />,
  Services: <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M12 2v3 M12 19v3 M4.9 4.9 7 7 M17 17l2.1 2.1 M2 12h3 M19 12h3 M4.9 19.1 7 17 M17 7l2.1-2.1" />,
  "Offer codes": <path d="M3 12V4h8l10 10-8 8z M7.5 7.5h.01" />,
  Referrals: <path d="M16 3h5v5 M21 3l-7 7 M8 21H3v-5 M3 21l7-7" />,
  "Payment requests": <path d="M3 6h18v12H3z M3 10h18 M15 14.5h3 M7 14.5h2" />,
  Messages: <path d="M4 5h16v11H8l-4 4z" />,
  "Help agent questions": <path d="M4 5h16v11H9l-5 4z M10 9.5a2 2 0 1 1 2.5 1.9c-.4.2-.5.5-.5.9 M12 13.6h.01" />,
  Applications: <path d="M7 3h7l4 4v14H7z M14 3v4h4 M9.5 13h5 M9.5 16.5h5" />,
  "Job openings": <path d="M3 8h18v12H3z M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M12 12v4 M10 14h4" />,
  "Job applicants": <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6 M16 11l2 2 4-4" />,
  "Question bank": <path d="M5 4h14v16H5z M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .8-1 1.5 M12 16.5h.01" />,
  "Careers settings": <path d="M4 7h10 M18 7h2 M4 17h2 M10 17h10 M14 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0z M6 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0z" />,
  default: <path d="M5 12h14" />,
};

export default function AdminDashboard() {
  usePageMeta({ title: "Admin Dashboard | Crix Technology" });
  const { user, logout } = useContext(UserContext);
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    courses: 0, openCourses: 0, internships: 0, openInternships: 0, freeInternships: 0,
    students: 0, enrollments: 0, users: 0, newMessages: 0, newApplications: 0,
    referrals: 0, referralsRewarded: 0, botQuestions: 0,
    jobApplicants: 0, jobToReview: 0, jobSelected: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [entriesRes, enrollRes, usersRes, contactsRes, applicationsRes, referralsRes, botRes, jobsRes, openingsRes] = await Promise.all([
        adminGetCourses(), adminGetEnrollments(), adminGetUsers(), adminGetContacts(), adminGetApplications(), adminGetReferrals(), adminGetBotQuestions(), adminGetJobApplications(),
        adminGetJobOpenings(),
      ]);
      const jobs = jobsRes && jobsRes.ok ? jobsRes : null;
      const entries = entriesRes.ok ? entriesRes.courses || [] : [];
      const courses = entries.filter((c) => c.type !== "internship");
      const internships = entries.filter((c) => c.type === "internship");
      const enrollments = enrollRes.ok ? enrollRes.enrollments || [] : [];
      const students = new Set(enrollments.map((e) => e.user?._id).filter(Boolean));
      const users = usersRes.ok ? usersRes.users || [] : [];
      const contacts = contactsRes.ok ? contactsRes.contacts || [] : [];
      const applications = applicationsRes.ok ? applicationsRes.applications || [] : [];
      setStats({
        courses: courses.length,
        // "Open" only counts as actually buyable when it also has a priced
        // plan — a course can carry a leftover status:"open" from before it
        // had one (e.g. bulk-imported data) without being purchasable; don't
        // let the dashboard claim it's live when "Buy now" wouldn't show.
        openCourses: courses.filter((c) => c.status === "open" && offeredTiers(c).length > 0).length,
        internships: internships.length,
        // Same "open" = "actually buyable" rule as courses now that an
        // internship may optionally carry priced plans too (see
        // Backend/src/routes/courses.js) — an apply-only (no plans)
        // internship has no meaningful open/closed toggle in the admin
        // list, so it shouldn't count as "open" here either.
        openInternships: internships.filter((c) => c.status === "open" && offeredTiers(c).length > 0).length,
        // Free internships are job openings listed on /free-internships (Courses & Internships → Free Internship).
        freeInternships: openingsRes && openingsRes.ok ? (openingsRes.openings || []).filter((o) => o.audience === "free").length : 0,
        students: students.size,
        enrollments: enrollments.length,
        users: users.length,
        newMessages: contacts.filter((c) => c.status === "new").length,
        newApplications: applications.filter((a) => !a.contacted).length,
        referrals: referralsRes.ok ? referralsRes.summary.total : 0,
        referralsRewarded: referralsRes.ok ? referralsRes.summary.rewarded : 0,
        botQuestions: botRes.ok && botRes.summary ? botRes.summary.open : 0,
        jobApplicants: jobs ? jobs.summary.totalApplicants : 0,
        // Tests that are in and still need a shortlist / not-shortlist decision.
        jobToReview: jobs ? (jobs.applications || []).filter((a) => a.status === "submitted").length : 0,
        jobSelected: jobs ? jobs.summary.selected : 0,
      });
      setLoading(false);
    })();
  }, []);

  const cards = [
    // One tile: free internships, paid internships and courses share one page and form.
    {
      label: "Courses & Internships",
      value: stats.courses + stats.internships + stats.freeInternships,
      sub: `${stats.freeInternships} free internship${stats.freeInternships === 1 ? "" : "s"} · ${stats.internships} paid · ${stats.courses} course${stats.courses === 1 ? "" : "s"} · ${stats.openCourses + stats.openInternships} on sale`,
      to: "/admin/courses",
    },
    { label: "Users", value: stats.users, sub: "all accounts", to: "/admin/users" },
    { label: "Subscriptions", value: stats.enrollments, sub: "paid & granted", to: "/admin/students" },
    { label: "Live class schedule", value: "Manage", sub: "Google Meet sessions", to: "/admin/lectures" },
    { label: "Course videos", value: "Manage", sub: "recorded lectures", to: "/admin/videos" },
    { label: "Services", value: "Manage", sub: "public /services page", to: "/admin/services" },
    { label: "Payment requests", value: "Manage", sub: "ask a student to pay for a course or internship", to: "/admin/payment-requests" },
    { label: "Wallet credit", value: "Manage", sub: "add credit to a student's wallet", to: "/admin/wallet" },
    { label: "Offer codes", value: "Manage", sub: "discount codes for courses & internships", to: "/admin/coupons" },
    { label: "Referrals", value: stats.referrals, sub: `${stats.referralsRewarded} led to a purchase · rules & credit`, to: "/admin/referrals" },
    { label: "Messages", value: stats.newMessages, sub: "unread contact-form messages", to: "/admin/messages" },
    { label: "Help agent questions", value: stats.botQuestions, sub: "questions the help agent couldn't answer", to: "/admin/bot-questions" },
    { label: "Applications", value: stats.newApplications, sub: "not-yet-contacted Apply/Request submissions", to: "/admin/applications" },
    // Careers: the roles, the aptitude test and the people who took it.
    { label: "Job applicants", value: stats.jobApplicants, sub: `${stats.jobToReview} test${stats.jobToReview === 1 ? "" : "s"} waiting for a decision · ${stats.jobSelected} selected`, to: "/admin/applicants" },
    { label: "Job openings", value: "Manage", sub: "Careers page roles only & their test settings", to: "/admin/job-openings" },
    { label: "Question bank", value: "Manage", sub: "aptitude test questions · Excel/CSV upload", to: "/admin/test-questions" },
    { label: "Careers settings", value: "Manage", sub: "test fee, credits, violation limit", to: "/admin/careers-settings" },
  ];

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Dashboard</h1>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>Signed in as {user?.email}</p>
          </div>
          <button className="btn btn-ghost" onClick={() => { logout(); navigate("/admin"); }}>Log out</button>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : (
          <div className="grid3 stagger admin-tiles" style={{ marginTop: 0 }}>
            {cards.map((c, i) => (
              <Link to={c.to} key={c.label} className="card admin-tile" style={{ display: "block", textDecoration: "none", "--i": i }}>
                <span className="admin-tile-top">
                  <span className="admin-tile-ic" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{TILE_ICONS[c.label] || TILE_ICONS.default}</svg>
                  </span>
                  <span className="tag">{c.label}</span>
                  <span className="admin-tile-arrow" aria-hidden="true">→</span>
                </span>
                <h3 className="admin-tile-value">{c.value}</h3>
                <p className="card-benefit">{c.sub}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
