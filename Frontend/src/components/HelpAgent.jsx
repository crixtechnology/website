import { Suspense, lazy, useEffect, useRef, useState } from "react";
import "../styles/helpAgent.css";

// The help agent's chat (its language engine, answer bank and live data) loads
// on the first click, so pages don't carry it for visitors who never open it.
const HelpAgentPanel = lazy(() => import("./HelpAgentPanel.jsx"));

const SEEN_KEY = "crix_help_seen";
const wasSeen = () => { try { return window.sessionStorage.getItem(SEEN_KEY) === "1"; } catch (e) { return false; } };

// The floating help button, always on the page.
export default function HelpAgent({ peek }) {
  const [open, setOpen] = useState(false);
  // Once opened, the panel stays mounted (hidden while closed) to keep the conversation.
  const [started, setStarted] = useState(false);
  // A small dot on the button until the chat has been opened once this visit.
  const [seen, setSeen] = useState(wasSeen);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open || seen) return;
    setSeen(true);
    try { window.sessionStorage.setItem(SEEN_KEY, "1"); } catch (e) { /* storage blocked */ }
  }, [open, seen]);

  const toggle = () => { setStarted(true); setOpen((o) => !o); };
  const close = () => { setOpen(false); btnRef.current && btnRef.current.focus(); };

  return (
    <>
      <button ref={btnRef} id="faq-bot" type="button" className={`${peek && !open ? "peek " : ""}${open ? "is-open" : ""}`.trim()}
        aria-label={open ? "Close the help chat" : "Open the help chat"} aria-expanded={open} aria-controls="faq-panel"
        onClick={toggle}>
        {open ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.9 3 3 6.6 3 11c0 2.3 1.1 4.4 2.9 5.9-.2 1.4-.9 2.7-1.9 3.6 2-.1 3.8-.9 5.1-2 1 .3 1.9.5 2.9.5 5.1 0 9-3.6 9-8s-3.9-8-9-8z" fill="currentColor" /><circle cx="8.3" cy="11" r="1.25" fill="#063a3a" /><circle cx="12" cy="11" r="1.25" fill="#063a3a" /><circle cx="15.7" cy="11" r="1.25" fill="#063a3a" /></svg>
        )}
        {!open && !seen && <span className="ha-badge" aria-hidden="true" />}
        <span className="faq-tip" aria-hidden="true"><b>Need help?</b><small>Chat with our help agent</small></span>
      </button>
      {started && (
        <Suspense fallback={open ? <section id="faq-panel" className="faq-panel ha-panel ha-loading" role="dialog" aria-label="Help chat" aria-busy="true"><div className="ha-typing" aria-label="Loading"><i /><i /><i /></div></section> : null}>
          <HelpAgentPanel open={open} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
