// Builds a safe, case-insensitive "contains" RegExp from raw admin-search
// input. Every admin list search (users, contacts, services, subscriptions)
// feeds `req.query.q` straight into `new RegExp(...)` — left unescaped, a
// perfectly ordinary search like "C++", a name in parentheses, or a stray
// unbalanced bracket throws `SyntaxError: Invalid regular expression` and
// 500s the request. Escaping regex metacharacters keeps it a plain
// substring search (still case-insensitive, still "contains") without that
// crash.
function searchRegex(q) {
  const escaped = String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

module.exports = { searchRegex };
