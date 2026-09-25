import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetCourses, adminGetPaymentRequests, adminCreatePaymentRequest, adminCancelPaymentRequest,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { useDebouncedLoad } from "../../hooks/useDebouncedLoad.js";
import { tierLabel, offeredTiers, planPrice, formatINR, TIER_ORDER } from "../../utils/tiers.js";

const EMPTY = { email: "", courseId: "", tier: "", amount: "", note: "" };
const STATUS_PILL = { pending: "new", paid: "lifetime", cancelled: "read" };

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString("en-IN") : "—";
}

// Ask one student to pay a set amount for one course or internship. Separate
// from the normal checkout: it works whether the item is open or closed, and
// the student pays it from their dashboard and gets access once it's paid.
export default function AdminPaymentRequests() {
  usePageMeta({ title: "Payment requests | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [requests, setRequests] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [formOk, setFormOk] = useState("");

  const load = async (query) => {
    setLoading(true);
    const res = await adminGetPaymentRequests({ q: query, status });
    setLoading(false);
    if (res.ok) { setRequests(res.requests || []); setError(""); }
    else {
      setError(res.error || "Could not load payment requests.");
      if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
    }
  };

  useEffect(() => { adminGetCourses().then((res) => { if (res.ok) setCourses(res.courses || []); }); }, []);
  // Keyed on both, so a search keystroke or a status change reloads once.
  useDebouncedLoad(() => load(q), `${status}|${q}`);

  const course = courses.find((c) => c._id === form.courseId);
  const plans = course ? offeredTiers(course) : [];

  // Picking a plan fills in its current price as a starting point; the admin can change it.
  const pickTier = (tier) => {
    const plan = plans.find((p) => p.tier === tier);
    setForm((f) => ({ ...f, tier, amount: plan ? String(planPrice(plan)) : f.amount }));
  };

  const send = async (e) => {
    e.preventDefault();
    if (sending) return;
    setFormOk("");
    if (!form.email.trim() || !form.courseId || !form.amount) {
      setFormError("Email, course/internship and amount are required.");
      return;
    }
    setSending(true);
    setFormError("");
    const res = await adminCreatePaymentRequest({
      email: form.email.trim(),
      courseId: form.courseId,
      tier: form.tier || null,
      amount: Number(form.amount),
      note: form.note.trim(),
    });
    setSending(false);
    if (res.ok) {
      setForm(EMPTY);
      setFormOk(`Request sent to ${res.request.user?.email}. They'll see it on their dashboard.`);
      load(q);
    } else setFormError(res.error || "Could not send the request.");
  };

  const cancel = async (r) => {
    if (!window.confirm(`Cancel the ${formatINR(r.amount)} request to ${r.user?.name} for "${r.course?.title}"?`)) return;
    const res = await adminCancelPaymentRequest(r._id);
    if (res.ok) load(q); else setError(res.error || "Could not cancel.");
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Payment requests</h1>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <form onSubmit={send} className="admin-form">
          <h3 style={{ margin: "0 0 16px" }}>Request a payment</h3>
          <p className="form-note" style={{ margin: "-8px 0 16px" }}>
            The student must already have an account. They'll see this on their dashboard (and get an email),
            and get access as soon as they pay — whether the course/internship is open or closed. This is separate from normal checkout: no offer codes or referral discounts apply.
          </p>
          <div className="admin-form-grid">
            <div className="field"><label>Student email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="student@example.com" /></div>
            <div className="field"><label>Course / internship</label>
              <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value, tier: "" })}>
                <option value="">Choose a course or internship...</option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.title} ({c.type === "internship" ? "internship" : "course"}{c.status === "closed" ? ", closed" : ""})
                  </option>
                ))}
              </select>
            </div>
            <div className="field"><label>Plan (optional)</label>
              <select value={form.tier} onChange={(e) => pickTier(e.target.value)}>
                <option value="">No plan</option>
                {TIER_ORDER.map((t) => {
                  const plan = plans.find((p) => p.tier === t);
                  return <option key={t} value={t}>{tierLabel(t)}{plan ? ` — ${formatINR(planPrice(plan))}` : ""}</option>;
                })}
              </select>
            </div>
            <div className="field"><label>Amount (₹)</label>
              <input type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 4999" /></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label>Note to the student (optional)</label>
              <input type="text" maxLength={190} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Fee for the September batch" /></div>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          {formOk && <p className="form-note" style={{ color: "var(--teal)" }}>{formOk}</p>}
          <button className="btn btn-solid" type="submit" disabled={sending}>{sending ? "Sending..." : "Send payment request"}</button>
        </form>

        <div style={{ display: "flex", gap: 10, marginTop: 40, flexWrap: "wrap" }}>
          <input
            className="admin-search"
            type="search"
            style={{ flex: "1 1 260px", margin: 0 }}
            placeholder="Search by student name/email or course title..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)", marginTop: 16 }}>Loading...</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : requests.length === 0 ? (
          <p style={{ color: "var(--muted)", marginTop: 16 }}>{q || status ? "No requests match." : "No payment requests yet."}</p>
        ) : (
          <div className="admin-list" style={{ marginTop: 16 }}>
            {requests.map((r) => (
              <div className="admin-row" key={r._id}>
                <div className="admin-row-main">
                  <b>{r.user?.name || "Unknown"}</b>
                  <span className="admin-row-meta">{r.user?.email} {r.user?.phone ? `· ${r.user.phone}` : ""}</span>
                </div>
                <div className="admin-row-main">
                  <b>{r.course?.title || "Course"}</b>{r.tier && <> <span className="plan-pill">{tierLabel(r.tier)}</span></>}
                  <span className="admin-row-meta">
                    {formatINR(r.amount)} · sent {fmtDate(r.createdAt)}
                    {r.paidAt ? ` · paid ${fmtDate(r.paidAt)}` : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </span>
                </div>
                <div className="admin-row-actions">
                  <span className={`admin-pill ${STATUS_PILL[r.status] || "read"}`}>{r.status}</span>
                  {r.status === "pending" && (
                    <button className="btn btn-ghost admin-danger" onClick={() => cancel(r)}>Cancel</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
