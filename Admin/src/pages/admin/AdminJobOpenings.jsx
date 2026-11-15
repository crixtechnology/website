import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetJobOpenings, adminCreateJobOpening, adminUpdateJobOpening, adminDeleteJobOpening,
  adminGetCareerSettings, adminUpdateCareerSettings,
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
  startsOn: "", group: "", positions: "", order: "", durationMinutes: "30", quantitative: "10", logical: "10", verbal: "10", technical: "10",
  marksPerQuestion: "1", cutoffScore: "0",
};

function openingToForm(o) {
  const c = o.test.questionCounts || {};
  return {
    title: o.title || "", summary: o.summary || "", techCategory: o.techCategory || "web",
    skills: (o.skills || []).join(", "),
    responsibilities: (o.responsibilities || []).join("\n"),
    eligibility: (o.eligibility || []).join("\n"),
    stipend: o.stipend || "", experience: o.experience || "", duration: o.duration || "", mode: o.mode || "",
    startsOn: o.startsOn || "", group: o.group || "",
    positions: o.positions ? String(o.positions.total) : "",
    order: String(o.order ?? ""), durationMinutes: String(o.test.durationMinutes),
    quantitative: String(c.quantitative ?? 0), logical: String(c.logical ?? 0), verbal: String(c.verbal ?? 0), technical: String(c.technical ?? 0),
    marksPerQuestion: String(o.test.marksPerQuestion), cutoffScore: String(o.test.cutoffScore ?? 0),
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

// The application form "Apply Now" opens on the Free Internships page, edited
// right where free internships are managed (Training + Internship → Free
// internships). One link for every free internship; saved on its own.
export function FreeApplyFormLink() {
  const [link, setLink] = useState("");
  const [saved, setSaved] = useState(null); // the stored link, once loaded
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  useEffect(() => {
    let alive = true;
    Promise.resolve(adminGetCareerSettings()).then((res) => {
      if (!alive) return;
      if (res && res.ok) { setSaved(res.settings.freeApplyFormUrl || ""); setLink(res.settings.freeApplyFormUrl || ""); }
      else setMsg({ kind: "error", text: (res && res.error) || "Could not load the application form link." });
    });
    return () => { alive = false; };
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (busy || saved === null) return;
    const next = link.trim();
    if (!/^https:\/\/\S+$/.test(next)) { setMsg({ kind: "error", text: "Paste the full form link, starting with https://" }); return; }
    setBusy(true);
    const res = await adminUpdateCareerSettings({ freeApplyFormUrl: next });
    setBusy(false);
    if (res && res.ok) {
      const stored = (res.settings && res.settings.freeApplyFormUrl) || next;
      setSaved(stored); setLink(stored);
      setMsg({ kind: "ok", text: "Saved — Apply Now on every free internship now opens this form." });
    } else setMsg({ kind: "error", text: (res && res.error) || "Could not save the link." });
  };

  return (
    <form className="admin-form form-link-editor" onSubmit={save} noValidate>
      <div className="field" style={{ marginBottom: 0 }}><label htmlFor="free-form-link">Application form link (Google Form)</label>
        <div className="form-link-row">
          <input id="free-form-link" type="url" inputMode="url" maxLength={500} placeholder="https://forms.gle/..." value={link} disabled={saved === null}
            onChange={(e) => { setLink(e.target.value); setMsg({ kind: "", text: "" }); }} />
          <button type="submit" className="btn btn-solid" disabled={busy || saved === null || link.trim() === saved}>{busy ? "Saving..." : "Save link"}</button>
          {saved && <a className="btn btn-ghost" href={saved} target="_blank" rel="noopener noreferrer">Open form ↗</a>}
        </div>
        <p className={msg.kind === "error" ? "form-error" : msg.kind === "ok" ? "ref-ok" : "form-note"} role="status" style={{ margin: "8px 0 0" }}>
          {msg.text || "“Apply Now” on every free internship opens this form in a new tab. Applications arrive in the form's responses (Google Forms / its Sheet), not under Applicants."}
        </p>
      </div>
    </form>
  );
}

// The add/edit form for one opening. `audience` is fixed by where it's used:
// "general" on Job openings (the Careers page), "free" on Training + Internship
// (the Free Internships page). `editing` is the opening being edited, or null.
// `head` is shown above the fields (e.g. a type picker); `title` is the heading.
// groupNames: the free internships' groups already in use, suggested in the Group box.
// copyFrom: an opening whose details fill the form as a NEW one (the list's
// Copy button) — the same role in another duration or batch then only needs
// what differs changed before Create. Its display order is left to "last".
// cancelable: always offer Cancel (the form is opened from an Add button and
// closes again), not only while editing or copying.
export function OpeningForm({ audience, editing, copyFrom = null, onSaved, onCancel, head = null, title, groupNames = [], cancelable = false }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const free = audience === "free";
  const editingId = editing ? editing._id : null;
  useEffect(() => {
    setForm(editing ? openingToForm(editing) : copyFrom ? { ...openingToForm(copyFrom), order: "" } : EMPTY_FORM);
    setError("");
  }, [editing, copyFrom]);

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
    // A free internship is applied for through the Google Form and has no
    // on-site test, so its form has no test settings and sends none.
    const testSettings = free ? {} : {
      techCategory: form.techCategory,
      durationMinutes: Number(form.durationMinutes),
      questionCounts: Object.fromEntries(COUNT_FIELDS.map(([k]) => [k, Number(form[k])])),
      marksPerQuestion: Number(form.marksPerQuestion), cutoffScore: Number(form.cutoffScore),
    };
    const payload = {
      title: form.title.trim(), summary: form.summary.trim(),
      skills: form.skills.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
      responsibilities: lines(form.responsibilities), eligibility: lines(form.eligibility),
      stipend: form.stipend.trim(), experience: form.experience.trim(), duration: form.duration.trim(), mode: form.mode.trim(),
      startsOn: form.startsOn.trim(),
      // Only free internships are grouped into one card with a duration switch.
      ...(free ? { group: form.group.trim() } : {}),
      positions,
      // No Display order box any more: an edited role keeps the place it had, a new one goes last.
      ...(form.order.trim() ? { order: Number(form.order) } : {}),
      audience,
      ...testSettings,
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
      {!editingId && copyFrom && (
        <p className="form-note copy-note" style={{ margin: "0 0 16px" }}>
          Filled in from <b>{copyFrom.title}</b>. Change what differs — usually the title, duration and start — then press Create.
          This adds a new {what}; the original stays as it is.
        </p>
      )}
      <div className="admin-form-grid">
        <div className="field"><label htmlFor="jo-title">Title</label>
          <input id="jo-title" value={form.title} onChange={set("title")} placeholder={free ? "Web Development Intern (Free)" : "Web Development Intern"} /></div>
        {!free && (
          <div className="field"><label htmlFor="jo-tech">Technical questions from</label>
            <select id="jo-tech" value={form.techCategory} onChange={set("techCategory")}>
              {TECH.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select></div>
        )}
        {free && (
          <div className="field"><label htmlFor="jo-group">Domain group (optional)</label>
            <input id="jo-group" list="jo-group-list" maxLength={60} value={form.group} onChange={set("group")} placeholder="e.g. Frontend (React.js)" />
            <datalist id="jo-group-list">{groupNames.map((g) => <option key={g} value={g} />)}</datalist>
            <p className="form-note" style={{ margin: "6px 0 0" }}>Roles of one domain in several durations (e.g. 3 and 6 months) share a group: the page shows them as one card with a duration switch.</p></div>
        )}
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
          <p className="form-note" style={{ margin: "6px 0 0" }}>{free
            ? "Shown on the card as the number of positions open. Applications come through the Google Form, so close the role here once it is full."
            : "Each applicant you mark Selected fills one. When all are filled, the role shows “All positions filled” and takes no new applications."}</p></div>
        <div className="field"><label htmlFor="jo-stipend">Stipend</label>
          <input id="jo-stipend" value={form.stipend} onChange={set("stipend")} /></div>
        <div className="field"><label htmlFor="jo-exp">Experience</label>
          <input id="jo-exp" value={form.experience} onChange={set("experience")} /></div>
        <div className="field"><label htmlFor="jo-duration">Duration</label>
          <input id="jo-duration" value={form.duration} onChange={set("duration")} /></div>
        <div className="field"><label htmlFor="jo-mode">Mode</label>
          <input id="jo-mode" value={form.mode} onChange={set("mode")} /></div>
        <div className="field"><label htmlFor="jo-starts-on">Starts on (optional)</label>
          <input id="jo-starts-on" maxLength={60} value={form.startsOn} onChange={set("startsOn")} placeholder="e.g. 2nd week of January" />
          <p className="form-note" style={{ margin: "6px 0 0" }}>Roughly when it starts — an estimate shown on the card. Leave empty to show nothing.</p></div>
      </div>

      {free ? (
        <p className="form-note" style={{ margin: "4px 0 16px" }}>
          No test settings here: people apply through the Google Form (its link is under “Free internships” below), and your team
          invites them to the aptitude test and interview.
        </p>
      ) : (<>
      <h3 style={{ margin: "12px 0 16px" }}>Aptitude test for this role</h3>
      <div className="admin-form-grid">
        <div className="field"><label htmlFor="jo-mins">Duration (minutes)</label>
          <input id="jo-mins" type="number" min="5" max="300" step="1" value={form.durationMinutes} onChange={set("durationMinutes")} /></div>
        {COUNT_FIELDS.map(([k, label]) => (
          <div className="field" key={k}><label htmlFor={`jo-${k}`}>{label} questions</label>
            <input id={`jo-${k}`} type="number" min="0" max="60" step="1" value={form[k]} onChange={set(k)} /></div>
        ))}
        <div className="field"><label htmlFor="jo-marks">Marks per question</label>
          <input id="jo-marks" type="number" min="0.25" step="0.25" value={form.marksPerQuestion} onChange={set("marksPerQuestion")} /></div>
        <div className="field"><label htmlFor="jo-cutoff">Cut-off score</label>
          <input id="jo-cutoff" type="number" min="0" step="0.25" value={form.cutoffScore} onChange={set("cutoffScore")} /></div>
      </div>
      <p className="form-note" style={{ margin: "-4px 0 16px" }}>
        Each candidate gets a random pick from every category, with the options shuffled. This test is out of {totalMarks} marks.
        Changes apply to tests started from now on — a test already under way keeps the rules it started with.
      </p>
      </>)}
      {error && <p className="form-error">{error}</p>}
      <div className="admin-actions">
        <button className="btn btn-solid" type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Save changes" : "Create"}</button>
        {(editingId || copyFrom || cancelable) && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

// The list of openings, each with its status toggle, Edit, Copy and Delete.
// onCopy(opening) starts a new opening from that one's details (see OpeningForm).
export function OpeningList({ openings, bank, onEdit, onCopy, onChanged, empty }) {
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
  const shortBanks = (o) => {
    const c = o.test.questionCounts || {};
    if (o.audience === "free") return []; // no on-site test: applied for through the Google Form
    const general = (k) => k;
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
                {(o.group || o.duration) && (
                  <span className="admin-row-meta">{[o.group && `group: ${o.group}`, o.duration].filter(Boolean).join(" · ")}</span>
                )}
                <span className="admin-row-meta">
                  {o.audience === "free"
                    ? "free to apply · applies through the Google Form"
                    : <>{o.applicants} applicant{o.applicants === 1 ? "" : "s"} · free to apply · {o.test.questions} questions in {o.test.durationMinutes} min ·
                      {" "}+{o.test.marksPerQuestion} each · cut-off {o.test.cutoffScore}</>}
                </span>
                {o.audience === "free" ? (
                  <span className="admin-row-meta" style={o.positions ? undefined : { color: "var(--muted)" }}>
                    {o.positions ? `${o.positions.total} position${o.positions.total === 1 ? "" : "s"}` : "Positions not set — edit it to add a number"}
                  </span>
                ) : (
                <span className="admin-row-meta" style={o.positions && o.positions.left === 0 ? { color: "var(--amber)" } : !o.positions ? { color: "var(--muted)" } : undefined}>
                  {positionsLine(o.positions)}
                  {o.positions && (o.positions.left === 0 ? " — full, no new applications" : ` · ${o.positions.left} left`)}
                  {!o.positions && " — edit it to add a number"}
                </span>
                )}
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
                {onCopy && <button className="btn btn-ghost" onClick={() => onCopy(o)} title="Start a new one with these details — for another duration or batch">Copy</button>}
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
// Free internships are managed on Training + Internship instead.
export default function AdminJobOpenings() {
  usePageMeta({ title: "Job openings | Crix Technology" });
  const navigate = useNavigate();
  const { openings, bank, loading, error, load } = useJobOpenings();
  const [editing, setEditing] = useState(null);
  const [copying, setCopying] = useState(null); // the role the form was filled from by Copy
  // The long form stays shut until it's needed (Add, Edit or Copy), so the
  // roles are the first thing on the page instead of a screen's scroll away.
  const [formOpen, setFormOpen] = useState(false);
  const [q, setQ] = useState("");
  const allRoles = openings.filter((o) => o.audience !== "free");
  const needle = q.trim().toLowerCase();
  const roles = needle
    ? allRoles.filter((o) => [o.title, o.duration, ...(o.skills || [])].some((v) => String(v || "").toLowerCase().includes(needle)))
    : allRoles;

  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const startEdit = (o) => { setCopying(null); setEditing(o); setFormOpen(true); toTop(); };
  const startCopy = (o) => { setEditing(null); setCopying(o); setFormOpen(true); toTop(); };
  const clearForm = () => { setEditing(null); setCopying(null); setFormOpen(false); };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Job openings</h1>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
              The roles on the public Careers page, and each role's aptitude test. Free internships are on{" "}
              <button type="button" className="link-btn" onClick={() => navigate("/admin/courses?type=free")}>Training + Internship</button>.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        {formOpen ? (
          <OpeningForm audience="general" editing={editing} copyFrom={copying} cancelable onSaved={() => { clearForm(); load(); }} onCancel={clearForm}
            title={editing ? "Edit role" : copying ? "Add a copy of a Careers role" : "Add a new Careers role"} />
        ) : (
          <div className="list-toolbar">
            <button type="button" className="btn btn-solid" onClick={() => setFormOpen(true)}>+ Add a Careers role</button>
            <input className="admin-search" type="search" aria-label="Search roles by title, skill or duration"
              placeholder="Search roles by title, skill or duration..." value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="list-count">{needle ? `${roles.length} of ${allRoles.length}` : allRoles.length} role{allRoles.length === 1 ? "" : "s"}</span>
          </div>
        )}

        {error && <p className="form-error" style={{ marginTop: 24 }}>{error}</p>}
        <div style={{ marginTop: formOpen ? 32 : 0 }}>
          {loading
            ? <p style={{ color: "var(--muted)" }}>Loading...</p>
            : <OpeningList openings={roles} bank={bank} onEdit={startEdit} onCopy={startCopy} onChanged={load}
                empty={needle ? "No roles match that search." : "No Careers roles yet — press Add a Careers role."} />}
        </div>
      </div>
    </section>
  );
}
