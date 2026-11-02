import { useEffect, useRef } from "react";

// A page split into sections shown one at a time (My Dashboard, Profile), so a
// phone shows just the section picked instead of one long page. `tabs` is a
// list of { id, label, badge? }; the badge is a small count beside the label.
// On a phone the bar is one row that scrolls sideways (styles/careers.css).
// Left/Right arrow keys move between tabs, as for any tab list.
export default function SectionTabs({ tabs, active, onChange, label, idPrefix = "sec" }) {
  const barRef = useRef(null);

  // Keep the picked tab in view when the bar scrolls sideways.
  useEffect(() => {
    const el = barRef.current && barRef.current.querySelector('[aria-selected="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const onKeyDown = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.id === active);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    e.preventDefault();
    onChange(next.id);
    const btn = barRef.current && barRef.current.querySelector(`#${idPrefix}-tab-${next.id}`);
    if (btn) btn.focus();
  };

  return (
    <div className="program-filter dash-tabs" role="tablist" aria-label={label} ref={barRef} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button key={t.id} id={`${idPrefix}-tab-${t.id}`} type="button" role="tab"
          aria-selected={active === t.id} aria-controls={`${idPrefix}-panel`} tabIndex={active === t.id ? 0 : -1}
          className={active === t.id ? "active" : ""} onClick={() => onChange(t.id)}>
          {t.label}
          {t.badge > 0 && <span className="nav-due-badge" aria-label={`${t.badge} new`}>{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

// The area under the tabs that holds the picked section. With no `active` tab
// (a page shown without tabs) it adds nothing around the content.
export function SectionPanel({ active, idPrefix = "sec", children }) {
  if (!active) return <>{children}</>;
  return (
    <div className="dash-panel" id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${active}`}>
      {children}
    </div>
  );
}
