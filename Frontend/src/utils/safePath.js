// A "?next=" address we may send someone to after a form: only a path on this
// site. "//host" and "/\host" both mean another site to a browser, and spaces
// or control characters have no business in one. Anything else gives "".
export function safeNextPath(raw) {
  const s = String(raw || "");
  if (!s.startsWith("/") || s.startsWith("//")) return "";
  // eslint-disable-next-line no-control-regex
  if (/[\\\s\u0000-\u001f]/.test(s)) return "";
  return s;
}
