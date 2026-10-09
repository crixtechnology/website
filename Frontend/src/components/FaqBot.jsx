import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { site } from "../data/content.js";
import { FAQ_TOPICS, searchFaqs } from "../data/faqData.js";
import { reportUnansweredQuestion } from "../services/api.js";

const REDUCED_MOTION = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const waIcon = (
  <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C9.4 3 4 8.3 4 14.9c0 2.6.9 5 2.3 7L4 29l7.3-2.2c1.9 1 3.6 1.5 5.7 1.5 6.6 0 12-5.3 12-11.9S22.6 3 16 3zm6.6 16.9c-.3.8-1.6 1.5-2.3 1.6-.6.1-1.3.2-2.2-.1-.5-.2-1.1-.4-1.9-.7-3.4-1.5-5.6-4.9-5.8-5.1-.2-.2-1.4-1.8-1.4-3.5s.9-2.5 1.2-2.8c.3-.3.7-.4.9-.4h.7c.2 0 .5-.1.8.6.3.8 1 2.6 1.1 2.8.1.2.2.4 0 .7-.1.3-.2.4-.4.7-.2.2-.4.5-.6.7-.2.2-.4.4-.2.8s1 1.7 2.2 2.7c1.5 1.3 2.8 1.7 3.2 1.9.4.2.6.2.8-.1.2-.2.9-1.1 1.2-1.5.2-.4.5-.3.8-.2.3.1 2.1 1 2.4 1.2.4.2.6.3.7.4.1.3.1.9-.2 1.7z" /></svg>
);

const GREETING = "Hi! 👋 I'm the Crix assistant. Ask me anything about our internships, courses, payments or IT services — pick a topic below or type your question.";

// Short pleasantries get a short reply instead of "I couldn't find that". Only
// for very short messages, so "hi, what is your refund policy?" still gets searched.
const SMALL_TALK = [
  { re: /^\s*(hi+|hello+|hey+|namaste|good (morning|afternoon|evening))\b/i, text: "Hello! 👋 What would you like to know? Pick a topic below or type a question." },
  { re: /\b(thanks|thank you|thankyou|thx)\b/i, text: "You're welcome! Is there anything else I can help with?" },
  { re: /^\s*(bye|goodbye|see you)\b/i, text: "Goodbye! If you need us later, the WhatsApp buttons below reach our team." },
];
const isShort = (t) => t.trim().split(/\s+/).length <= 4;

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

