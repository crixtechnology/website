import { useContext, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetTestQuestions, adminCreateTestQuestion, adminUpdateTestQuestion, adminDeleteTestQuestion, adminImportTestQuestions,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { useDebouncedLoad } from "../../hooks/useDebouncedLoad.js";

const CATEGORIES = [
  ["quantitative", "Quantitative"], ["logical", "Logical Reasoning"], ["verbal", "Verbal Ability"],
  ["quantitative_foundation", "Quantitative (foundation)"], ["logical_foundation", "Logical Reasoning (foundation)"],
  ["verbal_foundation", "Verbal Ability (foundation)"],
  ["web", "Web Development"], ["fullstack", "Full Stack Development"], ["datascience", "Data Science"],
  ["frontend", "Frontend (React & JavaScript)"], ["python", "Python Programming"],
  ["webfundamentals", "Web Fundamentals (HTML, CSS, JS, HTTP)"], ["aiml", "AI / Machine Learning"],
];
const EMPTY_FORM = { category: "quantitative", text: "", options: ["", "", "", ""], correctIndex: 0 };
const MAX_OPTIONS = 6;

// The file layout the bulk upload reads, as a CSV the admin can open in Excel.
const TEMPLATE = [
  "category,question,option1,option2,option3,option4,correct",
  'quantitative,"What is 15% of 200?",20,25,30,35,3',
  'logical,"Find the next number: 2, 4, 8, 16, ?",24,30,32,36,C',
  "web,Which tag creates a hyperlink?,<a>,<link>,<href>,<url>,1",
].join("\r\n");

// The aptitude test's question bank: add, edit, switch off or delete questions,
// filter them, and upload many at once from Excel or CSV. The correct answer is
// only ever shown here — it is never sent to a candidate's browser.
export default function AdminTestQuestions() {
  usePageMeta({ title: "Question bank | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [questions, setQuestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [bank, setBank] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [active, setActive] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [upload, setUpload] = useState({ busy: false, result: null });
  const fileRef = useRef(null);

  const filters = { q, category, active };
  const load = async (f) => {
    setLoading(true);
    const res = await adminGetTestQuestions(f);
    setLoading(false);
    if (res.ok) { setQuestions(res.questions || []); setTotal(res.total || 0); setBank(res.bank || {}); setError(""); }
    else {
      setError(res.error || "Could not load the question bank.");
      if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
    }
  };
  // Keyed on all three, so a keystroke or a filter change reloads once.
  useDebouncedLoad((key) => load(JSON.parse(key)), JSON.stringify(filters));

  const startEdit = (question) => {
    setEditingId(question._id);
    setForm({ category: question.category, text: question.text, options: [...question.options], correctIndex: question.correctIndex });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); };
  const setOption = (i, value) => setForm((f) => ({ ...f, options: f.options.map((o, n) => (n === i ? value : o)) }));
  const addOption = () => setForm((f) => (f.options.length < MAX_OPTIONS ? { ...f, options: [...f.options, ""] } : f));
  const removeOption = (i) => setForm((f) => ({
    ...f,
    options: f.options.filter((_, n) => n !== i),
    // Keep pointing at the same answer when an option above it goes.
    correctIndex: f.correctIndex === i ? 0 : f.correctIndex > i ? f.correctIndex - 1 : f.correctIndex,
  }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const options = form.options.map((o) => o.trim());
    if (!form.text.trim()) { setError("Type the question."); return; }
    if (options.some((o) => !o)) { setError("Fill in every option, or remove the empty ones."); return; }
    setSaving(true);
    setError("");
    const payload = { category: form.category, text: form.text.trim(), options, correctIndex: form.correctIndex };
    const res = editingId ? await adminUpdateTestQuestion(editingId, payload) : await adminCreateTestQuestion(payload);
    setSaving(false);
    if (res.ok) {
      // Stay in the same category for the next one: questions are usually added in runs.
      setEditingId(null);
      setForm({ ...EMPTY_FORM, category: form.category });
      load(filters);
    } else setError(res.error || "Could not save.");
  };

  const toggleActive = async (question) => {
    const res = await adminUpdateTestQuestion(question._id, { active: !question.active });
    if (res.ok) load(filters); else setError(res.error || "Could not update the question.");
  };

  const remove = async (question) => {
    if (!window.confirm("Delete this question? Tests already taken keep their own copy of it.")) return;
    const res = await adminDeleteTestQuestion(question._id);
    if (res.ok) load(filters); else setError(res.error || "Could not delete.");
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || upload.busy) return;
    setUpload({ busy: true, result: null });
    const res = await adminImportTestQuestions(file);
    setUpload({ busy: false, result: res });
    if (fileRef.current) fileRef.current.value = "";
    if (res.created) load(filters);
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "crix-question-template.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const filtered = !!(q || category || active);

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Question bank</h1>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>The questions the aptitude test draws from. Each candidate gets a random pick, with the options shuffled.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <div className="ref-stats ref-stats--admin" style={{ marginBottom: 28 }}>
          {CATEGORIES.map(([key, label]) => (
            <div className="ref-stat" key={key}><b>{bank[key] ?? 0}</b><span>{label}</span></div>
          ))}
        </div>

        <form onSubmit={onSubmit} className="admin-form">
          <h3 style={{ margin: "0 0 16px" }}>{editingId ? "Edit question" : "Add a question"}</h3>
          <div className="admin-form-grid">
            <div className="field"><label htmlFor="tq-category">Category</label>
              <select id="tq-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select></div>
          </div>
          <div className="field"><label htmlFor="tq-text">Question</label>
            <textarea id="tq-text" rows="3" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></div>
          <fieldset className="question-options">
            <legend>Options — select the correct one</legend>
            {form.options.map((option, i) => (
              <div className="question-option" key={i}>
                <input type="radio" name="tq-correct" checked={form.correctIndex === i} onChange={() => setForm({ ...form, correctIndex: i })}
                  aria-label={`Option ${i + 1} is the correct answer`} />
                <input value={option} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} />
                {form.options.length > 2 && (
                  <button type="button" className="btn btn-ghost admin-danger" onClick={() => removeOption(i)} aria-label={`Remove option ${i + 1}`}>✕</button>
                )}
              </div>
            ))}
            {form.options.length < MAX_OPTIONS && <button type="button" className="link-btn" onClick={addOption}>+ Add another option</button>}
          </fieldset>
          {error && <p className="form-error">{error}</p>}
          <div className="admin-actions">
            <button className="btn btn-solid" type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Save changes" : "Add question"}</button>
            {editingId && <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>

        <div className="admin-form" style={{ marginTop: 24 }}>
          <h3 style={{ margin: "0 0 10px" }}>Bulk upload from Excel or CSV</h3>
          <p className="form-note" style={{ margin: "0 0 14px" }}>
            First row: <b>category, question, option1, option2, option3, option4, correct</b> (up to option6). Category can be
            quantitative, logical, verbal (or quantitative_foundation, logical_foundation, verbal_foundation — used by
            free-internship roles), web, fullstack, datascience, frontend, python, webfundamentals or aiml. Correct is the option's number (1–6), its letter (A–F), or its exact text.
          </p>
          <div className="admin-actions">
            <label className="btn btn-solid" style={{ cursor: upload.busy ? "wait" : "pointer" }}>
              {upload.busy ? "Uploading…" : "Choose a file (.xlsx or .csv)"}
              <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={onFile} disabled={upload.busy} style={{ display: "none" }} />
            </label>
            <button type="button" className="btn btn-ghost" onClick={downloadTemplate}>Download a template</button>
          </div>
          {upload.result && (
            <div role="status" style={{ marginTop: 14 }}>
              {upload.result.created > 0 && <p className="ref-ok">{upload.result.created} question{upload.result.created === 1 ? "" : "s"} added.</p>}
              {upload.result.error && <p className="form-error">{upload.result.error}</p>}
              {upload.result.errors && upload.result.errors.length > 0 && (
                <ul className="dash-list">
                  {upload.result.errors.map((er) => <li key={er.row}>Row {er.row}: {er.error}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="admin-filters" style={{ marginTop: 40 }}>
          <input className="admin-search" type="search" style={{ margin: 0 }} placeholder="Search the question text..."
            value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search questions" />
          <select className="admin-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {CATEGORIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <select className="admin-select" value={active} onChange={(e) => setActive(e.target.value)} aria-label="Filter by in use">
            <option value="">In use and switched off</option>
            <option value="true">In use</option>
            <option value="false">Switched off</option>
          </select>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)", marginTop: 20 }}>Loading...</p>
        ) : questions.length === 0 ? (
          <p style={{ color: "var(--muted)", marginTop: 20 }}>{filtered ? "No questions match that." : "No questions yet — add one above, or upload a file."}</p>
        ) : (
          <>
            <p className="form-note" style={{ marginTop: 16 }}>Showing {questions.length} of {total}.</p>
            <div className="admin-list">
              {questions.map((question) => (
                <div className="admin-row" key={question._id}>
                  <div className="admin-row-main">
                    <b style={{ whiteSpace: "pre-wrap" }}>
                      <span className="admin-pill new">{question.categoryLabel}</span>{" "}
                      {!question.active && <span className="admin-pill read">switched off</span>}{" "}
                      {question.text}
                    </b>
                    <span className="admin-row-meta">
                      {question.options.map((o, i) => (
                        <span key={i} className={i === question.correctIndex ? "question-answer" : undefined}>
                          {String.fromCharCode(65 + i)}. {o}{i === question.correctIndex ? " ✓" : ""}{i < question.options.length - 1 ? "  ·  " : ""}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="admin-row-actions">
                    <button className={`status-toggle ${question.active ? "open" : "closed"}`} onClick={() => toggleActive(question)}
                      title={question.active ? "Used in tests — click to switch off" : "Not used in tests — click to switch on"}>
                      {question.active ? "In use" : "Off"}
                    </button>
                    <button className="btn btn-ghost" onClick={() => startEdit(question)}>Edit</button>
                    <button className="btn btn-ghost admin-danger" onClick={() => remove(question)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
