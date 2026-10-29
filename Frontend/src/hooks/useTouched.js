import { useCallback, useState } from "react";

// Which fields should show their error yet: one the visitor has left
// (blurred), or every field once they've tried to submit. Errors then update
// live as they keep typing, instead of shouting "required" at an untouched form.
export function useTouched() {
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const touch = useCallback((key) => () => setTouched((t) => (t[key] ? t : { ...t, [key]: true })), []);
  const show = (key) => submitted || !!touched[key];
  const reset = useCallback(() => { setTouched({}); setSubmitted(false); }, []);
  return { touch, show, markSubmitted: () => setSubmitted(true), reset };
}

// Moves focus to the first field (in `order`) that still has an error, so a
// failed submit lands the visitor right where the fix is.
export function focusFirstError(errors, order) {
  const first = order.find((id) => errors[id]);
  if (!first) return;
  const el = document.getElementById(first);
  if (el && el.focus) el.focus({ preventScroll: false });
}
