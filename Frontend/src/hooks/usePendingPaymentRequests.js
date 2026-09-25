import { useEffect, useState } from "react";
import { getMyPaymentRequests } from "../services/api.js";

// Fired by the dashboard's PaymentRequests list whenever it (re)loads, with
// that list as `detail` — so the navbar badge and banner update the moment a
// request is paid, without a second fetch.
export const PAYMENT_REQUESTS_EVENT = "crix:payment-requests";

// The logged-in student's still-unpaid payment requests (the admin asked them
// to pay for a course/internship). Empty for guests and admins.
export function usePendingPaymentRequests(enabled) {
  const [pending, setPending] = useState([]);

  useEffect(() => {
    if (!enabled) { setPending([]); return undefined; }
    let alive = true;
    const pick = (list) => (list || []).filter((r) => r.status === "pending");
    getMyPaymentRequests().then((res) => { if (alive && res.ok) setPending(pick(res.requests)); });
    const onChange = (e) => { if (alive) setPending(pick(e.detail)); };
    window.addEventListener(PAYMENT_REQUESTS_EVENT, onChange);
    return () => { alive = false; window.removeEventListener(PAYMENT_REQUESTS_EVENT, onChange); };
  }, [enabled]);

  return pending;
}
