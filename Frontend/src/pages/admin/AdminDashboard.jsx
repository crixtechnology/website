import { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserContext } from "../../context/UserContext.jsx";
import { adminGetCourses, adminGetEnrollments, adminGetUsers, adminGetContacts, adminGetApplications, adminGetRevenueSummary } from "../../services/api.js";
import { usePageMeta } from "../../hooks/usePageMeta.js";

export default function AdminDashboard() {
  usePageMeta({ title: "Admin Dashboard | Crix Technology" });
  const { user, logout } = useContext(UserContext);
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    courses: 0, openCourses: 0, internships: 0, openInternships: 0,
    students: 0, enrollments: 0, users: 0, newMessages: 0, newApplications: 0,
    totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [entriesRes, enrollRes, usersRes, contactsRes, applicationsRes, revenueRes] = await Promise.all([
        adminGetCourses(), adminGetEnrollments(), adminGetUsers(), adminGetContacts(), adminGetApplications(), adminGetRevenueSummary(),
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
        // "Open" only counts as actually buyable when it also has a price —
        // a course can carry a leftover status:"open" from before it had a
        // price (e.g. bulk-imported data) without being purchasable; don't
        // let the dashboard claim it's live when "Buy now" wouldn't show.
        openCourses: courses.filter((c) => c.status === "open" && c.price != null).length,
        internships: internships.length,
        // Same "open" = "actually buyable" rule as courses now that an
        // internship may optionally carry a real price too (see
        // Backend/src/routes/courses.js) — an apply-only (unpriced)
        // internship has no meaningful open/closed toggle in the admin
        // list, so it shouldn't count as "open" here either.
        openInternships: internships.filter((c) => c.status === "open" && c.price != null).length,
        students: students.size,
        enrollments: enrollments.length,
        users: users.length,
        newMessages: contacts.filter((c) => c.status === "new").length,
        newApplications: applications.filter((a) => !a.contacted).length,
        totalRevenue: revenueRes.ok ? revenueRes.summary.totalRevenue : 0,
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
    { label: "Messages", value: stats.newMessages, sub: "unread contact-form messages", to: "/admin/messages" },
    { label: "Applications", value: stats.newApplications, sub: "not-yet-contacted Apply/Request submissions", to: "/admin/applications" },
  ];

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h2 style={{ margin: "14px 0 0" }}>Dashboard</h2>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>Signed in as {user?.email}</p>
          </div>
          <button className="btn btn-ghost" onClick={() => { logout(); navigate("/admin"); }}>Log out</button>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : (
          <div className="grid3 stagger" style={{ marginTop: 0 }}>
            {cards.map((c) => (
              <Link to={c.to} key={c.label} className="card" style={{ display: "block", textDecoration: "none" }}>
                <span className="tag">{c.label}</span>
                <h3 style={{ margin: "14px 0 4px", fontSize: "2rem" }}>{c.value}</h3>
                <p className="card-benefit">{c.sub}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