function AnswerLink({ link, onNavigate }) {
  if (link.to) return <Link className="faq-link" to={link.to} onClick={onNavigate}>{link.label} →</Link>;
  const external = /^https?:/.test(link.href);
  return <a className="faq-link" href={link.href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{link.label} →</a>;
}

// Floating help bot. Canned answers only (no AI; nothing is sent anywhere) from
// data/faqData.js. Footer has one WhatsApp button per number (IT services,
// internships & courses).
export default function FaqBot({ peek }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ from: "bot", text: GREETING }]);
  const [topicId, setTopicId] = useState(null); // null = topic list
  const [asked, setAsked] = useState(() => new Set());
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const bodyRef = useRef(null);
  const btnRef = useRef(null);
  const inputRef = useRef(null);
  const lastUserRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const close = () => { setOpen(false); btnRef.current && btnRef.current.focus(); };
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Keep the *start* of the newest answer in view (not the end of it), so a long
  // answer is read from its first line instead of landing half-way down.
  // On desktop, start with the cursor in the question box. Not on touch screens:
  // that would pop the keyboard up over the panel before anyone asked for it.
  useEffect(() => {
    if (open && inputRef.current && window.matchMedia("(pointer: fine)").matches) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const behavior = REDUCED_MOTION ? "auto" : "smooth";
    if (msgs.length <= 1) { body.scrollTo({ top: 0 }); return; }
    const el = lastUserRef.current;
    if (el) body.scrollTo({ top: Math.max(0, el.offsetTop - 10), behavior });
  }, [msgs, typing]);

  const reply = (userText, botMsg) => {
    clearTimeout(timer.current);
    setMsgs((m) => [...m, { from: "you", text: userText }]);
    setTyping(true);
    timer.current = setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { from: "bot", ...botMsg }]);
    }, REDUCED_MOTION ? 0 : 450);
  };

  const pickTopic = (t) => {
    setTopicId(t.id);
    reply(t.label, { text: `${t.icon} ${t.label} — what would you like to know?` });
  };
  const askFaq = (f) => {
    setAsked((s) => new Set(s).add(f.id));
    reply(f.q, { text: f.a, links: f.links });
  };
  const backToTopics = () => {
    setTopicId(null);
    reply("Other topics", { text: "Sure — pick a topic." });
  };

  const submit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const talk = isShort(text) && SMALL_TALK.find((t) => t.re.test(text));
    if (talk) { reply(text, { text: talk.text }); return; }
    const hits = searchFaqs(text);
    if (!hits.length) {
      // Nothing matched: note the question for the team (anonymously — see the Privacy
      // Policy) so an answer can be added, and say so.
      reportUnansweredQuestion(text);
      reply(text, { text: "I couldn't find that one — I've noted your question so we can add an answer. For now, try a topic below, or message us on WhatsApp using the buttons at the bottom." });
      return;
    }
    const [best, ...more] = hits;
    setAsked((s) => new Set(s).add(best.id));
    reply(text, { text: best.a, links: best.links, more });
  };

  const topic = FAQ_TOPICS.find((t) => t.id === topicId);
  const waText = encodeURIComponent("Hi Crix Technology! I have a question about your IT services.");
  const waTextAlt = encodeURIComponent("Hi Crix Technology! I have a question about your internships / courses.");
  const lastUserIdx = msgs.map((m) => m.from).lastIndexOf("you");

  return (
    <>
      <button ref={btnRef} id="faq-bot" type="button" className={`${peek && !open ? "peek " : ""}${open ? "is-open" : ""}`.trim()}
        aria-label={open ? "Close the help chat" : "Open the help chat"} aria-expanded={open} aria-controls="faq-panel"
        onClick={() => { setOpen((o) => !o); }}>
        {open ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="#fff" /><circle cx="8.5" cy="11" r="1.3" fill="#1b9a52" /><circle cx="12" cy="11" r="1.3" fill="#1b9a52" /><circle cx="15.5" cy="11" r="1.3" fill="#1b9a52" /></svg>
        )}
        <span className="faq-tip" aria-hidden="true"><b>Need help?</b><small>Ask about courses, internships &amp; IT services</small></span>
      </button>

      {open && (
        <section id="faq-panel" className="faq-panel" role="dialog" aria-label="Help chat">
          <header className="faq-head">
            <span className="faq-avatar" aria-hidden="true">C</span>
            <div><b>Crix Assistant</b><small>Quick answers · usually instant</small></div>
            <button type="button" className="faq-x" aria-label="Close" onClick={close}>×</button>
          </header>

          <div className="faq-body" ref={bodyRef} aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} ref={i === lastUserIdx ? lastUserRef : null} className={`faq-row ${m.from}`}>
                <div className={`faq-msg ${m.from}`}>
                  <Answer text={m.text} />
                  {m.links && m.links.length > 0 && (
                    <div className="faq-links">{m.links.map((l, j) => <AnswerLink key={j} link={l} onNavigate={() => setOpen(false)} />)}</div>
                  )}
                  {m.more && m.more.length > 0 && (
                    <div className="faq-more">
                      <small>Related</small>
                      {m.more.map((f) => <button key={f.id} type="button" onClick={() => askFaq(f)}>{f.q}</button>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {typing && <div className="faq-row bot"><div className="faq-msg bot faq-typing" aria-label="Typing"><i /><i /><i /></div></div>}
          </div>

          <div className="faq-tray" role="group" aria-label={topic ? `${topic.label} questions` : "Topics"}>
            {topic ? (
              <>
                {topic.faqs.filter((f) => !asked.has(f.id)).map((f) => (
                  <button key={f.id} type="button" disabled={typing} onClick={() => askFaq(f)}>{f.q}</button>
                ))}
                {topic.faqs.every((f) => asked.has(f.id)) && <span className="faq-done">You've seen everything here.</span>}
                <button type="button" className="faq-back" disabled={typing} onClick={backToTopics}>← Other topics</button>
              </>
            ) : (
              FAQ_TOPICS.map((t) => (
                <button key={t.id} type="button" className="faq-topic" disabled={typing} onClick={() => pickTopic(t)}>
                  <span aria-hidden="true">{t.icon}</span> {t.label}
                </button>
              ))
            )}
          </div>

          <form className="faq-input" onSubmit={submit}>
            <input ref={inputRef} type="text" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120}
              placeholder="Type your question…" aria-label="Type your question" autoComplete="off" />
            <button type="submit" aria-label="Send" disabled={!draft.trim() || typing}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 21 3l-6.5 18-3-7.5z" fill="currentColor" /></svg>
            </button>
          </form>

          <div className="faq-foot">
            <a className="faq-wa" href={`https://wa.me/${site.whatsapp}?text=${waText}`} target="_blank" rel="noopener noreferrer">
              {waIcon}<span>{site.phoneLabel}<b>{site.phone}</b></span>
            </a>
            <a className="faq-wa" href={`https://wa.me/${site.whatsappAlt}?text=${waTextAlt}`} target="_blank" rel="noopener noreferrer">
              {waIcon}<span>{site.phoneAltLabel}<b>{site.phoneAlt}</b></span>
            </a>
          </div>
        </section>
      )}
    </>
  );
}
