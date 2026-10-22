import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DEPARTMENTS, greeting, initialState, respond, answerFor, vocabFor } from "../data/helpAgent.js";
import { internships, courses, services as staticServices } from "../data/content.js";
import { UserContext } from "../context/UserContext.jsx";
import { getCourses, getOpenings, getServices, getTaughtAnswers, reportUnansweredQuestion } from "../services/api.js";
import { isFreeProgram } from "../utils/tiers.js";

const REDUCED_MOTION = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const tel = (n) => `tel:${String(n).replace(/[^\d+]/g, "")}`;

// An answer: plain lines, with "• " lines grouped into a bullet list.
function Answer({ text }) {
  const blocks = [];
  text.split("\n").forEach((line) => {
    const bullet = line.startsWith("• ");
    const last = blocks[blocks.length - 1];
    if (bullet && last && last.list) last.items.push(line.slice(2));
    else if (bullet) blocks.push({ list: true, items: [line.slice(2)] });
    else blocks.push({ list: false, text: line });
  });
  return blocks.map((b, i) => (b.list
    ? <ul key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
    : <p key={i}>{b.text}</p>));
}

const Arrow = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function AnswerLink({ link, onNavigate }) {
  if (link.to) return <Link className="ha-link" to={link.to} onClick={onNavigate}>{link.label}<Arrow /></Link>;
  const external = /^https?:/.test(link.href);
  return <a className="ha-link" href={link.href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{link.label}<Arrow /></a>;
}

// One team's number, with who it's for — the agent shows only the team the
// question belongs to (or both, labelled, when asked for every number).
function DeptCard({ dept }) {
  const d = DEPARTMENTS[dept];
  return (
    <div className={`ha-dept dept--${d.id}`}>
      <span className="dept-tag">{d.label}</span>
      <div className="ha-dept-info">
        <b>{d.phone}</b>
        <small>For {d.hint.charAt(0).toLowerCase() + d.hint.slice(1)}</small>
      </div>
      <a className="ha-call" href={tel(d.phone)} aria-label={`Call ${d.label}: ${d.phone}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" fill="currentColor" /></svg>
        Call
      </a>
    </div>
  );
}

function Avatar({ small }) {
  return (
    <span className={`ha-avatar${small ? " is-small" : ""}`} aria-hidden="true">
      <img src="/logo-icon.png" alt="" />
    </span>
  );
}

// The help agent's chat panel. A conversation, not a list of FAQs: the replies
// come from data/helpAgent.js (built from the site's own content and live data —
// no AI service, nothing sent anywhere except an unanswered question, anonymously).
// Loaded on the first click of the launcher (components/HelpAgent.jsx), then
// kept mounted while closed so the conversation is still there when reopened.
export default function HelpAgentPanel({ open, onClose }) {
  const { user } = useContext(UserContext);
  const [msgs, setMsgs] = useState(() => [{ from: "bot", ...greeting({ user }) }]);
  const [state, setState] = useState(initialState);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  // What the agent knows about: the static lists until the live ones arrive.
  const [data, setData] = useState({
    programs: [...internships.map((p) => ({ ...p, type: "internship" })), ...courses.map((p) => ({ ...p, type: "course" }))],
    openings: [],
    services: staticServices,
    taught: [],
  });
  // The words the agent recognises — rebuilt only when the data changes.
  const vocab = useMemo(() => vocabFor(data), [data]);
  const loaded = useRef(false);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const lastUserRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Live programs, open roles and services, fetched once — the first time the chat opens.
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    Promise.all([getCourses(), getOpenings(), getServices(), getTaughtAnswers()]).then(([c, o, s, t]) => {
      setData((d) => ({
        programs: c && c.ok && c.courses && c.courses.length ? c.courses.filter((p) => !isFreeProgram(p)) : d.programs,
        openings: o && o.ok ? o.openings || [] : d.openings,
        services: s && s.ok && s.services && s.services.length ? s.services : d.services,
        taught: t && t.ok ? t.answers || [] : d.taught,
      }));
    });
  }, [open]);

  // Greet by name once someone logs in while the chat is still untouched.
  useEffect(() => {
    setMsgs((m) => (m.length === 1 ? [{ from: "bot", ...greeting({ user }) }] : m));
  }, [user]);

  const close = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // On desktop, start with the cursor in the message box. Not on touch screens:
  // that would pop the keyboard up over the panel before anyone asked for it.
  useEffect(() => {
    if (open && inputRef.current && window.matchMedia("(pointer: fine)").matches) inputRef.current.focus();
  }, [open]);

  // Keep the *start* of the newest reply in view, so a long one is read from its first line.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const behavior = REDUCED_MOTION ? "auto" : "smooth";
    if (msgs.length <= 1) { body.scrollTo({ top: 0 }); return; }
    const el = lastUserRef.current;
    if (el) body.scrollTo({ top: Math.max(0, el.offsetTop - 10), behavior });
  }, [msgs, typing]);

  const showReplies = (userText, replies) => {
    clearTimeout(timer.current);
    setMsgs((m) => [...m, { from: "you", text: userText }]);
    setTyping(true);
    timer.current = setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, ...replies.map((r) => ({ from: "bot", ...r }))]);
    }, REDUCED_MOTION ? 0 : 450);
  };

  const send = (text) => {
    const clean = String(text || "").trim();
    if (!clean || typing) return;
    const res = respond(state, clean, { user, ...data, vocab });
    if (res.state.unanswered) reportUnansweredQuestion(clean);
    const { unanswered, ...nextState } = res.state;
    setState(nextState);
    showReplies(clean, res.replies);
  };

  const submit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    send(text);
  };

  const askRelated = (f) => {
    const a = answerFor(f.id);
    if (a) showReplies(f.q, [a]);
  };

  const restart = () => {
    clearTimeout(timer.current);
    setTyping(false);
    setState(initialState());
    setMsgs([{ from: "bot", ...greeting({ user }) }]);
  };

  const welcome = msgs.length === 1;
  const lastUserIdx = msgs.map((m) => m.from).lastIndexOf("you");
  const lastBot = [...msgs].reverse().find((m) => m.from === "bot");
  const chips = !welcome && lastBot && lastBot.chips ? lastBot.chips : [];

  if (!open) return null;
  return (
    <>
      {(
        <section id="faq-panel" className="faq-panel ha-panel" role="dialog" aria-label="Help chat">
          <header className="ha-head">
            <Avatar />
            <div className="ha-title">
              <b>Crix Help Agent</b>
              <small><i className="ha-online" aria-hidden="true" />Online · replies instantly</small>
            </div>
            {!welcome && (
              <button type="button" className="ha-icon-btn" aria-label="Start over" title="Start over" onClick={restart}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
            <button type="button" className="ha-icon-btn" aria-label="Close" onClick={close}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            </button>
          </header>

          <div className="ha-body" ref={bodyRef} aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} ref={i === lastUserIdx ? lastUserRef : null} className={`ha-row ${m.from}`}>
                {m.from === "bot" && <Avatar small />}
                <div className={`ha-msg ${m.from}`}>
                  <Answer text={m.text} />
                  {m.dept === "both"
                    ? <><DeptCard dept="programs" /><DeptCard dept="it" /></>
                    : m.dept && <DeptCard dept={m.dept} />}
                  {m.links && m.links.length > 0 && (
                    <div className="ha-links">{m.links.map((l, j) => <AnswerLink key={j} link={l} onNavigate={() => setOpen(false)} />)}</div>
                  )}
                  {m.more && m.more.length > 0 && (
                    <div className="ha-more">
                      <small>Related questions</small>
                      {m.more.map((f) => <button key={f.id} type="button" onClick={() => askRelated(f)}>{f.q}</button>)}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {welcome && (
              <div className="ha-topics" role="group" aria-label="What can we help with?">
                {(msgs[0].chips || []).map((c) => (
                  <button key={c.label} type="button" className="ha-topic" onClick={() => send(c.say)}>
                    <span className="ha-topic-icon" aria-hidden="true">{c.icon}</span>
                    <b>{c.label}</b>
                    {c.hint && <small>{c.hint}</small>}
                  </button>
                ))}
              </div>
            )}

            {typing && (
              <div className="ha-row bot">
                <Avatar small />
                <div className="ha-msg bot ha-typing" aria-label="Typing"><i /><i /><i /></div>
              </div>
            )}
          </div>

          {chips.length > 0 && !typing && (
            <div className="ha-chips" role="group" aria-label="Quick replies">
              {chips.map((c) => (
                <button key={c.label} type="button" onClick={() => send(c.say)}>{c.icon ? `${c.icon} ` : ""}{c.label}</button>
              ))}
            </div>
          )}

          <form className="ha-input" onSubmit={submit}>
            <div className="ha-field">
              <input ref={inputRef} type="text" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={200}
                placeholder="Ask anything…" aria-label="Type your message" autoComplete="off" />
              <button type="submit" aria-label="Send" disabled={!draft.trim() || typing}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12h13M12.5 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <small className="ha-note">Instant answers · No personal details needed</small>
          </form>
        </section>
      )}
    </>
  );
}
