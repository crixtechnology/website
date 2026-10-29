import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetJobOpenings, adminCreateJobOpening, adminUpdateJobOpening, adminDeleteJobOpening,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";

// Which technical question bank a role's test draws from.
const TECH = [
  ["web", "Web Development"], ["fullstack", "Full Stack Development"], ["datascience", "Data Science"],
  ["frontend", "Frontend (React & JavaScript)"], ["python", "Python Programming"],
  ["webfundamentals", "Web Fundamentals (HTML, CSS, JS, HTTP)"], ["aiml", "AI / Machine Learning"],
];
const COUNT_FIELDS = [["quantitative", "Quantitative"], ["logical", "Logical reasoning"], ["verbal", "Verbal ability"], ["technical", "Technical"]];

const EMPTY_FORM = {
  title: "", summary: "", techCategory: "web", skills: "", responsibilities: "", eligibility: "",
  stipend: "Up to ₹6,000/month (performance based)", experience: "0–1 year (freshers welcome)", duration: "3 months", mode: "Remote / Ahmedabad",
  positions: "", order: "", feeRequired: "yes", durationMinutes: "30", quantitative: "10", logical: "10", verbal: "10", technical: "10",
  marksPerQuestion: "1", negativeMarks: "0.25", cutoffScore: "0",
};

function openingToForm(o) {
  const c = o.test.questionCounts || {};
  return {
    title: o.title || "", summary: o.summary || "", techCategory: o.techCategory || "web",
    skills: (o.skills || []).join(", "),
    responsibilities: (o.responsibilities || []).join("\n"),
    eligibility: (o.eligibility || []).join("\n"),
    stipend: o.stipend || "", experience: o.experience || "", duration: o.duration || "", mode: o.mode || "",
    positions: o.positions ? String(o.positions.total) : "",
    order: String(o.order ?? ""), feeRequired: o.feeRequired === false ? "no" : "yes", durationMinutes: String(o.test.durationMinutes),
    quantitative: String(c.quantitative ?? 0), logical: String(c.logical ?? 0), verbal: String(c.verbal ?? 0), technical: String(c.technical ?? 0),
    marksPerQuestion: String(o.test.marksPerQuestion), negativeMarks: String(o.test.negativeMarks), cutoffScore: String(o.test.cutoffScore ?? 0),
  };
}

const lines = (text) => text.split("\n").map((p) => p.trim()).filter(Boolean);

// "2 of 5 positions filled" — selected applicants fill a role's positions.
function positionsLine(p) {
  if (!p) return "Positions not set";
  return `${p.filled} of ${p.total} position${p.total === 1 ? "" : "s"} filled`;
}

