import { useEffect } from "react";

// Sets the browser-tab title. Callers passing no title are a no-op, so the
// login screen and the page it wraps never fight over it.
export function usePageMeta({ title } = {}) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
