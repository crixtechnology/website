import { useEffect, useRef } from "react";
import { getLastActivity, setLastActivity } from "../services/api.js";

// Auto-sign-out after a stretch of no interaction.
//
//   useIdleLogout({ active: isLoggedIn, onIdle: logout });
//
// While `active`, it stamps the time of the user's last interaction
// (mouse, keyboard, touch, scroll) into sessionStorage — throttled to at
// most once a second — and every `checkEveryMs` compares that stamp to
// now. Once the gap reaches `timeoutMs` (IDLE_TIMEOUT_MINUTES by default) it
// calls `onIdle` once and stops listening.
//
// The stamp lives in storage (not just a ref) so the check still works
// after the tab was backgrounded — browsers freeze timers in hidden tabs,
// so we also re-check the moment the tab becomes visible again, catching
// the "walked away with the tab open" case immediately.
// How long a signed-in student can sit idle. Keep in step with the server's
// IDLE_TIMEOUT_MS (Backend/src/utils/sessionPolicy.js), which is what really frees
// their single-device login slot; this one is the timer they normally see fire.
// The "you were signed out after N minutes" notice reads this too, so the text
// can't drift from the actual limit.
export const IDLE_TIMEOUT_MINUTES = 30;

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
const WRITE_THROTTLE_MS = 1000;

export function useIdleLogout({
  active,
  onIdle,
  timeoutMs = IDLE_TIMEOUT_MINUTES * 60 * 1000,
  checkEveryMs = 30 * 1000,
}) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!active) return undefined;

    // Resuming a tab that was already idle past the limit → sign out now,
    // before wiring anything up.
    const existing = getLastActivity();
    if (existing != null && Date.now() - existing >= timeoutMs) {
      onIdleRef.current?.();
      return undefined;
    }
    if (existing == null) setLastActivity();

    let stopped = false;
    let lastWrite = 0;

    const bump = () => {
      const now = Date.now();
      if (now - lastWrite >= WRITE_THROTTLE_MS) {
        lastWrite = now;
        setLastActivity(now);
      }
    };

    const check = () => {
      if (stopped) return;
      const last = getLastActivity();
      // No stamp means the session was already torn down elsewhere (e.g. a
      // 401 handler) — that's not "inactivity", so leave it to that path.
      if (last == null) return;
      if (Date.now() - last >= timeoutMs) {
        teardown();
        onIdleRef.current?.();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };

    const teardown = () => {
      if (stopped) return;
      stopped = true;
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, bump));
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, bump, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    const intervalId = window.setInterval(check, checkEveryMs);

    return teardown;
  }, [active, timeoutMs, checkEveryMs]);
}
