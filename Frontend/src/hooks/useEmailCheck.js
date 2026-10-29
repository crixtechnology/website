import { useCallback, useEffect, useState } from "react";
import { checkEmailDomain } from "../services/api.js";
import { emailError } from "../utils/validators.js";

// One answer per address for the whole visit — retyping or reopening a form
// doesn't ask again. A failed ask isn't kept, so the next one can retry.
const answers = new Map();
function lookup(email) {
  if (!answers.has(email)) {
    // Anything but a clear answer counts as "couldn't tell" — the check must
    // never be the reason a form can't be sent.
    answers.set(email, Promise.resolve(checkEmailDomain(email)).catch(() => null).then((r) => {
      if (!r) answers.delete(email);
      return r || null;
    }));
  }
  return answers.get(email);
}

const DEBOUNCE_MS = 450;

// Asks the server whether `email`'s domain can receive mail, once the visitor
// pauses typing and the address passes the local format/disposable checks.
// status: "idle" (nothing to check yet) | "checking" | "valid" | "invalid" |
// "unknown" (server couldn't tell — treated as fine). `verify()` resolves the
// answer right away for a submit that can't wait for the debounce.
export function useEmailCheck(email, enabled = true) {
  const value = String(email || "").trim().toLowerCase();
  const checkable = enabled && !!value && !emailError(value);
  const [answer, setAnswer] = useState({ email: "", status: "idle", error: "", suggestion: "" });

  useEffect(() => {
    if (!checkable) return undefined;
    let live = true;
    const t = setTimeout(() => {
      lookup(value).then((r) => {
        if (!live) return;
        setAnswer(r
          ? { email: value, status: r.valid ? "valid" : "invalid", error: r.error, suggestion: r.suggestion }
          : { email: value, status: "unknown", error: "", suggestion: "" });
      });
    }, DEBOUNCE_MS);
    return () => { live = false; clearTimeout(t); };
  }, [value, checkable]);

  const verify = useCallback(() => (checkable ? lookup(value) : Promise.resolve(null)), [value, checkable]);

  const current = !checkable
    ? { status: "idle", error: "", suggestion: "" }
    : answer.email === value ? answer : { status: "checking", error: "", suggestion: "" };
  return { status: current.status, error: current.error, suggestion: current.suggestion, verify };
}
