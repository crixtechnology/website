import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getMyPaymentRequests, createPaymentRequestOrder, verifyPaymentRequest, getReceipt } from "../services/api.js";
import { loadRazorpayScript, Alert } from "./ui.jsx";
import { downloadReceiptPdf } from "../utils/receiptPdf.js";
import { tierLabel, formatINR } from "../utils/tiers.js";
import { PAYMENT_REQUESTS_EVENT } from "../hooks/usePendingPaymentRequests.js";

// Payment requests the admin sent this student: pay a pending one here
// (Razorpay Checkout, confirmed at /payment-requests/verify — not the normal
// checkout), and get access to the course/internship once it's paid.
// Renders nothing when there are none. `onPaid` refreshes the course list.
export default function PaymentRequests({ onPaid }) {
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(""); // request id being paid / receipt being built
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const mounted = useRef(true);

  const load = () => getMyPaymentRequests().then((res) => {
    if (!res.ok) return;
    // Keeps the navbar badge/banner in step (hooks/usePendingPaymentRequests.js).
    window.dispatchEvent(new CustomEvent(PAYMENT_REQUESTS_EVENT, { detail: res.requests || [] }));
    if (mounted.current) setRequests(res.requests || []);
  });

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, []);

  if (requests.length === 0) return null;

  const pay = async (r) => {
    if (busy) return;
    setBusy(r._id);
    setMsg({ kind: "", text: "" });
    const order = await createPaymentRequestOrder(r._id);
    if (!order.ok) {
      setBusy("");
      setMsg({ kind: "error", text: order.error || "Could not start payment right now." });
      load();
      return;
    }
    const scriptOk = await loadRazorpayScript();
    if (!scriptOk || !window.Razorpay) {
      setBusy("");
      setMsg({ kind: "error", text: "Could not load the payment gateway. Check your connection and try again." });
      return;
    }
    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: "Crix Technology",
      description: `${r.course?.title || "Payment"}${r.tier ? ` — ${tierLabel(r.tier)}` : ""}`,
      theme: { color: "#14C9C9" },
      handler: async (resp) => {
        setMsg({ kind: "info", text: "Confirming your payment..." });
        const v = await verifyPaymentRequest(resp);
        if (!mounted.current) return;
        setBusy("");
        if (v.ok) {
          setMsg({ kind: "success", text: `Payment confirmed — you now have access to ${r.course?.title || "it"}.` });
          load();
          onPaid && onPaid();
        } else {
          setMsg({
            kind: "error",
            text: (v.error || "We received your payment") + " — if access doesn't appear shortly, contact us and we'll sort it out.",
          });
        }
      },
      modal: { ondismiss: () => { setBusy(""); setMsg({ kind: "", text: "" }); } },
    });
    rzp.open();
  };

  const receipt = async (r) => {
    if (busy) return;
    setBusy(`rc-${r._id}`);
    try {
      const res = await getReceipt(r.paidPaymentId);
      if (!res.ok) throw new Error(res.error);
      await downloadReceiptPdf(res.receipt);
    } catch (e) {
      setMsg({ kind: "error", text: "Could not load the receipt." });
    }
    if (mounted.current) setBusy("");
  };

  return (
    <div style={{ margin: "0 0 32px" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "1.2rem" }}>Payment requests</h2>
      {msg.text && <Alert inline kind={msg.kind}>{msg.text}</Alert>}
      <div className="admin-list">
        {requests.map((r) => (
          <div className="admin-row" key={r._id}>
            <div className="admin-row-main">
              <b>
                {r.course?.title || "Course"} {r.tier && <span className="plan-pill">{tierLabel(r.tier)}</span>}{" "}
                <span className={`admin-pill ${r.status === "paid" ? "lifetime" : "new"}`}>{r.status === "paid" ? "paid" : "payment due"}</span>
              </b>
              <span className="admin-row-meta">
                {r.course?.type === "internship" ? "Internship" : "Course"} · {formatINR(r.amount)}
                {r.note ? ` · ${r.note}` : ""}
              </span>
            </div>
            <div className="admin-row-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {r.status === "pending" ? (
                <button className="btn btn-solid" disabled={!!busy} onClick={() => pay(r)}>
                  {busy === r._id ? "Opening…" : `Pay ${formatINR(r.amount)}`}
                </button>
              ) : (
                <>
                  {r.course?.slug && <Link className="btn btn-ghost" to={`/learn/${r.course.slug}`}>Go to course →</Link>}
                  {r.paidPaymentId && (
                    <button className="btn btn-ghost" disabled={!!busy} onClick={() => receipt(r)}>
                      {busy === `rc-${r._id}` ? "Preparing…" : "Download Receipt"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
