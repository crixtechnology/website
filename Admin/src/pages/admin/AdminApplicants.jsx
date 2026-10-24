import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetJobApplications, adminGetJobApplication, adminSetJobApplicationStatus,
  adminExportJobApplications, adminGetJobOpenings, adminGetTestSnapshot, adminGetApplicationCv,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { useDebouncedLoad } from "../../hooks/useDebouncedLoad.js";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
// Times are stored in UTC and always shown in Indian time.
const ist = (d) => (d ? `${new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })} IST` : "—");
const istTime = (d) => new Date(d).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });

const STATUS_PILL = {
  payment_pending: "read", test_pending: "new", submitted: "new", shortlisted: "lifetime",
  interview_scheduled: "lifetime", selected: "lifetime", not_shortlisted: "expired", rejected: "expired",
};
const ENDED = { manual: "Submitted by the candidate", time_up: "Time ran out", violations: "Auto-submitted: too many violations" };
const VIOLATION = {
  fullscreen_exit: "Left full screen", tab_switch: "Switched tab or app", window_blur: "Window lost focus",
  copy: "Tried to copy", cut: "Tried to cut", paste: "Tried to paste", context_menu: "Right-click", shortcut: "Blocked shortcut",
  no_face: "No face in the webcam photo", multiple_faces: "More than one face in the webcam photo", webcam_off: "Webcam stopped",
};
// What can be done from each status (mirrors the server's ACTIONS).
const CAN = {
  shortlist: ["submitted", "not_shortlisted"],
  not_shortlist: ["submitted"],
  schedule_interview: ["submitted", "shortlisted", "interview_scheduled"],
  select: ["shortlisted", "interview_scheduled"],
  reject: ["shortlisted", "interview_scheduled"],
};

// "2026-10-14T15:30" typed as Indian time -> the moment in UTC.
const istInputToIso = (value) => (value ? new Date(`${value}:00+05:30`).toISOString() : "");
const isoToIstInput = (iso) => {
  if (!iso) return "";
  const shifted = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
};

/* ---------- one webcam snapshot (fetched with the admin's login) ---------- */
function Snapshot({ snapshot }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    adminGetTestSnapshot(snapshot._id).then((res) => {
      if (!alive) return;
      if (res.ok) { objectUrl = URL.createObjectURL(res.blob); setUrl(objectUrl); }
      else setFailed(true);
    });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [snapshot._id]);
  return (
    <figure className={`snapshot${snapshot.flag ? " flagged" : ""}`}>
      {url ? <img src={url} alt={`Webcam snapshot at ${istTime(snapshot.at)}`} /> : <div className="snapshot-empty">{failed ? "File not available" : "Loading…"}</div>}
      <figcaption>{istTime(snapshot.at)}{snapshot.flag ? ` · ${VIOLATION[snapshot.flag] || snapshot.flag}` : ""}</figcaption>
    </figure>
  );
}

