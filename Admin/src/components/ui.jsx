import { useEffect, useRef, useState } from "react";

/* ---------- CopyButton: copies a value (email, phone...) ---------- */
export function CopyButton({ value, label }) {
  const [done, setDone] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch (e) {
      // Older browsers / non-secure contexts: fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = value; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (err) { /* nothing else to try */ }
      ta.remove();
    }
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1800);
  };
  return (
    <button type="button" className={`copy-btn${done ? " is-done" : ""}`} onClick={copy}
      aria-label={done ? `${label} copied` : `Copy ${label}`} title={done ? "Copied" : `Copy ${label}`}>
      {done ? <span>Copied ✓</span> : (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </svg>
      )}
    </button>
  );
}
