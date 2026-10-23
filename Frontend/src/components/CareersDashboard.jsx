import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getOpenings, getMyJobApplications, applyForRole, createTestFeeOrder, verifyTestFee, unlockFreeTest, getReceipt,
  getNotifications, markNotificationsRead,
} from "../services/api.js";
import { loadRazorpayScript, Alert, burstConfetti, TermsCheckbox, ProfileGate } from "./ui.jsx";
import { downloadReceiptPdf } from "../utils/receiptPdfLazy.js";
import { formatINR } from "../utils/tiers.js";
import { defaultTerms, feeBoxPoints, formatIST } from "../data/careers.js";

// The careers sections of My Dashboard (pages/student/MyCourses.jsx):
//   <ApplyTab>         pick a role, pay the test fee, start the aptitude test
//   <ApplicationsTab>  where each application stands, interview details, receipt
//   <DashboardNotices> unread notifications (status changes, credit added)
// "My Wallet" is the existing <WalletCard>.

// An application that ended without an offer no longer blocks applying again.
const CLOSED = ["not_shortlisted", "rejected"];
export const openApplicationFor = (applications, opening) =>
  applications.find((a) => a.opening && a.opening._id === opening._id && !CLOSED.includes(a.status));

// The pill beside a role or an application.
const PILL_CLASS = {
  payment_pending: "read", test_pending: "new", submitted: "new", shortlisted: "lifetime",
  interview_scheduled: "lifetime", selected: "lifetime", not_shortlisted: "expired", rejected: "expired",
};
export function StatusPill({ application }) {
  return <span className={`admin-pill ${PILL_CLASS[application.status] || "read"}`}>{application.statusLabel}</span>;
}

