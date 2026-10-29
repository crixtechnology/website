// The error line under a form field, shown live as the visitor types (see
// hooks/useTouched.js for when). `id` is what the input's aria-describedby
// points at, so a screen reader reads the error with the field.
export function FieldError({ id, children }) {
  if (!children) return null;
  return <p className="field-error" id={id} role="alert">{children}</p>;
}

// Everything an email field says under itself: the local format/disposable
// error, then the server's domain answer (hooks/useEmailCheck.js) with a
// one-click "Use abc@gmail.com" fix for a typo'd provider.
//   localError — emailError(...) for this value; only shown once `show` is true
//   check      — the useEmailCheck result for this value
//   onUseSuggestion(address) — fills the field with the suggested address
export function emailFieldProblem(localError, check, show) {
  if (localError) return show ? localError : "";
  return check.status === "invalid" ? check.error : "";
}

export function EmailFieldNote({ id, localError, check, show, onUseSuggestion }) {
  const problem = emailFieldProblem(localError, check, show);
  if (problem) {
    return (
      <p className="field-error" id={id} role="alert">
        {problem}
        {check.suggestion && !localError && (
          <>
            {" "}
            <button type="button" className="link-btn" onClick={() => onUseSuggestion(check.suggestion)}>
              Use {check.suggestion}
            </button>
          </>
        )}
      </p>
    );
  }
  if (!localError && check.status === "checking") return <p className="field-hint" id={id}>Checking email…</p>;
  return null;
}
