import { useEffect, useRef } from "react";

// Runs `load(value)` immediately on mount, then re-runs it debounced by
// `delay`ms on every later change to `value` — the search-as-you-type
// pattern used by every admin list page (Users, Subscriptions, Messages,
// Services). A plain "one effect on mount + one debounced effect on
// [value]" pair fires the load TWICE on mount, because the debounced
// effect's own dependency is already set on that first render; this
// collapses both into one hook so there's exactly one fetch on mount and
// one debounced fetch per keystroke after that.
export function useDebouncedLoad(load, value, delay = 300) {
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      load(value);
      return;
    }
    const t = setTimeout(() => load(value), delay);
    return () => clearTimeout(t);
  }, [value]);
}