/* ---------- unread notifications ---------- */
export function DashboardNotices() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let alive = true;
    getNotifications().then((res) => { if (alive && res.ok) setItems((res.notifications || []).filter((n) => !n.read)); });
    return () => { alive = false; };
  }, []);
  if (items.length === 0) return null;
  const dismiss = () => { markNotificationsRead(); setItems([]); };
  return (
    <div className="dash-notices" role="status">
      <div className="dash-notices-head">
        <b>Notifications</b>
        <button type="button" className="link-btn" onClick={dismiss}>Mark all as read</button>
      </div>
      <ul>
        {items.slice(0, 5).map((n) => (
          <li key={n._id}>
            <b>{n.title}</b>
            <span>{n.body}</span>
            <small>{formatIST(n.createdAt)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- "I am 18 or older" — the aptitude test is for adults only ---------- */
export function AdultCheckbox({ checked, onChange, disabled = false }) {
  return (
    <label className="check-row adult-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>I confirm I am 18 years of age or older. The aptitude test, with webcam monitoring, is open to adults only.</span>
    </label>
  );
}

/* ---------- paying the aptitude-test fee ----------
   Used by the Careers page's pay popup and the dashboard's Apply tab. Applies
   for the role (or reuses the open application for it), creates the order for
   the server's fee and opens Razorpay Checkout. Only call it once the Terms &
   Conditions box is ticked. Resolves once Checkout is done with:
     { ok: true, applicationId, amount }      paid and verified — the test is unlocked
     { ok: false, dismissed: true }           the candidate closed Checkout
     { ok: false, error, applicationId? }     anything else, with a message to show
   `onConfirming` fires when Razorpay reports success and the server check starts. */
export async function checkoutTestFee({ opening, user, onConfirming }) {
  const applied = await applyForRole(opening.slug);
  if (!applied.ok) return { ok: false, error: applied.error || "Could not apply right now." };
  const applicationId = applied.application._id;
  const order = await createTestFeeOrder(applicationId);
  if (!order.ok) return { ok: false, applicationId, error: order.error || "Could not start payment right now." };
  const scriptOk = await loadRazorpayScript();
  if (!scriptOk || !window.Razorpay) {
    return { ok: false, applicationId, error: "Could not load the payment gateway. Check your connection and try again." };
  }
  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: "Crix Technology",
      description: `Aptitude test — ${opening.title}`,
      prefill: { name: user?.name || "", email: user?.email || "", contact: user?.phone || "" },
      theme: { color: "#14C9C9" },
      handler: async (resp) => {
        onConfirming && onConfirming();
        // The server checks the payment's signature; nothing is unlocked on the browser's word.
        const v = await verifyTestFee(resp);
        resolve(v.ok
          ? { ok: true, applicationId, amount: order.amount }
          : { ok: false, applicationId, error: (v.error || "We received your payment") + " — if your test doesn't unlock shortly, contact us and we'll sort it out." });
      },
      modal: { ondismiss: () => resolve({ ok: false, dismissed: true, applicationId }) },
    });
    rzp.open();
  });
}

/* ---------- a free role: no fee, the test unlocks on the spot ----------
   Same shape as checkoutTestFee's results. Only call it once the Terms &
   Conditions and 18+ boxes are ticked. */
export async function unlockFreeRole({ opening }) {
  const applied = await applyForRole(opening.slug);
  if (!applied.ok) return { ok: false, error: applied.error || "Could not apply right now." };
  const applicationId = applied.application._id;
  // Already unlocked: fine. Already taken (or closed): say so, don't claim it's unlocked.
  if (applied.application.status === "test_pending") return { ok: true, applicationId };
  if (applied.application.status !== "payment_pending") {
    return { ok: false, applicationId, error: "You've already taken the test for this role — see My Applications for where it stands." };
  }
  const r = await unlockFreeTest(applicationId);
  return r.ok ? { ok: true, applicationId } : { ok: false, applicationId, error: r.error };
}

// Free roles (the admin's choice per role) carry no registration fee.
export const isFreeRole = (opening) => !!opening && opening.feeRequired === false;

/* ---------- Apply / Aptitude Test ---------- */
// `initialRole` is the slug of the role chosen on the Careers page, if any.
// `onChange` lets the dashboard refresh anything that depends on the wallet.
export function ApplyTab({ user, initialRole, onGoToApplications, onChange }) {
  const [openings, setOpenings] = useState(null); // null = loading
  const [applications, setApplications] = useState([]);
  const [terms, setTerms] = useState(defaultTerms);
  const [role, setRole] = useState(initialRole || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [agreed, setAgreed] = useState(false);
  const [adult, setAdult] = useState(false);
  const mounted = useRef(true);
  const payBtn = useRef(null);

  const load = async () => {
    const [o, a] = await Promise.all([getOpenings(), getMyJobApplications()]);
    if (!mounted.current) return;
    setOpenings(o.ok ? o.openings || [] : []);
    if (a.ok) { setApplications(a.applications || []); if (a.terms) setTerms({ ...defaultTerms, ...a.terms }); }
    else if (o.ok && o.terms) setTerms({ ...defaultTerms, ...o.terms });
  };

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, []);

  // Open on the role that was chosen on the Careers page, else the first one.
  useEffect(() => {
    if (!openings || openings.length === 0) return;
    if (!openings.some((o) => o.slug === role)) setRole((openings.find((o) => o.slug === initialRole) || openings[0]).slug);
  }, [openings, initialRole, role]);

  if (openings === null) return <p style={{ color: "var(--muted)" }}>Loading...</p>;
  if (openings.length === 0) {
    return (
      <p style={{ color: "var(--muted)" }}>
        There are no open roles right now. Keep an eye on the <Link to="/careers">Careers page</Link> for new openings.
      </p>
    );
  }

  const selected = openings.find((o) => o.slug === role) || openings[0];
  const application = openApplicationFor(applications, selected);
  const status = application ? application.status : "none";
  const attempt = application ? application.attempt : null;
  const free = isFreeRole(selected);

  const pay = async () => {
    if (busy || !agreed || !adult) return;
    setBusy(true);
    setMsg({ kind: "", text: "" });
    const r = free
      ? await unlockFreeRole({ opening: selected })
      : await checkoutTestFee({
        opening: selected,
        user,
        onConfirming: () => { if (mounted.current) setMsg({ kind: "info", text: "Confirming your payment..." }); },
      });
    if (!mounted.current) return;
    setBusy(false);
    if (r.ok) {
      setMsg({ kind: "success", text: free ? "Your test is unlocked." : `Payment confirmed — ${r.amount / 100} credits are in your wallet and your test is unlocked.` });
      burstConfetti(payBtn.current);
      await load();
      onChange && onChange();
    } else {
      setMsg(r.dismissed ? { kind: "", text: "" } : { kind: "error", text: r.error });
      if (r.dismissed || r.applicationId) load();
    }
  };

  return (
    <div className="apply-grid">
      <fieldset className="plan-picker" disabled={busy}>
        <legend>Choose a role</legend>
        {openings.map((o) => {
          const mine = openApplicationFor(applications, o);
          return (
            <label className={`plan-option${selected.slug === o.slug ? " is-selected" : ""}`} key={o.slug}>
              <input type="radio" name="apply-role" value={o.slug} checked={selected.slug === o.slug}
                onChange={() => { setRole(o.slug); setMsg({ kind: "", text: "" }); }} />
              <span className="plan-option-head">
                <b>{o.title}</b>
                {mine && <span className="role-status"><StatusPill application={mine} /></span>}
              </span>
              <span className="plan-option-sub">{o.summary}</span>
              <span className="plan-option-sub">
                {o.test.questions} questions · {o.test.durationMinutes} minutes · {isFreeRole(o) ? "Free" : formatINR(terms.testFee)} · {o.stipend}
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="apply-panel">
        <span className="eyebrow">Aptitude test</span>
        <h3>{selected.title}</h3>

        {(status === "none" || status === "payment_pending") && free ? (
          <>
            <p className="form-note" style={{ marginTop: 0 }}>
              There's no registration fee for this role. Accept the terms to unlock your aptitude test — you can take it straight away.
            </p>
            <AdultCheckbox checked={adult} onChange={setAdult} disabled={busy} />
            <TermsCheckbox checked={agreed} onChange={setAgreed} disabled={busy} what="the aptitude test" />
            <button ref={payBtn} className="btn btn-solid" disabled={busy || !agreed || !adult} onClick={pay}>
              {busy ? "Please wait..." : "Unlock Free Test"}
            </button>
          </>
        ) : status === "none" || status === "payment_pending" ? (
          <>
            <p className="form-note" style={{ marginTop: 0 }}>
              Pay the test fee to unlock your aptitude test. You can take it straight away, and the whole fee comes back as wallet credit.
            </p>
            <dl className="order-summary">
              <div><dt>Aptitude test fee</dt><dd>{formatINR(terms.testFee)}</dd></div>
              <div className="is-off"><dt>Returned as wallet credit</dt><dd>+{terms.testFee} credits</dd></div>
              <div className="is-total"><dt>You pay</dt><dd>{formatINR(terms.testFee)}</dd></div>
            </dl>
            <ProfileGate>
              <AdultCheckbox checked={adult} onChange={setAdult} disabled={busy} />
              <TermsCheckbox checked={agreed} onChange={setAgreed} disabled={busy} what="the aptitude test fee" />
              <button ref={payBtn} className="btn btn-solid" disabled={busy || !agreed || !adult} onClick={pay}>
                {busy ? "Please wait..." : `Pay ${formatINR(terms.testFee)} & Take Test`}
              </button>
            </ProfileGate>
            <ul className="check-list apply-rules">
              {feeBoxPoints(terms).filter((p) => !/signup bonus/i.test(p)).map((p) => <li key={p}>{p}</li>)}
            </ul>
          </>
        ) : status === "test_pending" ? (
          <>
            <p className="form-note" style={{ marginTop: 0 }}>
              {attempt
                ? "Your test is in progress. The timer keeps running while you're away — go back to it now."
                : `${free ? "Your" : "Payment received — your"} test is unlocked. You have ${selected.test.durationMinutes} minutes for ${selected.test.questions} questions, and one attempt. Find a quiet place with a steady connection and a working webcam before you start.`}
            </p>
            <Link ref={payBtn} className="btn btn-solid" to={`/test/${application._id}`}>{attempt ? "Resume test →" : "Start test →"}</Link>
          </>
        ) : (
          <>
            <p className="form-note" style={{ marginTop: 0 }}>
              You've taken the test for this role. Current status: <b style={{ color: "var(--text)" }}>{application.statusLabel}</b>.
              {status === "submitted" ? " You'll get your shortlisting result within 7 days." : ""}
            </p>
            <button className="btn btn-ghost" onClick={onGoToApplications}>See My Applications →</button>
          </>
        )}
        <Alert inline kind={msg.kind || "info"}>{msg.text}</Alert>
      </div>
    </div>
  );
}

/* ---------- My Applications ---------- */
// The path every application follows, and how far along a given status is.
const TRACK = ["Test pending", "Submitted", "Shortlisted", "Interview scheduled", "Selected"];
const TRACK_INDEX = { payment_pending: -1, test_pending: 0, submitted: 1, shortlisted: 2, not_shortlisted: 2, interview_scheduled: 3, selected: 4, rejected: 4 };
const TRACK_STOP = { not_shortlisted: "Not shortlisted", rejected: "Rejected" };

function StatusTrack({ status }) {
  const at = TRACK_INDEX[status] ?? -1;
  const stop = TRACK_STOP[status];
  return (
    <ol className="status-track" aria-label="Application progress">
      {TRACK.map((label, i) => {
        const isStop = stop && i === at;
        // A finished application has nothing "current": every step up to it is done.
        const state = isStop ? "stop" : i < at || (i === at && status === "selected") ? "done" : i === at ? "now" : "";
        return <li key={label} className={state} aria-current={i === at ? "step" : undefined}>{isStop ? stop : label}</li>;
      })}
    </ol>
  );
}

const ENDED = {
  time_up: "Time ran out, so it was submitted automatically.",
  violations: "It was submitted automatically after the limit on test-rule warnings was reached.",
};

export function ApplicationsTab({ onGoToApply }) {
  const [applications, setApplications] = useState(null); // null = loading
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getMyJobApplications().then((res) => { if (alive) setApplications(res.ok ? res.applications || [] : []); });
    return () => { alive = false; };
  }, []);

  const receipt = async (a) => {
    if (busy) return;
    setBusy(a._id);
    setError("");
    try {
      const res = await getReceipt(a.paidPaymentId);
      if (!res.ok) throw new Error(res.error);
      await downloadReceiptPdf(res.receipt);
    } catch (e) {
      setError("Could not load the receipt.");
    }
    setBusy("");
  };

  if (applications === null) return <p style={{ color: "var(--muted)" }}>Loading...</p>;
  if (applications.length === 0) {
    return (
      <p style={{ color: "var(--muted)" }}>
        You haven't applied for a role yet. <button type="button" className="link-btn" onClick={onGoToApply}>Apply and take the aptitude test →</button>
      </p>
    );
  }

  return (
    <>
      {error && <Alert inline kind="error">{error}</Alert>}
      <div className="admin-list">
        {applications.map((a) => {
          const t = a.attempt;
          return (
            <div className="admin-row job-app" key={a._id}>
              <div className="job-app-top">
                <div className="admin-row-main">
                  <b>{a.opening?.title || "Role"} <StatusPill application={a} /></b>
                  <span className="admin-row-meta">
                    Applied {formatIST(a.createdAt, false)}
                    {a.paidAt ? ` · test fee paid ${formatIST(a.paidAt, false)}` : a.opening?.feeRequired === false ? " · free role" : " · test fee not paid yet"}
                    {t && t.submittedAt ? ` · test submitted ${formatIST(t.submittedAt)}` : ""}
                  </span>
                </div>
                <div className="admin-row-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {a.status === "payment_pending" && <button className="btn btn-solid" onClick={onGoToApply}>Pay &amp; take test</button>}
                  {a.status === "test_pending" && <Link className="btn btn-solid" to={`/test/${a._id}`}>{t ? "Resume test →" : "Start test →"}</Link>}
                  {a.paidPaymentId && (
                    <button className="btn btn-ghost" disabled={!!busy} onClick={() => receipt(a)}>
                      {busy === a._id ? "Preparing…" : "Download Receipt"}
                    </button>
                  )}
                </div>
              </div>

              {a.status !== "payment_pending" && <StatusTrack status={a.status} />}

              {a.status === "submitted" && (
                <p className="form-note" style={{ marginBottom: 0 }}>
                  {ENDED[t?.submitReason] ? `${ENDED[t.submitReason]} ` : ""}Shortlisting result within 7 days — we'll email you, and it will show here.
                </p>
              )}
              {a.interview && (
                <div className="interview-box">
                  <b>Online interview:</b> {formatIST(a.interview.at)}
                  {a.interview.link && (
                    <> · <a className="admin-link allow-copy" href={a.interview.link} target="_blank" rel="noopener noreferrer">Join the meeting</a></>
                  )}
                </div>
              )}
              {a.status === "shortlisted" && <p className="form-note" style={{ marginBottom: 0 }}>You're shortlisted. We'll share your interview date, time and meeting link here and by email.</p>}
              {a.status === "selected" && <p className="form-note" style={{ marginBottom: 0 }}>Congratulations — you're selected! Your offer letter is on its way by email.</p>}
              {CLOSED.includes(a.status) && <p className="form-note" style={{ marginBottom: 0 }}>Thank you for applying. You're welcome to apply again — your wallet credits are still yours to use.</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}
