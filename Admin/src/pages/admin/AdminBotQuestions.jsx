import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetBotQuestions, adminUpdateBotQuestion, adminDeleteBotQuestion,
  adminAnswerBotQuestion, adminAddBotAnswer, adminRemoveBotAnswer,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";

const FILTERS = [
  ["open", "To review"],
  ["answered", "Taught answers"],
  ["handled", "Handled"],
  ["all", "All"],
];

// Pages a taught answer may link to (the server accepts only in-site paths).
const PAGES = [
  ["", "No link"],
  ["/programs", "Internships & Courses"],
  ["/careers", "Careers"],
  ["/services", "IT Services"],
  ["/contact", "Contact"],
  ["/about", "About"],
  ["/dashboard", "My Dashboard"],
  ["/profile", "Profile"],
  ["/terms-of-service", "Terms of Service"],
  ["/privacy-policy", "Privacy Policy"],
];
const DEPTS = [
  ["", "No phone card"],
  ["programs", "Internships & Courses number"],
  ["it", "IT Services number"],
  ["both", "Both numbers"],
];
const EMPTY = { question: "", answer: "", keywords: "", linkTo: "", linkLabel: "", dept: "" };

// One answer form — for a visitor's question (`item`) or a brand-new one.
function AnswerForm({ item, onSaved, onCancel }) {
  const [form, setForm] = useState(item
    ? { question: item.question, answer: item.answer || "", keywords: item.keywords || "", linkTo: item.linkTo || "", linkLabel: item.linkLabel || "", dept: item.dept || "" }
    : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setError(""); };

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!item && form.question.trim().length < 3) { setError("Write the question."); return; }
    if (!form.answer.trim()) { setError("Write the answer the help agent should give."); return; }
    setSaving(true);
    const payload = { answer: form.answer, keywords: form.keywords, linkTo: form.linkTo, linkLabel: form.linkLabel, dept: form.dept };
    const res = item ? await adminAnswerBotQuestion(item._id, payload) : await adminAddBotAnswer({ question: form.question, ...payload });
    setSaving(false);
    if (res.ok) onSaved(); else setError(res.error || "Could not save the answer.");
  };

  return (
    <form className="admin-form bot-answer-form" onSubmit={save}>
      {!item && (
        <div className="field"><label htmlFor="ba-q">Question visitors ask</label>
          <input id="ba-q" value={form.question} onChange={set("question")} placeholder="e.g. Is there a weekend batch?" maxLength={120} /></div>
      )}
      <div className="field"><label htmlFor={`ba-a-${item?._id || "new"}`}>Answer the help agent gives</label>
        <textarea id={`ba-a-${item?._id || "new"}`} rows="3" value={form.answer} onChange={set("answer")} maxLength={1500}
          placeholder={"Plain sentences. Start a line with “• ” for a bullet point."} /></div>
      <div className="field"><label htmlFor={`ba-k-${item?._id || "new"}`}>Other words that should find it (optional)</label>
        <input id={`ba-k-${item?._id || "new"}`} value={form.keywords} onChange={set("keywords")} maxLength={300} placeholder="saturday sunday weekend batch" /></div>
      <div className="admin-form-grid">
        <div className="field"><label htmlFor={`ba-l-${item?._id || "new"}`}>Link to a page</label>
          <select id={`ba-l-${item?._id || "new"}`} value={form.linkTo} onChange={set("linkTo")}>
            {PAGES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select></div>
        {form.linkTo && (
          <div className="field"><label htmlFor={`ba-ll-${item?._id || "new"}`}>Link text</label>
            <input id={`ba-ll-${item?._id || "new"}`} value={form.linkLabel} onChange={set("linkLabel")} maxLength={60} placeholder="Read more" /></div>
        )}
        <div className="field"><label htmlFor={`ba-d-${item?._id || "new"}`}>Show a team's phone number</label>
          <select id={`ba-d-${item?._id || "new"}`} value={form.dept} onChange={set("dept")}>
            {DEPTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select></div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="admin-actions">
        <button className="btn btn-solid" type="submit" disabled={saving}>{saving ? "Saving..." : "Save answer"}</button>
        <button className="btn btn-ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// Questions visitors typed into the site's help agent that it had no answer for
// (routes/botQuestions.js), most asked first. An admin can teach the agent an
// answer right here — it starts using it straight away, no code change needed.
// Emails, phone numbers and links are masked when saved; no names or accounts are kept.
export default function AdminBotQuestions() {
  usePageMeta({ title: "Help Agent Questions | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [questions, setQuestions] = useState([]);
  const [summary, setSummary] = useState({ open: 0, handled: 0, answered: 0 });
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // question id, "new", or null

  const load = async (query, filter) => {
    setLoading(true);
    const res = await adminGetBotQuestions({ status: filter, q: query });
    setLoading(false);
    if (res.ok) {
      setQuestions(res.questions || []);
      setSummary({ answered: 0, ...(res.summary || { open: 0, handled: 0 }) });
      setError("");
    } else {
      setError(res.error || "Could not load the questions.");
      if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
    }
  };

  // Loads on arrival, and again (debounced while typing) when the search or filter changes.
  useEffect(() => {
    const t = setTimeout(() => load(q, status), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, status]);

  const saved = () => { setEditing(null); load(q, status); };

  const toggleHandled = async (item) => {
    const res = await adminUpdateBotQuestion(item._id, !item.handled);
    if (res.ok) load(q, status); else setError(res.error || "Could not update the question.");
  };

  const unteach = async (item) => {
    if (!window.confirm(`Stop giving the taught answer to "${item.question}"?`)) return;
    const res = await adminRemoveBotAnswer(item._id);
    if (res.ok) load(q, status); else setError(res.error || "Could not remove the answer.");
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.question}"? This cannot be undone.`)) return;
    const res = await adminDeleteBotQuestion(item._id);
    if (res.ok) load(q, status); else setError(res.error || "Could not delete.");
  };

  const count = (value) => (value === "open" ? ` (${summary.open})` : value === "handled" ? ` (${summary.handled})` : value === "answered" ? ` (${summary.answered})` : "");

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Help agent questions</h1>
            <p style={{ color: "var(--muted)", margin: "6px 0 0", maxWidth: 600 }}>
              Questions visitors asked that the help agent couldn't answer, most asked first. Press “Teach answer” and the agent starts
              giving it straight away — to that question and to similar ones. Asking a handled question again reopens it.
            </p>
          </div>
          <div className="admin-actions">
            <button className="btn btn-solid" onClick={() => setEditing(editing === "new" ? null : "new")}>+ Add an answer</button>
            <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
          </div>
        </div>

        {editing === "new" && <AnswerForm onSaved={saved} onCancel={() => setEditing(null)} />}

        <div className="program-filter" role="group" aria-label="Show" style={{ marginBottom: 14 }}>
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" className={`btn ${status === value ? "btn-solid" : "btn-ghost"}`} aria-pressed={status === value} onClick={() => setStatus(value)}>
              {label}{count(value)}
            </button>
          ))}
        </div>

        <input className="admin-search" type="search" placeholder="Search the questions..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the questions" />

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : questions.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            {q ? "No questions match that search." : status === "open" ? "Nothing to review — the bot has answered everything so far." : "Nothing here yet."}
          </p>
        ) : (
          <div className="admin-list">
            {questions.map((item) => (
              <div className="admin-row bot-q-row" key={item._id}>
                <div className="admin-row-main">
                  <b style={{ overflowWrap: "anywhere" }}>
                    {item.question} {item.answer && <span className="admin-pill lifetime">taught</span>}
                  </b>
                  <span className="admin-row-meta">
                    {item.timesAsked ? `Asked ${item.timesAsked} ${item.timesAsked === 1 ? "time" : "times"} · last ${new Date(item.lastAskedAt).toLocaleString("en-IN")}` : "Added by an admin"}
                    {item.handled ? " · handled" : ""}
                  </span>
                  {item.answer && editing !== item._id && <span className="bot-q-answer">{item.answer}</span>}
                </div>
                <div className="admin-row-actions">
                  <button className="btn btn-solid" onClick={() => setEditing(editing === item._id ? null : item._id)}>{item.answer ? "Edit answer" : "Teach answer"}</button>
                  {item.answer
                    ? <button className="btn btn-ghost" onClick={() => unteach(item)}>Remove answer</button>
                    : <button className="btn btn-ghost" onClick={() => toggleHandled(item)}>{item.handled ? "Reopen" : "Mark handled"}</button>}
                  <button className="btn btn-ghost admin-danger" onClick={() => remove(item)}>Delete</button>
                </div>
                {editing === item._id && <AnswerForm item={item} onSaved={saved} onCancel={() => setEditing(null)} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
