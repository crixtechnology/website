import { useContext, useEffect, useRef, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { Alert } from "./ui.jsx";
import { changePassword, requestPasswordReveal, verifyPasswordReveal } from "../services/api.js";

// How long a revealed password stays on screen before it hides itself.
const SHOW_SECONDS = 60;

const sectionStyle = { marginTop: 48, paddingTop: 28, borderTop: "1px solid var(--line, rgba(128,128,128,.25))" };

// The password half of the profile page:
//   1. Change password — asks for the current one, then a new one (twice).
//   2. Your password — for accounts created via Google, which were given a
//      generated starter password. Emails a code to the account's own address;
//      entering it shows the password for a minute. A password the user chose
//      themselves is stored as a one-way hash and can't be shown, so for those
//      accounts this says so instead of offering a button that can't work.
export default function PasswordSettings() {
  const { user, refreshUser } = useContext(UserContext);

  // ----- change password -----
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwStatus, setPwStatus] = useState({ text: "", kind: "" });
  const [pwSaving, setPwSaving] = useState(false);

  // ----- view starter password -----
  const [phase, setPhase] = useState("idle"); // idle -> code (emailed) -> shown
  const [otp, setOtp] = useState("");
  const [revealed, setRevealed] = useState("");
  const [revStatus, setRevStatus] = useState({ text: "", kind: "" });
  const [revBusy, setRevBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const hideTimer = useRef(null);

  const hasStarter = !!user?.hasDefaultPassword || (!user?.hasPassword && !!user?.isGoogleAccount);

  const hide = () => {
    clearTimeout(hideTimer.current);
    setRevealed("");
    setOtp("");
    setPhase("idle");
    setCopied(false);
  };
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  // The starter password stops existing once the user sets their own — make
  // sure a copy that's still on screen goes away with it.
  useEffect(() => { if (!hasStarter) hide(); }, [hasStarter]);

  if (!user) return null;

  const setP = (k) => (e) => { setPw({ ...pw, [k]: e.target.value }); setPwStatus({ text: "", kind: "" }); };

  const onChangePassword = async (e) => {
    e.preventDefault();
    if (pwSaving) return;
    if (!pw.current) { setPwStatus({ text: "Enter your current password.", kind: "error" }); return; }
    if (pw.next.length < 8) { setPwStatus({ text: "New password must be at least 8 characters.", kind: "error" }); return; }
    if (pw.next.length > 72) { setPwStatus({ text: "New password must be at most 72 characters.", kind: "error" }); return; }
    if (pw.next === pw.current) { setPwStatus({ text: "Choose a new password that's different from your current one.", kind: "error" }); return; }
    if (pw.next !== pw.confirm) { setPwStatus({ text: "The two new passwords don't match.", kind: "error" }); return; }

    setPwSaving(true);
    setPwStatus({ text: "Changing password...", kind: "info" });
    const res = await changePassword({ currentPassword: pw.current, newPassword: pw.next });
    setPwSaving(false);
    if (!res.ok) { setPwStatus({ text: res.error, kind: "error" }); return; }
    setPw({ current: "", next: "", confirm: "" });
    setPwStatus({ text: "Password changed.", kind: "success" });
    hide();
    refreshUser(); // hasDefaultPassword is now false
  };

  const sendCode = async () => {
    if (revBusy) return;
    setRevBusy(true);
    setRevStatus({ text: "", kind: "" });
    const res = await requestPasswordReveal();
    setRevBusy(false);
    if (!res.ok) {
      setRevStatus({ text: res.error, kind: "error" });
      if (res.code === "NOT_REVEALABLE") refreshUser();
      return;
    }
    setPhase("code");
    setRevStatus({ text: res.message, kind: "info" });
  };

  const showPassword = async (e) => {
    e.preventDefault();
    if (revBusy) return;
    if (!/^\d{6}$/.test(otp.trim())) { setRevStatus({ text: "Enter the 6-digit code from your email.", kind: "error" }); return; }
    setRevBusy(true);
    const res = await verifyPasswordReveal(otp.trim());
    setRevBusy(false);
    if (!res.ok) {
      setRevStatus({ text: res.error, kind: "error" });
      if (res.code === "NOT_REVEALABLE") refreshUser();
      return;
    }
    setRevealed(res.password);
    setPhase("shown");
    setRevStatus({ text: "", kind: "" });
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(hide, SHOW_SECONDS * 1000);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(revealed); setCopied(true); } catch (e) { /* clipboard blocked — the text is selectable */ }
  };

  return (
    <>
      <div style={sectionStyle}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.2rem" }}>Change password</h2>
        {!user.hasPassword ? (
          <p style={{ color: "var(--muted)" }}>
            This account doesn't have a password yet. Use "Your password" below to get your starter password first.
          </p>
        ) : (
          <form onSubmit={onChangePassword}>
            <p style={{ color: "var(--muted)", marginBottom: 18 }}>
              Enter your current password, then choose a new one.
              {hasStarter && " You signed in with Google, so your current password is the starter password shown below."}
              {!hasStarter && " Forgot it? Log out and use \"Forgot password\" on the login form."}
            </p>
            <div className="field">
              <label htmlFor="pw-current">Current password</label>
              <input id="pw-current" type="password" autoComplete="current-password" value={pw.current} onChange={setP("current")} disabled={pwSaving} />
            </div>
            <div className="field">
              <label htmlFor="pw-new">New password</label>
              <input id="pw-new" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={pw.next} onChange={setP("next")} disabled={pwSaving} />
            </div>
            <div className="field">
              <label htmlFor="pw-confirm">Confirm new password</label>
              <input id="pw-confirm" type="password" autoComplete="new-password" value={pw.confirm} onChange={setP("confirm")} disabled={pwSaving} />
            </div>
            <button className="btn btn-solid" type="submit" disabled={pwSaving} style={{ width: "100%" }}>
              {pwSaving ? "Changing..." : "Change password"}
            </button>
            <Alert kind={pwStatus.kind}>{pwStatus.text}</Alert>
          </form>
        )}
      </div>

      <div style={sectionStyle}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.2rem" }}>Your password</h2>
        {hasStarter ? (
          <>
            <p style={{ color: "var(--muted)", marginBottom: 18 }}>
              Because you signed in with Google, we created a password for your account so you can also log in with your
              email. To see it, we'll email a code to <b>{user.email}</b>. Once you choose your own password above, this
              one is removed and can't be shown again.
            </p>

            {phase === "idle" && (
              <button className="btn btn-ghost" type="button" onClick={sendCode} disabled={revBusy}>
                {revBusy ? "Sending code..." : "Email me a code"}
              </button>
            )}

            {phase === "code" && (
              <form onSubmit={showPassword}>
                <div className="field">
                  <label htmlFor="pw-otp">6-digit code</label>
                  <input id="pw-otp" value={otp} onChange={(e) => { setOtp(e.target.value); setRevStatus({ text: "", kind: "" }); }}
                    inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code" placeholder="123456" disabled={revBusy} />
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button className="btn btn-solid" type="submit" disabled={revBusy}>{revBusy ? "Checking..." : "Show my password"}</button>
                  <button className="btn btn-ghost" type="button" onClick={sendCode} disabled={revBusy}>Resend code</button>
                </div>
              </form>
            )}

            {phase === "shown" && (
              <div>
                <code style={{
                  display: "block", padding: "14px 16px", borderRadius: 10, fontSize: "1.1rem", letterSpacing: ".08em",
                  background: "rgba(var(--teal-rgb),.08)", borderLeft: "3px solid var(--teal)", userSelect: "all", wordBreak: "break-all",
                }}>{revealed}</code>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
                  <button className="btn btn-ghost" type="button" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
                  <button className="btn btn-ghost" type="button" onClick={hide}>Hide</button>
                  <span style={{ color: "var(--muted)", fontSize: ".8rem" }}>Hides itself after {SHOW_SECONDS} seconds.</span>
                </div>
              </div>
            )}
            <Alert kind={revStatus.kind}>{revStatus.text}</Alert>
          </>
        ) : (
          <p style={{ color: "var(--muted)" }}>
            Your password is one you chose, so it's stored in a form that can't be read back — not even by us. If you've
            lost it, use "Change password" above while you're logged in, or "Forgot password" on the login form.
          </p>
        )}
      </div>
    </>
  );
}
