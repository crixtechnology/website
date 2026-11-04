import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getMyPaymentRequests, getPaymentRequestQuote, createPaymentRequestOrder, payPaymentRequestWithWallet, verifyPaymentRequest, getReceipt } from "../services/api.js";
import { loadRazorpayScript, openRazorpayCheckout, paymentFailedText, Alert, TermsCheckbox, ProfileGate, CheckoutExtras } from "./ui.jsx";
import { downloadReceiptPdf } from "../utils/receiptPdfLazy.js";
import { tierLabel, formatINR } from "../utils/tiers.js";
import { startsInFuture, formatStartDate } from "../utils/startDate.js";
import { PAYMENT_REQUESTS_EVENT } from "../hooks/usePendingPaymentRequests.js";

// Payment requests the admin sent this student — how Training + Internship is
// paid for. Pressing Pay on one opens its price breakdown (offer code, referral
// discount, wallet credit — CheckoutExtras, priced by the request's own quote),
// then Razorpay Checkout (confirmed at /payment-requests/verify) or, when the
// wallet covers it all, a wallet payment. Renders nothing when there are none.
// `onPaid` refreshes the course list.
export default function PaymentRequests({ onPaid }) {
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(""); // request id being paid / receipt being built
  const [msg, setMsg] = useState({ kind: "", text: "" });
  // One Terms & Conditions box for the list; every Pay button waits on it.
  const [agreed, setAgreed] = useState(false);
  // The request whose price breakdown is open, and what it was priced at.
  const [active, setActive] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [payable, setPayable] = useState(null);
  const [walletPays, setWalletPays] = useState(null);
  const mounted = useRef(true);
  const getQuote = useCallback((code) => getPaymentRequestQuote(active, code), [active]);

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

  const open = (r) => {
    setActive(r._id);
    setCouponCode("");
    setPayable(null);
    setWalletPays(null);
    setMsg({ kind: "", text: "" });
  };

  const paid = (r) => {
    setActive(null);
    setMsg({ kind: "success", text: `Payment confirmed — you now have access to ${r.course?.title || "it"}.` });
    load();
    onPaid && onPaid();
  };

  const payFromWallet = async (r) => {
    if (busy || !agreed) return;
    setBusy(r._id);
    setMsg({ kind: "info", text: "Paying from your wallet..." });
    const res = await payPaymentRequestWithWallet(r._id, couponCode);
    if (!mounted.current) return;
    setBusy("");
    if (res.ok) paid(r);
    else { setMsg({ kind: "error", text: res.error || "Could not pay from your wallet right now." }); load(); }
  };

  const pay = async (r) => {
    if (busy || !agreed) return;
    setBusy(r._id);
    setMsg({ kind: "", text: "" });
    const order = await createPaymentRequestOrder(r._id, couponCode);
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
    openRazorpayCheckout({
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
          paid(r);
        } else {
          setMsg({
            kind: "error",
            text: (v.error || "We received your payment") + " — if access doesn't appear shortly, contact us and we'll sort it out.",
          });
        }
      },
    }, (failure) => {
      if (!mounted.current) return;
      setBusy("");
      setMsg(failure ? { kind: "error", text: paymentFailedText(failure) } : { kind: "", text: "" });
    });
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
      {requests.some((r) => r.status === "pending") && (
        <ProfileGate>
          <TermsCheckbox checked={agreed} onChange={setAgreed} disabled={!!busy} what="these payments" />
        </ProfileGate>
      )}
      <div className="admin-list">
        {requests.map((r) => (
          <div className="admin-row" key={r._id}>
            <div className="admin-row-main">
              <b>
                {r.course?.title || "Training"} {r.tier && <span className="plan-pill">{tierLabel(r.tier)}</span>}{" "}
                <span className={`admin-pill ${r.status === "paid" ? "lifetime" : "new"}`}>{r.status === "paid" ? "paid" : "payment due"}</span>
              </b>
              <span className="admin-row-meta">
                Training + Internship · {formatINR(r.amount)}
                {r.note ? ` · ${r.note}` : ""}
              </span>
            </div>
            <div className="admin-row-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {r.status === "pending" ? (
                active === r._id ? (
                  <button className="btn btn-ghost" disabled={!!busy} onClick={() => setActive(null)}>Close</button>
                ) : (
                  <button className="btn btn-solid" disabled={!!busy} onClick={() => open(r)}>Pay {formatINR(r.amount)}</button>
                )
              ) : (
                <>
                  {startsInFuture(r.course)
                    ? <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>Starts on {formatStartDate(r.course.startsAt)}</span>
                    : r.course?.slug && <Link className="btn btn-ghost" to={`/learn/${r.course.slug}`}>{r.course.type === "internship" ? "Go to training →" : "Go to course →"}</Link>}
                  {r.paidPaymentId && (
                    <button className="btn btn-ghost" disabled={!!busy} onClick={() => receipt(r)}>
                      {busy === `rc-${r._id}` ? "Preparing…" : "Download Receipt"}
                    </button>
                  )}
                </>
              )}
            </div>
            {r.status === "pending" && active === r._id && (
              <div className="preq-pay" style={{ flexBasis: "100%", marginTop: 12 }}>
                {r.allowDiscounts === false ? (
                  // The amount is already the agreed price: nothing comes off it.
                  <p className="form-note" style={{ marginTop: 0 }}>This amount already includes your discount, so wallet credit and offer codes don't apply to it.</p>
                ) : (
                  <CheckoutExtras item={{ slug: r.course?.slug || r._id }} tier={r.tier} getQuote={getQuote}
                    onPayable={setPayable} onWalletCovers={setWalletPays} couponCode={couponCode} onCoupon={setCouponCode} />
                )}
                {walletPays != null ? (
                  <button className="btn btn-solid" disabled={!!busy || !agreed} onClick={() => payFromWallet(r)}>
                    {busy === r._id ? "Paying…" : `Pay ${formatINR(walletPays)} from wallet`}
                  </button>
                ) : (
                  <button className="btn btn-solid" disabled={!!busy || !agreed || (payable == null && r.allowDiscounts !== false)} onClick={() => pay(r)}>
                    {busy === r._id ? "Opening…" : `Pay ${formatINR(payable != null ? payable : r.amount)}`}
                  </button>
                )}
                {!agreed && <p className="form-note" style={{ marginTop: 8 }}>Tick the Terms &amp; Conditions box above to pay.</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
