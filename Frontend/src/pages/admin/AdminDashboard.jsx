import { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserContext } from "../../context/UserContext.jsx";
import { adminGetCourses, adminGetEnrollments, adminGetUsers, adminGetContacts, adminGetApplications, adminGetRevenueSummary, adminGetReferrals, adminGetAmbassadors } from "../../services/api.js";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { offeredTiers } from "../../utils/tiers.js";

// One line icon per dashboard tile (keyed by the tile's label).
const TILE_ICONS = {
  Revenue: <path d="M4 19h16 M7 16V11 M12 16V7 M17 16v-3" />,
  Courses: <path d="M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z M20 5h-7a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h7z" />,
  Internships: <path d="M3 8h18v12H3z M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M3 13h18" />,
  Users: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6 M16 4.5a3.5 3.5 0 0 1 0 6.5 M18 14c2 .7 3.5 2.8 3.5 6" />,
  Subscriptions: <path d="M3 6h18v12H3z M3 10h18 M7 15h4" />,
  "Live class schedule": <path d="M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4 M9 14l2 2 4-4" />,
  "Course videos": <path d="M3 5h18v14H3z M10 9.5v5l4.5-2.5z" />,
  Services: <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M12 2v3 M12 19v3 M4.9 4.9 7 7 M17 17l2.1 2.1 M2 12h3 M19 12h3 M4.9 19.1 7 17 M17 7l2.1-2.1" />,
  "Offer codes": <path d="M3 12V4h8l10 10-8 8z M7.5 7.5h.01" />,
  Referrals: <path d="M16 3h5v5 M21 3l-7 7 M8 21H3v-5 M3 21l7-7" />,
  "Campus ambassadors": <path d="M12 3 2 8l10 5 10-5z M6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5" />,
  Messages: <path d="M4 5h16v11H8l-4 4z" />,
  Applications: <path d="M7 3h7l4 4v14H7z M14 3v4h4 M9.5 13h5 M9.5 16.5h5" />,
  default: <path d="M5 12h14" />,
};

export default function AdminDashboard() {
  usePageMeta({ title: "Admin Dashboard | Crix Technology" });
  const { user, logout } = useContext(UserContext);
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    courses: 0, openCourses: 0, internships: 0, openInternships: 0,
    students: 0, enrollments: 0, users: 0, newMessages: 0, newApplications: 0,
    totalRevenue: 0, referrals: 0, referralsRewarded: 0, ambassadorApplications: 0, ambassadorPayouts: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [entriesRes, enrollRes, usersRes, contactsRes, applicationsRes, revenueRes, referralsRes, ambassadorsRes] = await Promise.all([
        adminGetCourses(), adminGetEnrollments(), adminGetUsers(), adminGetContacts(), adminGetApplications(), adminGetRevenueSummary(), adminGetReferrals(), adminGetAmbassadors(),
      ]);
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
        students: students.size,
        enrollments: enrollments.length,
        users: users.length,
        newMessages: contacts.filter((c) => c.status === "new").length,
        newApplications: applications.filter((a) => !a.contacted).length,
        totalRevenue: revenueRes.ok ? revenueRes.summary.totalRevenue : 0,
        referrals: referralsRes.ok ? referralsRes.summary.total : 0,
        referralsRewarded: referralsRes.ok ? referralsRes.summary.rewarded : 0,
        ambassadorApplications: ambassadorsRes.ok ? ambassadorsRes.summary.applied : 0,
        ambassadorPayouts: ambassadorsRes.ok ? ambassadorsRes.summary.payoutsWaiting : 0,
      });
      setLoading(false);
    })();
  }, []);

  const cards = [
    {
      label: "Revenue", value: `₹${stats.totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      sub: "total, all-time", to: "/admin/revenue",
    },
    { label: "Courses", value: stats.courses, sub: `${stats.openCourses} open`, to: "/admin/courses" },
    { label: "Internships", value: stats.internships, sub: `${stats.openInternships} open`, to: "/admin/courses" },
    { label: "Users", value: stats.users, sub: "all accounts", to: "/admin/users" },
    { label: "Subscriptions", value: stats.enrollments, sub: "paid & granted", to: "/admin/students" },
    { label: "Live class schedule", value: "Manage", sub: "Google Meet sessions", to: "/admin/lectures" },
    { label: "Course videos", value: "Manage", sub: "recorded lectures", to: "/admin/videos" },
    { label: "Services", value: "Manage", sub: "public /services page", to: "/admin/services" },
    { label: "Offer codes", value: "Manage", sub: "discount codes for courses & internships", to: "/admin/coupons" },
    { label: "Referrals", value: stats.referrals, sub: `${stats.referralsRewarded} led to a purchase · rules & credit`, to: "/admin/referrals" },
    { label: "Campus ambassadors", value: stats.ambassadorApplications, sub: `applications to review · ${stats.ambassadorPayouts} payouts to send`, to: "/admin/ambassadors" },
    { label: "Messages", value: stats.newMessages, sub: "unread contact-form messages", to: "/admin/messages" },
    { label: "Applications", value: stats.newApplications, sub: "not-yet-contacted Apply/Request submissions", to: "/admin/applications" },
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