/* ---------- one applicant: the attempt review and the status actions ---------- */
function ApplicantReview({ id, onBack, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [interview, setInterview] = useState({ at: "", link: "" });
  const [note, setNote] = useState("");
  const [showAnswers, setShowAnswers] = useState(false);

  const load = async () => {
    const res = await adminGetJobApplication(id);
    if (res.ok) {
      setData(res);
      setInterview({ at: isoToIstInput(res.application.interviewAt), link: res.application.interviewLink || "" });
      setNote(res.application.adminNote || "");
      setError("");
    } else setError(res.error || "Could not load this applicant.");
  };
  useEffect(() => { load(); }, [id]);

  if (error) return <><button className="btn btn-ghost" onClick={onBack}>← All applicants</button><p className="form-error" style={{ marginTop: 16 }}>{error}</p></>;
  if (!data) return <p style={{ color: "var(--muted)" }}>Loading...</p>;

  const a = data.application;
  const t = a.attempt;
  const review = data.review;
  // A BCA internship has no interview round: it can be selected straight from the test.
  const can = (action) => CAN[action].includes(a.status) || (action === "select" && a.status === "submitted" && a.opening?.audience === "bca");

  const openCv = async () => {
    const res = await adminGetApplicationCv(a._id);
    if (!res.ok) { setMsg({ kind: "error", text: res.error || "Could not open the CV." }); return; }
    // Downloaded rather than opened in a tab: a tab opened after the fetch would be popup-blocked.
    const url = URL.createObjectURL(res.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = a.cv.fileName || "cv.pdf";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const act = async (action, label, extra = {}) => {
    if (busy) return;
    if (!window.confirm(`${label} — ${a.user?.name || "this candidate"}? They will be emailed and notified on their dashboard.`)) return;
    setBusy(true);
    setMsg({ kind: "", text: "" });
    const res = await adminSetJobApplicationStatus(id, { action, note, ...extra });
    setBusy(false);
    if (res.ok) { setMsg({ kind: "ok", text: `Done — the candidate is now "${res.application.statusLabel}" and has been notified.` }); await load(); onChanged && onChanged(); }
    else setMsg({ kind: "error", text: res.error || "Could not update the application." });
  };

  const schedule = () => {
    if (!interview.at) { setMsg({ kind: "error", text: "Choose the interview date and time." }); return; }
    if (!/^https?:\/\//i.test(interview.link.trim())) { setMsg({ kind: "error", text: "Enter the meeting link (starting with https://)." }); return; }
    act("schedule_interview", a.status === "interview_scheduled" ? "Reschedule the interview" : "Schedule the interview", { interviewAt: istInputToIso(interview.at), interviewLink: interview.link.trim() });
  };

  return (
    <>
      <button className="btn btn-ghost" onClick={onBack}>← All applicants</button>

      <div className="admin-form" style={{ marginTop: 20 }}>
        <h3 style={{ margin: "0 0 6px" }}>
          {a.user?.name || "Candidate"} <span className={`admin-pill ${STATUS_PILL[a.status] || "read"}`}>{a.statusLabel}</span>
        </h3>
        <p className="form-note" style={{ margin: "0 0 4px" }}>
          {a.opening?.title} · {a.user?.email}{a.user?.phone ? ` · ${a.user.phone}` : ""}
        </p>
        <p className="form-note" style={{ margin: 0 }}>
          Applied {ist(a.createdAt)} · {a.paidAt
            ? `paid ${data.payment ? money(data.payment.amount) : ""} on ${ist(a.paidAt)}${data.payment?.receiptNumber ? ` (receipt ${data.payment.receiptNumber})` : ""}`
            : a.opening?.feeRequired === false ? "free role — no fee" : "test fee not paid"}
        </p>
        {a.cv ? (
          <p className="form-note" style={{ margin: "4px 0 0" }}>
            CV: <button type="button" className="link-btn" onClick={openCv}>{a.cv.fileName || "cv.pdf"}</button> · uploaded {ist(a.cv.uploadedAt)}
          </p>
        ) : a.opening?.audience === "bca" ? <p className="form-note" style={{ margin: "4px 0 0" }}>No CV uploaded yet.</p> : null}

        <h3 style={{ margin: "22px 0 12px" }}>Decision</h3>
        <div className="field"><label htmlFor="ap-note">Private note (only admins see it)</label>
          <input id="ap-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Strong on technical, weak on verbal" /></div>
        <div className="admin-actions">
          <button className="btn btn-solid" disabled={busy || !can("shortlist")} onClick={() => act("shortlist", "Shortlist")}>Shortlist</button>
          <button className="btn btn-ghost admin-danger" disabled={busy || !can("not_shortlist")} onClick={() => act("not_shortlist", "Mark as not shortlisted")}>Not shortlisted</button>
          <button className="btn btn-solid" disabled={busy || !can("select")} onClick={() => act("select", "Select (send the final offer)")}>Select</button>
          <button className="btn btn-ghost admin-danger" disabled={busy || !can("reject")} onClick={() => act("reject", "Reject")}>Reject</button>
        </div>

        <h3 style={{ margin: "22px 0 12px" }}>Interview</h3>
        <div className="admin-form-grid admin-form-grid--2">
          <div className="field"><label htmlFor="ap-when">Date &amp; time (Indian time)</label>
            <input id="ap-when" type="datetime-local" value={interview.at} onChange={(e) => setInterview({ ...interview, at: e.target.value })} disabled={!can("schedule_interview")} /></div>
          <div className="field"><label htmlFor="ap-link">Meeting link</label>
            <input id="ap-link" type="url" value={interview.link} onChange={(e) => setInterview({ ...interview, link: e.target.value })} placeholder="https://meet.google.com/..." disabled={!can("schedule_interview")} /></div>
        </div>
        <div className="admin-actions">
          <button className="btn btn-solid" disabled={busy || !can("schedule_interview")} onClick={schedule}>
            {a.status === "interview_scheduled" ? "Reschedule interview" : "Schedule interview"}
          </button>
          {a.interviewAt && <span className="form-note" style={{ margin: 0 }}>Currently: {ist(a.interviewAt)}</span>}
        </div>
        {msg.text && <p className={msg.kind === "ok" ? "ref-ok" : "form-error"} role="status" style={{ marginTop: 14 }}>{msg.text}</p>}
      </div>

      {!t ? (
        <p style={{ color: "var(--muted)", marginTop: 24 }}>{a.paidAt || a.status === "test_pending" ? "The candidate hasn't started the test yet." : a.opening?.feeRequired === false ? "No test yet — the candidate hasn't accepted the terms to unlock it." : "No test yet — the test fee hasn't been paid."}</p>
      ) : (
        <>
          <div className="ref-stats ref-stats--admin" style={{ marginTop: 28 }}>
            <div className="ref-stat ref-stat--accent"><b>{t.score ?? "—"}{t.maxScore != null ? ` / ${t.maxScore}` : ""}</b><span>Score</span></div>
            <div className="ref-stat"><b>{t.passed == null ? "—" : t.passed ? "Yes" : "No"}</b><span>Cleared cut-off</span></div>
            <div className="ref-stat"><b>{t.correctCount ?? "—"}</b><span>Correct</span></div>
            <div className="ref-stat"><b>{t.wrongCount ?? "—"}</b><span>Wrong</span></div>
            <div className="ref-stat"><b>{t.violationCount}</b><span>Violations</span></div>
            <div className="ref-stat"><b>{review.snapshots.length}</b><span>Webcam photos</span></div>
          </div>
          <p className="form-note">
            Started {ist(t.startedAt)} · {t.status === "submitted" ? `${ENDED[t.submitReason] || "Submitted"} at ${ist(t.submittedAt)}` : "Still in progress"}
            {" "}· {review.device || "Unknown device"} · {review.browser || "Unknown browser"} · IP {review.ip || "—"}{review.viaDesktopApp ? " · desktop app" : ""}
          </p>
          <p className="form-note">
            Accepted the test rules &amp; webcam monitoring: {review.consentAt ? ist(review.consentAt) : "not recorded"}
            {" "}· Confirmed 18 or older: {review.adultConfirmedAt ? ist(review.adultConfirmedAt) : "not recorded"}
          </p>

          {t.categoryScores && (
            <>
              <h3 style={{ margin: "28px 0 12px", fontSize: "1.05rem" }}>Category-wise score</h3>
              <div className="admin-list">
                {Object.entries(t.categoryScores).map(([key, c]) => (
                  <div className="admin-row" key={key}>
                    <div className="admin-row-main"><b>{c.label}</b>
                      <span className="admin-row-meta">{c.correct} correct · {c.wrong} wrong · {c.skipped} not answered · of {c.total}</span></div>
                    <div className="admin-row-main" style={{ textAlign: "right" }}><b>{c.score} / {c.max}</b></div>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 style={{ margin: "28px 0 12px", fontSize: "1.05rem" }}>Violation timeline</h3>
          {review.violations.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No violations were recorded.</p>
          ) : (
            <div className="admin-list">
              {review.violations.map((v) => (
                <div className="admin-row" key={v._id}>
                  <div className="admin-row-main">
                    <b>{VIOLATION[v.type] || v.type} {v.counted ? <span className="admin-pill expired">counted</span> : <span className="admin-pill read">logged only</span>}</b>
                    <span className="admin-row-meta">{ist(v.at)} ({istTime(v.at)}){v.detail ? ` · ${v.detail}` : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ margin: "28px 0 12px", fontSize: "1.05rem" }}>Webcam snapshots</h3>
          {review.snapshots.length === 0
            ? <p style={{ color: "var(--muted)" }}>No webcam photos were taken.</p>
            : <div className="snapshot-grid">{review.snapshots.map((s) => <Snapshot key={s._id} snapshot={s} />)}</div>}

          <h3 style={{ margin: "28px 0 12px", fontSize: "1.05rem" }}>Answers</h3>
          <button className="btn btn-ghost" onClick={() => setShowAnswers((v) => !v)}>{showAnswers ? "Hide the answers" : `Show all ${review.questions.length} answers`}</button>
          {showAnswers && (
            <div className="admin-list" style={{ marginTop: 14 }}>
              {review.questions.map((q) => (
                <div className="admin-row" key={q.number}>
                  <div className="admin-row-main">
                    <b style={{ whiteSpace: "pre-wrap" }}>
                      {q.number}. {q.text}{" "}
                      <span className={`admin-pill ${q.outcome === "correct" ? "lifetime" : q.outcome === "wrong" ? "expired" : "read"}`}>{q.outcome === "skipped" ? "not answered" : q.outcome}</span>
                      {q.marked && <> <span className="admin-pill new">marked for review</span></>}
                      {q.generated && <> <span className="admin-pill read" title="Written for this candidate with fresh values, not taken from the question bank">generated</span></>}
                    </b>
                    <span className="admin-row-meta">{q.categoryLabel}</span>
                    <span className="admin-row-meta">
                      {q.options.map((o, i) => (
                        <span key={i} className={i === q.correct ? "question-answer" : i === q.selected ? "question-wrong" : undefined}>
                          {String.fromCharCode(65 + i)}. {o}{i === q.correct ? " ✓" : ""}{i === q.selected ? " (chosen)" : ""}{i < q.options.length - 1 ? "  ·  " : ""}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ---------- the applicants list ---------- */
export default function AdminApplicants() {
  usePageMeta({ title: "Applicants | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [applications, setApplications] = useState([]);
  const [summary, setSummary] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [openings, setOpenings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [openId, setOpenId] = useState(null); // the applicant being reviewed
  const [exporting, setExporting] = useState(false);

  const filters = { q, status, openingId };
  const load = async (f) => {
    setLoading(true);
    const res = await adminGetJobApplications(f);
    setLoading(false);
    if (res.ok) { setApplications(res.applications || []); setSummary(res.summary); setStatuses(res.statuses || {}); setError(""); }
    else {
      setError(res.error || "Could not load the applicants.");
      if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
    }
  };
  useDebouncedLoad((key) => load(JSON.parse(key)), JSON.stringify(filters));
  useEffect(() => { adminGetJobOpenings().then((res) => { if (res.ok) setOpenings(res.openings || []); }); }, []);

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    const res = await adminExportJobApplications(filters);
    setExporting(false);
    if (!res.ok) { setError(res.error || "Could not export."); return; }
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.filename || "crix-applicants.xlsx";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Applicants</h1>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>Everyone who applied for a role: payment, test result, violations and where their application stands.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        {openId ? (
          <ApplicantReview id={openId} onBack={() => setOpenId(null)} onChanged={() => load(filters)} />
        ) : (
          <>
            {summary && (
              <div className="ref-stats ref-stats--admin">
                <div className="ref-stat"><b>{summary.totalApplicants}</b><span>Total applicants</span></div>
                <div className="ref-stat"><b>{summary.paymentsReceived}</b><span>Payments received</span></div>
                <div className="ref-stat"><b>{money(summary.amountReceived)}</b><span>Test fees collected</span></div>
                <div className="ref-stat"><b>{summary.averageScore ?? "—"}</b><span>Average score</span></div>
                <div className="ref-stat"><b>{summary.shortlisted}</b><span>Shortlisted</span></div>
                <div className="ref-stat ref-stat--accent"><b>{summary.selected}</b><span>Selected</span></div>
              </div>
            )}

            <div className="admin-filters" style={{ marginTop: 28 }}>
              <input className="admin-search" type="search" style={{ margin: 0 }} placeholder="Search by name, email or phone..."
                value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search applicants" />
              <select className="admin-select" value={openingId} onChange={(e) => setOpeningId(e.target.value)} aria-label="Filter by role">
                <option value="">All roles</option>
                {openings.map((o) => <option key={o._id} value={o._id}>{o.title}</option>)}
              </select>
              <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                <option value="">All statuses</option>
                {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button className="btn btn-ghost" onClick={exportExcel} disabled={exporting}>{exporting ? "Preparing…" : "Export to Excel"}</button>
            </div>

            {loading ? (
              <p style={{ color: "var(--muted)", marginTop: 20 }}>Loading...</p>
            ) : error ? (
              <p className="form-error">{error}</p>
            ) : applications.length === 0 ? (
              <p style={{ color: "var(--muted)", marginTop: 20 }}>{q || status || openingId ? "No applicants match that." : "No applicants yet."}</p>
            ) : (
              <div className="admin-list" style={{ marginTop: 20 }}>
                {applications.map((a) => (
                  <div className="admin-row" key={a._id}>
                    <div className="admin-row-main">
                      <b>{a.user?.name || "—"} <span className={`admin-pill ${STATUS_PILL[a.status] || "read"}`}>{a.statusLabel}</span></b>
                      <span className="admin-row-meta">{a.opening?.title} · {a.user?.email}{a.user?.phone ? ` · ${a.user.phone}` : ""}</span>
                      <span className="admin-row-meta">
                        Payment: {a.paymentStatus === "paid" ? `paid ${ist(a.paidAt)}` : a.paymentStatus === "free" ? "free role" : "pending"}
                        {a.interviewAt ? ` · interview ${ist(a.interviewAt)}` : ""}
                      </span>
                    </div>
                    <div className="admin-row-main" style={{ textAlign: "right" }}>
                      <span>Score: <b>{a.attempt && a.attempt.score != null ? `${a.attempt.score} / ${a.attempt.maxScore}` : "—"}</b></span>
                      <span className="admin-row-meta">
                        {a.attempt ? `${a.attempt.violationCount} violation${a.attempt.violationCount === 1 ? "" : "s"}${a.attempt.status === "in_progress" ? " · test in progress" : ""}` : "Test not taken"}
                      </span>
                    </div>
                    <div className="admin-row-actions">
                      <button className="btn btn-ghost" onClick={() => { setOpenId(a._id); window.scrollTo(0, 0); }}>Review</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
