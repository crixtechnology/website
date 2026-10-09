import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminToken, adminGetBotQuestions, adminUpdateBotQuestion, adminDeleteBotQuestion } from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";

const FILTERS = [
  ["open", "To review"],
  ["handled", "Handled"],
  ["all", "All"],
];

// Questions visitors typed into the site's help bot that it had no answer for
// (routes/botQuestions.js). Most-asked first, so the top of the list is what to
// add to the bot next (Frontend/src/data/faqData.js). Emails, phone numbers and
// links are already masked when they are saved; no names or accounts are kept.
export default function AdminBotQuestions() {
  usePageMeta({ title: "Help Bot Questions | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [questions, setQuestions] = useState([]);
  const [summary, setSummary] = useState({ open: 0, handled: 0 });
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (query, filter) => {
    setLoading(true);
    const res = await adminGetBotQuestions({ status: filter, q: query });
    setLoading(false);
    if (res.ok) {
      setQuestions(res.questions || []);
      setSummary(res.summary || { open: 0, handled: 0 });
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

  const toggleHandled = async (item) => {
    const res = await adminUpdateBotQuestion(item._id, !item.handled);
    if (res.ok) load(q, status); else setError(res.error || "Could not update the question.");
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.question}"? This cannot be undone.`)) return;
    const res = await adminDeleteBotQuestion(item._id);
    if (res.ok) load(q, status); else setError(res.error || "Could not delete.");
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Help bot questions</h1>
            <p style={{ color: "var(--muted)", margin: "6px 0 0", maxWidth: 560 }}>
              Questions visitors asked that the bot couldn't answer, most asked first. Add the common ones to the bot, then mark them handled. Asking a handled question again reopens it.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <div className="program-filter" role="group" aria-label="Show" style={{ marginBottom: 14 }}>
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" className={`btn ${status === value ? "btn-solid" : "btn-ghost"}`} aria-pressed={status === value} onClick={() => setStatus(value)}>
              {label}{value === "open" ? ` (${summary.open})` : value === "handled" ? ` (${summary.handled})` : ""}
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
              <div className="admin-row" key={item._id}>
                <div className="admin-row-main">
                  <b style={{ overflowWrap: "anywhere" }}>{item.question}</b>
                  <span className="admin-row-meta">
                    Asked {item.timesAsked} {item.timesAsked === 1 ? "time" : "times"} · last {new Date(item.lastAskedAt).toLocaleString("en-IN")}
                    {item.handled ? " · handled" : ""}
                  </span>
                </div>
                <div className="admin-row-actions">
                  <button className="btn btn-ghost" onClick={() => toggleHandled(item)}>{item.handled ? "Reopen" : "Mark handled"}</button>
                  <button className="btn btn-ghost admin-danger" onClick={() => remove(item)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
