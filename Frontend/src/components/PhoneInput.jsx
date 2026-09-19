import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_COUNTRY, POPULAR_COUNTRIES, OTHER_COUNTRIES,
  countryByIso, parsePhone, formatPhone, searchCountries,
} from "../utils/phone.js";

// A country's flag. Flags are self-hosted SVGs in public/flags (one small file
// per country, fetched only when that flag is actually shown); emoji flags are
// avoided because Windows doesn't draw them. If a file ever fails to load the
// ISO code is shown instead, so the picker never has a broken-image hole.
export function Flag({ iso, className = "" }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [iso]);
  if (broken) return <span className={`flag flag--fallback ${className}`} aria-hidden="true">{iso}</span>;
  return (
    <img
      className={`flag ${className}`}
      src={`${process.env.PUBLIC_URL || ""}/flags/${iso}.svg`}
      alt=""
      width="24"
      height="16"
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}

// Country picker + phone number in one field. `value` / `onChange` speak the
// single string the API stores ("+91 9876543210", or "" while empty), so a form
// only keeps one `phone` value and can check it with utils/phone.js#phoneError.
// Pasting or autofilling a full "+44 7400 123456" switches the country for you.
export default function PhoneInput({
  id, value, onChange, disabled = false, placeholder, name, required = false, defaultCountry = DEFAULT_COUNTRY, describedBy,
}) {
  const [iso, setIso] = useState(() => parsePhone(value, defaultCountry).iso);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const buttonRef = useRef(null);
  const searchRef = useRef(null);
  const numberRef = useRef(null);
  const listId = `${id || "phone"}-countries`;

  const current = countryByIso(iso);
  const national = parsePhone(value, iso).national;

  // A number set from outside (profile prefill, browser autofill, a form reset)
  // may belong to another country than the one showing.
  useEffect(() => {
    if (!String(value || "").trim()) return;
    const p = parsePhone(value, iso);
    if (p.iso !== iso) setIso(p.iso);
  }, [value]);

  const found = useMemo(() => searchCountries(query), [query]);
  // What the list shows: search results, or "popular" then everyone else.
  const options = useMemo(() => found || [...POPULAR_COUNTRIES, ...OTHER_COUNTRIES], [found]);

  const emit = (nextIso, digits) => onChange(formatPhone(nextIso, digits));

  const openList = () => {
    if (disabled) return;
    setQuery("");
    const idx = [...POPULAR_COUNTRIES, ...OTHER_COUNTRIES].findIndex((c) => c.iso === iso);
    setActive(Math.max(0, idx));
    setOpen(true);
  };
  const closeList = (refocus) => {
    setOpen(false);
    if (refocus && buttonRef.current) buttonRef.current.focus({ preventScroll: true });
  };

  const choose = (c) => {
    setIso(c.iso);
    emit(c.iso, national);
    setOpen(false);
    if (numberRef.current) numberRef.current.focus({ preventScroll: true });
  };

  // Once open: give a keyboard user the search box (not touch users — that would
  // pop the on-screen keyboard over the list), make sure the panel is on screen
  // (it can hang below a scrolling popup) and scroll to the selected country.
  useEffect(() => {
    if (!open) return;
    const finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (finePointer && searchRef.current) searchRef.current.focus({ preventScroll: true });
    const pop = rootRef.current && rootRef.current.querySelector(".phone-pop");
    if (pop && pop.scrollIntoView) pop.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keep the highlighted row visible inside the list (scrolling the list only,
  // never the page or the popup around it).
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const el = list && list.querySelector('[data-active="true"]');
    if (!el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [open, active, options]);

  const onPanelKey = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (e.key === "Escape") {
      // Close just the list — not the popup it sits in (that listens on document).
      e.preventDefault();
      e.stopPropagation();
      closeList(true);
    } else if (e.key === "Tab") setOpen(false);
  };

  const onNumberChange = (e) => {
    const raw = e.target.value;
    // A whole international number pasted/autofilled: let it pick the country.
    if (/^\s*(\+|00)/.test(raw)) {
      const p = parsePhone(raw, iso);
      setIso(p.iso);
      emit(p.iso, p.national.slice(0, 15));
      return;
    }
    emit(iso, raw.replace(/\D/g, "").slice(0, Math.max(1, 15 - current.digits.length)));
  };

  // Rows in "popular" / "all" groups; a heading goes before the first of each.
  const showGroups = !found;
  const rows = options.map((c, i) => {
    const heading =
      showGroups && i === 0 ? "Popular"
        : showGroups && i === POPULAR_COUNTRIES.length ? "All countries"
          : null;
    return (
      <li key={c.iso} role="presentation" className="phone-row-item">
        {heading && <span className="phone-group" aria-hidden="true">{heading}</span>}
        <div
          role="option"
          id={`${listId}-${c.iso}`}
          aria-selected={c.iso === iso}
          data-active={i === active ? "true" : undefined}
          className={`phone-opt${i === active ? " is-active" : ""}${c.iso === iso ? " is-selected" : ""}`}
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={() => { if (active !== i) setActive(i); }}
          onClick={() => choose(c)}
        >
          <Flag iso={c.iso} />
          <span className="phone-opt-name">{c.name}</span>
          <span className="phone-opt-dial">{c.dial}</span>
        </div>
      </li>
    );
  });

  return (
    <div className="phone-field" ref={rootRef} onKeyDown={onPanelKey}>
      <button
        type="button"
        ref={buttonRef}
        className="phone-cc"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Country code: ${current.name} ${current.dial}. Change country`}
        onClick={() => (open ? closeList(false) : openList())}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); openList(); } }}
      >
        <Flag iso={iso} />
        <span className="phone-cc-dial">{current.dial}</span>
        <svg className="phone-cc-caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <input
        ref={numberRef}
        id={id}
        name={name}
        className="phone-num"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={national}
        onChange={onNumberChange}
        onFocus={() => setOpen(false)}
        placeholder={placeholder || current.example || "Phone number"}
        disabled={disabled}
        required={required}
        aria-describedby={describedBy}
      />
      {open && (
        <div className="phone-pop">
          <input
            ref={searchRef}
            className="phone-search"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={options[active] ? `${listId}-${options[active].iso}` : undefined}
            aria-label="Search countries"
            placeholder="Search country or code"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          />
          <ul className="phone-list" id={listId} role="listbox" aria-label="Countries" ref={listRef}>
            {rows}
            {options.length === 0 && <li role="presentation" className="phone-empty">No country matches “{query}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
