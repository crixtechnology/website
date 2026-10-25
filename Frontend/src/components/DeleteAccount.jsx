import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { Alert } from "./ui.jsx";
import { getDeletionSummary, sendDeletionCode, deleteMyAccount } from "../services/api.js";

const sectionStyle = { marginTop: 48, paddingTop: 28, borderTop: "1px solid var(--line, rgba(128,128,128,.25))" };

// The bottom of the profile page: a student permanently deleting their account
// (their right to erasure under the Digital Personal Data Protection Act 2023).
//   1. "Delete my account" shows exactly what goes and what the law makes us keep;
//   2. a code is emailed to the account's own address;
//   3. the code and a tick that they understand it can't be undone delete it,
//      and they're logged out.
export default function DeleteAccount() {
  const { user, logout } = useContext(UserContext);
  const navigate = useNavigate();
  const [phase, setPhase] = useState("idle"); // idle -> review -> code
  const [summary, setSummary] = useState(null);
  const [code, setCode] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ text: "", kind: "" });

  if (!user || user.role === "admin") return null;

  const review = async () => {
    if (busy) return;
    setBusy(true);
    setStatus({ text: "", kind: "" });
    const res = await getDeletionSummary();
    setBusy(false);
    if (!res.ok) { setStatus({ text: res.error, kind: "error" }); return; }
    setSummary(res.summary);
    setPhase("review");
  };

  const sendCode = async () => {
    if (busy) return;
    setBusy(true);
    setStatus({ text: "", kind: "" });
    const res = await sendDeletionCode();
    setBusy(false);
    if (!res.ok) { setStatus({ text: res.error, kind: "error" }); return; }
    setPhase("code");
    setStatus({ text: res.message, kind: "info" });
  };

  const confirmDelete = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code.trim())) { setStatus({ text: "Enter the 6-digit code from your email.", kind: "error" }); return; }
    if (!understood) { setStatus({ text: "Tick the box to confirm you understand this can't be undone.", kind: "error" }); return; }
    setBusy(true);
    setStatus({ text: "Deleting your account...", kind: "info" });
    const res = await deleteMyAccount(code.trim());
    if (!res.ok) { setBusy(false); setStatus({ text: res.error, kind: "error" }); return; }
    // The account no longer exists: drop the local session and leave the page.
    logout();
    navigate("/profile?deleted=1", { replace: true });
    // Same page, so nothing else scrolls back up to the confirmation.
    window.scrollTo(0, 0);
  };

  const cancel = () => { setPhase("idle"); setCode(""); setUnderstood(false); setStatus({ text: "", kind: "" }); };

  const losing = summary
    ? [
        summary.activeCourses > 0 && `access to your ${summary.activeCourses} active course${summary.activeCourses === 1 ? "" : "s"} or internship${summary.activeCourses === 1 ? "" : "s"}`,
        summary.walletCredits > 0 && `${summary.walletCredits} wallet credits`,
        summary.jobApplications > 0 && `${summary.jobApplications} careers application${summary.jobApplications === 1 ? "" : "s"} and any test results`,
      ].filter(Boolean)
    : [];

  return (
    <div style={sectionStyle}>
      <h2 style={{ margin: "0 0 8px", fontSize: "1.2rem" }}>Delete my account</h2>
      <p style={{ color: "var(--muted)", marginBottom: 18 }}>
        Permanently delete your account and the personal data we hold about you. This can't be undone.
      </p>

      {phase === "idle" && (
        <button className="btn btn-ghost" type="button" onClick={review} disabled={busy}>
          {busy ? "Loading..." : "Delete my account"}
        </button>
      )}

      {phase !== "idle" && summary && (
        <div role="region" aria-label="What deleting your account does" style={{
          padding: "14px 16px", borderRadius: 10, marginBottom: 18,
          background: "rgba(var(--teal-rgb),.06)", borderLeft: "3px solid var(--teal)",
        }}>
          <p style={{ margin: "0 0 8px" }}><b>What is deleted, straight away</b></p>
          <ul className="check-list" style={{ margin: "0 0 12px" }}>
            <li>Your profile: name, email, phone, education and password</li>
            <li>Your course and internship access, wallet credit and referrals</li>
            <li>Careers applications, uploaded CVs, aptitude tests and their webcam photos</li>
            <li>Notifications, and messages you sent us through the contact form</li>
          </ul>
          {losing.length > 0 && (
            <p style={{ margin: "0 0 12px" }}>You will lose {losing.join(", ").replace(/, ([^,]*)$/, " and $1")}. Nothing is refunded.</p>
          )}
          <p style={{ margin: 0, color: "var(--muted)" }}>
            <b style={{ color: "var(--text)" }}>What we keep:</b>{" "}
            {summary.paymentsKept > 0
              ? `the records of your ${summary.paymentsKept} payment${summary.paymentsKept === 1 ? "" : "s"} and ${summary.paymentsKept === 1 ? "its receipt" : "their receipts"}, with no link to an account, because Indian tax and accounting law requires us to.`
              : "nothing — there are no payment records on this account."}
          </p>
        </div>
      )}

      {phase === "review" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-solid" type="button" onClick={sendCode} disabled={busy} style={{ overflowWrap: "anywhere" }}>
            {busy ? "Sending code..." : `Email a code to ${user.email}`}
          </button>
          <button className="btn btn-ghost" type="button" onClick={cancel} disabled={busy}>Keep my account</button>
        </div>
      )}

      {phase === "code" && (
        <form onSubmit={confirmDelete}>
          <div className="field">
            <label htmlFor="del-otp">6-digit code</label>
            <input id="del-otp" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setStatus({ text: "", kind: "" }); }}
              inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code" placeholder="123456" disabled={busy} />
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "4px 0 16px", cursor: "pointer" }}>
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} disabled={busy} style={{ marginTop: 5 }} />
            <span>I understand my account and data will be deleted permanently, and this can't be undone.</span>
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-solid" type="submit" disabled={busy || !understood}>{busy ? "Deleting..." : "Delete my account permanently"}</button>
            <button className="btn btn-ghost" type="button" onClick={sendCode} disabled={busy}>Resend code</button>
            <button className="btn btn-ghost" type="button" onClick={cancel} disabled={busy}>Keep my account</button>
          </div>
        </form>
      )}

      <Alert kind={status.kind}>{status.text}</Alert>
    </div>
  );
}