// Every opening (both audiences) and the question-bank sizes, from one request.
// A Careers role has audience "general"; a free internship has "free".
export function useJobOpenings() {
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [openings, setOpenings] = useState([]);
  const [bank, setBank] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Latest logout/navigate without making `load` change identity (and refetch) each render.
  const leave = useRef(null);
  leave.current = () => { logout(); navigate("/admin", { replace: true }); };
  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminGetJobOpenings();
    setLoading(false);
    if (res.ok) { setOpenings(res.openings || []); setBank(res.bank || {}); setError(""); }
    else {
      setError(res.error || "Could not load the job openings.");
      if (!getAdminToken()) leave.current();
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { openings, bank, loading, error, load };
}

// The add/edit form for one opening. `audience` is fixed by where it's used:
// "general" on Job openings (the Careers page), "free" on Courses & Internships
// (the Free Internships page). `editing` is the opening being edited, or null.
// `head` is shown above the fields (e.g. a type picker); `title` is the heading.
export function OpeningForm({ audience, editing, onSaved, onCancel, head = null, title }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const free = audience === "free";
  const editingId = editing ? editing._id : null;
  useEffect(() => { setForm(editing ? openingToForm(editing) : EMPTY_FORM); setError(""); }, [editing]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const what = free ? "free internship" : "role";

  const onSubmit = async (e) => {
    e.preventDefault();
    if (saving) return; // Enter pressed twice, or a slow network
    if (!form.title.trim()) { setError("The title is required."); return; }
    const positions = Number(form.positions);
    if (!Number.isInteger(positions) || positions < 1 || positions > 1000) { setError(`Enter how many positions this ${what} has (1 to 1000).`); return; }
    setSaving(true);
    setError("");
    const payload = {
      title: form.title.trim(), summary: form.summary.trim(), techCategory: form.techCategory,
      skills: form.skills.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
      responsibilities: lines(form.responsibilities), eligibility: lines(form.eligibility),
      stipend: form.stipend.trim(), experience: form.experience.trim(), duration: form.duration.trim(), mode: form.mode.trim(),
      positions,
      ...(form.order.trim() ? { order: Number(form.order) } : {}),
      feeRequired: form.feeRequired === "yes",
      audience,
      durationMinutes: Number(form.durationMinutes),
      questionCounts: Object.fromEntries(COUNT_FIELDS.map(([k]) => [k, Number(form[k])])),
      marksPerQuestion: Number(form.marksPerQuestion), negativeMarks: Number(form.negativeMarks), cutoffScore: Number(form.cutoffScore),
    };
    const res = editingId ? await adminUpdateJobOpening(editingId, payload) : await adminCreateJobOpening(payload);
    setSaving(false);
    if (res.ok) { setForm(EMPTY_FORM); onSaved && onSaved(); }
    else setError(res.error || "Could not save.");
  };

  const totalMarks = COUNT_FIELDS.reduce((sum, [k]) => sum + (Number(form[k]) || 0), 0) * (Number(form.marksPerQuestion) || 0);

  return (
    <form onSubmit={onSubmit} className="admin-form">
      <h3 style={{ margin: "0 0 16px" }}>{title || (editingId ? "Edit opening" : "Add a new opening")}</h3>
      {head}
      <div className="admin-form-grid">
        <div className="field"><label htmlFor="jo-title">Title</label>
          <input id="jo-title" value={form.title} onChange={set("title")} placeholder={free ? "Web Development Intern (Free)" : "Web Development Intern"} /></div>
        <div className="field"><label htmlFor="jo-tech">Technical questions from</label>
          <select id="jo-tech" value={form.techCategory} onChange={set("techCategory")}>
            {TECH.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select></div>
        <div className="field"><label htmlFor="jo-order">Display order</label>
          <input id="jo-order" type="number" min="0" value={form.order} onChange={set("order")} placeholder="Auto (last)" /></div>
      </div>
      <div className="field"><label htmlFor="jo-summary">Short description</label>
        <textarea id="jo-summary" rows="2" value={form.summary} onChange={set("summary")} placeholder="Shown on the card" /></div>
      <div className="field"><label htmlFor="jo-skills">Skills (separate with commas)</label>
        <input id="jo-skills" value={form.skills} onChange={set("skills")} placeholder="HTML, CSS, JavaScript, React basics" /></div>
      <div className="admin-form-grid admin-form-grid--2">
        <div className="field"><label htmlFor="jo-resp">Responsibilities (one per line)</label>
          <textarea id="jo-resp" rows="4" value={form.responsibilities} onChange={set("responsibilities")} /></div>
        <div className="field"><label htmlFor="jo-elig">Eligibility (one per line)</label>
          <textarea id="jo-elig" rows="4" value={form.eligibility} onChange={set("eligibility")} /></div>
      </div>
      <div className="admin-form-grid">
        <div className="field"><label htmlFor="jo-positions">Positions available</label>
          <input id="jo-positions" type="number" min="1" max="1000" step="1" value={form.positions} onChange={set("positions")} placeholder="e.g. 5" />
          <p className="form-note" style={{ margin: "6px 0 0" }}>Each applicant you mark Selected fills one. When all are filled, the {what} shows
            “All positions filled” and takes no new applications.</p></div>
        <div className="field"><label htmlFor="jo-stipend">Stipend</label>
          <input id="jo-stipend" value={form.stipend} onChange={set("stipend")} /></div>
        <div className="field"><label htmlFor="jo-exp">Experience</label>
          <input id="jo-exp" value={form.experience} onChange={set("experience")} /></div>
        <div className="field"><label htmlFor="jo-duration">Duration</label>
          <input id="jo-duration" value={form.duration} onChange={set("duration")} /></div>
        <div className="field"><label htmlFor="jo-mode">Mode</label>
          <input id="jo-mode" value={form.mode} onChange={set("mode")} /></div>
      </div>

      <h3 style={{ margin: "12px 0 16px" }}>Aptitude test for this {what}</h3>
      <div className="admin-form-grid">
        {free ? (
          <div className="field"><label>Fee</label>
            <p className="form-note" style={{ margin: "6px 0 0" }}>Listed on the Free Internships page (/free-internships), CV required. Test processing
              fee from Careers settings (comes back as wallet credit). The quantitative, logical and verbal questions come from the gentler foundation banks.</p></div>
        ) : (
          <div className="field"><label htmlFor="jo-fee">Registration fee</label>
            <select id="jo-fee" value={form.feeRequired} onChange={set("feeRequired")}>
              <option value="yes">Required (amount from Careers settings)</option>
              <option value="no">Free — no fee for this role</option>
            </select></div>
        )}
        <div className="field"><label htmlFor="jo-mins">Duration (minutes)</label>
          <input id="jo-mins" type="number" min="5" max="300" step="1" value={form.durationMinutes} onChange={set("durationMinutes")} /></div>
        {COUNT_FIELDS.map(([k, label]) => (
          <div className="field" key={k}><label htmlFor={`jo-${k}`}>{label} questions</label>
            <input id={`jo-${k}`} type="number" min="0" max="60" step="1" value={form[k]} onChange={set(k)} /></div>
        ))}
        <div className="field"><label htmlFor="jo-marks">Marks per question</label>
          <input id="jo-marks" type="number" min="0.25" step="0.25" value={form.marksPerQuestion} onChange={set("marksPerQuestion")} /></div>
        <div className="field"><label htmlFor="jo-neg">Negative marking (per wrong answer)</label>
          <input id="jo-neg" type="number" min="0" step="0.05" value={form.negativeMarks} onChange={set("negativeMarks")} /></div>
        <div className="field"><label htmlFor="jo-cutoff">Cut-off score</label>
          <input id="jo-cutoff" type="number" min="0" step="0.25" value={form.cutoffScore} onChange={set("cutoffScore")} /></div>
      </div>
      <p className="form-note" style={{ margin: "-4px 0 16px" }}>
        Each candidate gets a random pick from every category, with the options shuffled. This test is out of {totalMarks} marks.
        Changes apply to tests started from now on — a test already under way keeps the rules it started with.
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="admin-actions">
        <button className="btn btn-solid" type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Save changes" : "Create"}</button>
        {editingId && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

// The list of openings, each with its status toggle, Edit and Delete.
export function OpeningList({ openings, bank, onEdit, onChanged, empty }) {
  const [error, setError] = useState("");

  const toggleStatus = async (o) => {
    const res = await adminUpdateJobOpening(o._id, { status: o.status === "open" ? "closed" : "open" });
    if (res.ok) { setError(""); onChanged(); } else setError(res.error || "Could not update the status.");
  };

  const remove = async (o) => {
    if (!window.confirm(`Delete "${o.title}"? This cannot be undone.`)) return;
    const res = await adminDeleteJobOpening(o._id);
    if (res.ok) { setError(""); onChanged(); } else setError(res.error || "Could not delete.");
  };

  // A role that asks for more questions than its banks hold gets a shorter test.
  // Free-internship roles take their general sections from the foundation banks.
  const shortBanks = (o) => {
    const c = o.test.questionCounts || {};
    const general = (k) => (o.audience === "free" && bank[`${k}_foundation`] ? `${k}_foundation` : k);
    const need = [[general("quantitative"), c.quantitative], [general("logical"), c.logical], [general("verbal"), c.verbal], [o.techCategory, c.technical]];
    return need.filter(([cat, n]) => n > (bank[cat] || 0)).map(([cat, n]) => `${cat} (needs ${n}, bank has ${bank[cat] || 0})`);
  };

  if (openings.length === 0) return <p style={{ color: "var(--muted)" }}>{empty}</p>;
  return (
    <>
      {error && <p className="form-error">{error}</p>}
      <div className="admin-list">
        {openings.map((o) => {
          const short = shortBanks(o);
          return (
            <div className="admin-row" key={o._id}>
              <div className="admin-row-main">
                <b>{o.title}</b>
                <span className="admin-row-meta">
                  {o.applicants} applicant{o.applicants === 1 ? "" : "s"} · {o.audience === "free" ? "processing fee" : o.feeRequired === false ? "free" : "fee"} · {o.test.questions} questions in {o.test.durationMinutes} min ·
                  {" "}+{o.test.marksPerQuestion} / −{o.test.negativeMarks} · cut-off {o.test.cutoffScore}
                </span>
                <span className="admin-row-meta" style={o.positions && o.positions.left === 0 ? { color: "var(--amber)" } : !o.positions ? { color: "var(--muted)" } : undefined}>
                  {positionsLine(o.positions)}
                  {o.positions && (o.positions.left === 0 ? " — full, no new applications" : ` · ${o.positions.left} left`)}
                  {!o.positions && " — edit it to add a number"}
                </span>
                {short.length > 0 && (
                  <span className="admin-row-meta" style={{ color: "var(--danger)" }}>
                    Not enough questions in: {short.join(", ")}. Candidates will get fewer until you add more.
                  </span>
                )}
              </div>
              <div className="admin-row-actions">
                <button className={`status-toggle ${o.status === "open" ? "open" : "closed"}`} onClick={() => toggleStatus(o)}
                  title={o.status === "open" ? "Shown on the site and open for applications — click to close" : "Closed: hidden from the site — click to reopen"}>
                  {o.status === "open" ? "Open" : "Closed"}
                </button>
                <button className="btn btn-ghost" onClick={() => onEdit(o)}>Edit</button>
                <button className="btn btn-ghost admin-danger" onClick={() => remove(o)}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// The roles on the public Careers page — add, edit, or close — and each role's
// aptitude-test settings (length, questions per category, marking, cut-off).
// Free internships are managed on Courses & Internships instead.
export default function AdminJobOpenings() {
  usePageMeta({ title: "Job openings | Crix Technology" });
  const navigate = useNavigate();
  const { openings, bank, loading, error, load } = useJobOpenings();
  const [editing, setEditing] = useState(null);
  const roles = openings.filter((o) => o.audience !== "free");

  const startEdit = (o) => { setEditing(o); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Job openings</h1>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
              The roles on the public Careers page, and each role's aptitude test. Free internships are on{" "}
              <button type="button" className="link-btn" onClick={() => navigate("/admin/courses?type=free")}>Courses &amp; Internships</button>.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <OpeningForm audience="general" editing={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)}
          title={editing ? "Edit role" : "Add a new Careers role"} />

        {error && <p className="form-error" style={{ marginTop: 24 }}>{error}</p>}
        <div style={{ marginTop: 32 }}>
          {loading
            ? <p style={{ color: "var(--muted)" }}>Loading...</p>
            : <OpeningList openings={roles} bank={bank} onEdit={startEdit} onChanged={load} empty="No Careers roles yet — add one above." />}
        </div>
      </div>
    </section>
  );
}
