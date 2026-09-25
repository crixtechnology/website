import { useEffect, useId, useRef, useState } from "react";

const MAX_SHOWN = 50;

// Searchable account picker for admin forms: type any part of a name, email
// or phone and pick from the matches (mouse, or ↑/↓ + Enter). `users` is the
// full list to choose from; `value` is the chosen user (or null).
export default function UserPicker({ users, value, onChange, loading, placeholder = "Search by name, email or phone..." }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const q = query.trim().toLowerCase();
  const matches = (q
    ? users.filter((u) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.phone || "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000"))
    : users
  ).slice(0, MAX_SHOWN);

  useEffect(() => { setActive(0); }, [query]);

  // Close on a click anywhere outside.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    const el = listRef.current && listRef.current.children[active];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (u) => {
    onChange(u);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      // Never submit the surrounding form from the search box.
      e.preventDefault();
      if (open && matches[active]) choose(matches[active]);
    } else if (e.key === "Escape") setOpen(false);
  };

  if (value) {
    return (
      <div className="user-picker-chosen">
        <div className="user-picker-who">
          <b>{value.name || "Unnamed"}</b>
          <span>{value.email}{value.phone ? ` · ${value.phone}` : ""}</span>
        </div>
        <button type="button" className="btn btn-ghost user-picker-change"
          onClick={() => { onChange(null); setTimeout(() => inputRef.current && inputRef.current.focus(), 0); }}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="user-picker" ref={boxRef}>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder={loading ? "Loading accounts..." : placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="user-picker-list" id={listId} role="listbox" ref={listRef}>
          {loading ? (
            <li className="user-picker-empty">Loading...</li>
          ) : matches.length === 0 ? (
            <li className="user-picker-empty">{q ? "No account matches that." : "No student accounts yet."}</li>
          ) : (
            matches.map((u, i) => (
              <li
                key={u._id}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                onMouseEnter={() => setActive(i)}
                // pointerdown, not click, so it lands before the input loses focus.
                onPointerDown={(e) => { e.preventDefault(); choose(u); }}
              >
                <b>{u.name || "Unnamed"}</b>
                <span>{u.email}{u.phone ? ` · ${u.phone}` : ""}</span>
              </li>
            ))
          )}
          {!loading && !q && users.length > MAX_SHOWN && (
            <li className="user-picker-empty">Showing the newest {MAX_SHOWN} of {users.length} — type to search all.</li>
          )}
        </ul>
      )}
    </div>
  );
}
