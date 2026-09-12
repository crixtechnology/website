import { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAdminToken, adminGetApplications, adminUpdateApplication, adminDeleteApplication } from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { useDebouncedLoad } from "../../hooks/useDebouncedLoad.js";

// Every "Apply" (internship) / "Request to enroll" (course) submission from
// InquiryModal, persisted server-side (routes/applications.js) — this is
// what replaced the old wa.me/phone redirect, so it needs somewhere to
// actually surface instead of only existing as a best-effort email.
export default function AdminApplications() {
  usePageMeta({ title: "Applications | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState(""); // "" | "internship" | "course"

  // Ignores the value the hook passes in — it's just a change signal here,
  // since there are two filters (q, type); both are read from closure state.
  const load = async () => {
    setLoading(true);
    const res = await adminGetApplications(q, type);
    setLoading(false);
    if (res.ok) { setApplications(res.applications || []); setError(""); }
    else {
      setError(res.error || "Could not load applications.");
      if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
    }
  };

  // Fetches once on mount, then debounced as the search box or type filter changes.
  useDebouncedLoad(load, `${q}|${type}`);

  const toggleContacted = async (a) => {
    const res = await adminUpdateApplication(a._id, { contacted: !a.contacted });
    if (res.ok) load(); else setError(res.error || "Could not update application.");
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete the application from "${a.name}"? This cannot be undone.`)) return;
    const res = await adminDeleteApplication(a._id);
    if (res.ok) load(); else setError(res.error || "Could not delete.");
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h2 style={{ margin: "14px 0 0" }}>Applications &amp; inquiries</h2>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
              "Apply" and "Request to enroll" submissions from the public site — no account required to submit.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <input
            className="admin-search"
            type="search"
            placeholder="Search by name, email, college or program..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: "1 1 260px" }}
          />
          <select className="admin-search" value={type} onChange={(e) => setType(e.target.value)} style={{ flex: "0 0 auto" }}>
            <option value="">All types</option>
            <option value="internship">Internships</option>
            <option value="course">Courses</option>
          </select>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : applications.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>{q || type ? "No applications match that filter." : "No applications yet."}</p>
        ) : (
          <div className="admin-list">
            {applications.map((a) => (
              <div className="admin-row" key={a._id}>
                <div className="admin-row-main">
                  <b>
                    {a.name} <span className={`admin-pill ${a.contacted ? "read" : "new"}`}>{a.contacted ? "contacted" : "new"}</span>
                  </b>
                  <span className="admin-row-meta">
                    {a.email} · {a.phone} {a.college ? `· ${a.college}` : ""} · {new Date(a.createdAt).toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="admin-row-main admin-row-message">
                  <p>
                    <span className={`type-pill type-pill--${a.type}`} style={{ marginRight: 8 }}>
                      {a.type === "internship" ? "Internship" : "Course"}
                    </span>
                    {a.course ? (
                      // `course` resolves for either type now that an internship
                      // may also be a real, priced Course doc (routes/
                      // applications.js) — an application submitted while the
                      // site ran off the static content.js fallback (no slug)
                      // stays plain text either way.
                      <Link className="admin-link" to={`/admin/courses?edit=${a.course}`} title="Open this entry in Manage Courses">
                        {a.refTitle}
                      </Link>
                    ) : (
                      a.refTitle
                    )}
                  </p>
                </div>
                <div className="admin-row-actions">
                  <button className="btn btn-ghost" onClick={() => toggleContacted(a)}>
                    Mark {a.contacted ? "not contacted" : "contacted"}
                  </button>
                  <button className="btn btn-ghost admin-danger" onClick={() => remove(a)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
