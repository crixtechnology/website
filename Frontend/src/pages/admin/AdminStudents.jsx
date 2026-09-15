import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetEnrollments, adminGrantSubscription, adminUpdateSubscription,
  adminRemoveSubscription, adminGetCourses,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { useDebouncedLoad } from "../../hooks/useDebouncedLoad.js";

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString("en-IN") : "—";
}
function toDateInput(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

const EMPTY_GRANT = { email: "", courseId: "", startDate: "", endDate: "" };

// The subscriptions manager: every course access grant (Enrollment) across
// every student, whether it came from a real Razorpay purchase or was
// granted here by hand — same record either way. Search across user/course,
// grant new access to anyone by email, edit a grant's validity dates inline,
// or revoke it outright.
export default function AdminStudents() {
  usePageMeta({ title: "Subscriptions | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [enrollments, setEnrollments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const [grantForm, setGrantForm] = useState(EMPTY_GRANT);
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState("");

  const load = async (query) => {
    setLoading(true);
    const res = await adminGetEnrollments(query);
    setLoading(false);
    if (res.ok) { setEnrollments(res.enrollments || []); setError(""); }
    else {
      setError(res.error || "Could not load subscriptions.");
      if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
    }
  };

  // Both types now — an internship can carry a real price and get a real
  // Enrollment the same way a course does (Backend/src/routes/courses.js),
  // so it needs to be grantable/revocable here too, not just courses.
  useEffect(() => { adminGetCourses().then((res) => { if (res.ok) setCourses(res.courses || []); }); }, []);
  useDebouncedLoad(load, q);

  const grant = async (e) => {
    e.preventDefault();
    // A disabled submit button doesn't stop the browser's native form
    // submit on Enter inside a text field — without this guard, pressing
    // Enter twice quickly fires two concurrent grant requests.
    if (granting) return;
    if (!grantForm.email.trim() || !grantForm.courseId) {
      setGrantError("Email and course are both required.");
      return;
    }
    setGranting(true);
    setGrantError("");
    const res = await adminGrantSubscription({
      email: grantForm.email.trim(),
      courseId: grantForm.courseId,
      startDate: grantForm.startDate || undefined,
      endDate: grantForm.endDate || null,
    });
    setGranting(false);
    if (res.ok) { setGrantForm(EMPTY_GRANT); load(q); }
    else setGrantError(res.error || "Could not grant subscription.");
  };

  const editEndDate = async (en, endDate) => {
    const res = await adminUpdateSubscription(en._id, { endDate: endDate || null });
    if (res.ok) load(q); else setError(res.error || "Could not update.");
  };

  const editStartDate = async (en, startDate) => {
    const res = await adminUpdateSubscription(en._id, { startDate });
    if (res.ok) load(q); else setError(res.error || "Could not update.");
  };

  const revoke = async (en) => {
    if (!window.confirm(`Remove "${en.user?.name}"'s subscription to "${en.course?.title}"?`)) return;
    const res = await adminRemoveSubscription(en._id);
    if (res.ok) load(q); else setError(res.error || "Could not remove.");
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h2 style={{ margin: "14px 0 0" }}>Subscriptions</h2>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <form onSubmit={grant} className="admin-form">
          <h3 style={{ margin: "0 0 16px" }}>Grant a subscription</h3>
          <p className="form-note" style={{ margin: "-8px 0 16px" }}>
            The user must already have an account (ask them to sign up first) — this grants course access without a payment, exactly like a real purchase would.
          </p>
          <div className="admin-form-grid">
            <div className="field"><label>User email</label>
              <input type="email" value={grantForm.email} onChange={(e) => setGrantForm({ ...grantForm, email: e.target.value })} placeholder="student@example.com" /></div>
            <div className="field"><label>Course</label>
              <select value={grantForm.courseId} onChange={(e) => setGrantForm({ ...grantForm, courseId: e.target.value })}>
                <option value="">Choose a course or internship...</option>
                {courses.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
              </select>
            </div>
            <div className="field"><label>Start date (optional)</label>
              <input type="date" value={grantForm.startDate} onChange={(e) => setGrantForm({ ...grantForm, startDate: e.target.value })} /></div>
            <div className="field"><label>Expires (optional)</label>
              <input type="date" value={grantForm.endDate} onChange={(e) => setGrantForm({ ...grantForm, endDate: e.target.value })} /></div>
          </div>
          {grantError && <p className="form-error">{grantError}</p>}
          <button className="btn btn-solid" type="submit" disabled={granting}>{granting ? "Granting..." : "Grant subscription"}</button>
        </form>

        <input
          className="admin-search"
          type="search"
          style={{ marginTop: 40 }}
          placeholder="Search by student name/email or course title..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : enrollments.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>{q ? "No subscriptions match that search." : "No subscriptions yet."}</p>
        ) : (
          <div className="admin-list">
            {enrollments.map((en) => (
              <div className="admin-row" key={en._id}>
                <div className="admin-row-main">
                  <b>{en.user?.name || "Unknown"}</b>
                  <span className="admin-row-meta">{en.user?.email} {en.user?.phone ? `· ${en.user.phone}` : ""}</span>
                </div>
                <div className="admin-row-main">
                  <b>{en.course?.title || "Course"}</b>
                  <span className="admin-row-meta">
                    {en.endDate ? (
                      <span className={`admin-pill ${en.expired ? "expired" : "new"}`}>
                        {en.expired ? "expired" : "valid until"} {fmtDate(en.endDate)}
                      </span>
                    ) : (
                      <span className="admin-pill lifetime">lifetime</span>
                    )}
                  </span>
                </div>
                <div className="admin-row-actions">
                  <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: ".7rem", color: "var(--muted)" }}>
                    Start
                    <input type="date" defaultValue={toDateInput(en.startDate)}
                      onBlur={(e) => { if (e.target.value && e.target.value !== toDateInput(en.startDate)) editStartDate(en, e.target.value); }} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: ".7rem", color: "var(--muted)" }}>
                    Valid until
                    <input type="date" defaultValue={toDateInput(en.endDate)}
                      onBlur={(e) => { if (e.target.value !== toDateInput(en.endDate)) editEndDate(en, e.target.value); }} />
                  </label>
                  <button className="btn btn-ghost admin-danger" onClick={() => revoke(en)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
