import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { changePassword } from "../services/api.js";
import { Alert, useBodyScrollLock } from "./ui.jsx";

// Shown after logging in with a temporary password an admin handed out
// (Admin → Users → Reset password): the student chooses their own before
// carrying on. It can't be closed — only completed, or left by logging out.
export default function SetNewPassword() {
  const { user, isLoggedIn, takeTempPassword, refreshUser, logout } = useContext(UserContext);
  const navigate = useNavigate();
  const open = isLoggedIn && !!user?.mustChangePassword;
  const [temp, setTemp] = useState("");
  const [knowsTemp, setKnowsTemp] = useState(false);
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useBodyScrollLock(open);

  // The temporary password they just logged in with, if this tab still has it —
  // otherwise (e.g. after a reload) they type it again.
  useEffect(() => {
    if (!open) return;
    const held = takeTempPassword();
    setTemp(held);
    setKnowsTemp(!!held);
    setPw({ next: "", confirm: "" });
    setStatus("");
  }, [open, takeTempPassword]);

  if (!open) return null;

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!temp) { setStatus("Enter the temporary password we gave you."); return; }
    if (pw.next.length < 8) { setStatus("Your new password must be at least 8 characters."); return; }
    if (pw.next.length > 72) { setStatus("Your new password must be at most 72 characters."); return; }
    if (pw.next !== pw.confirm) { setStatus("The two passwords don't match."); return; }
    setSaving(true);
    setStatus("");
    const res = await changePassword({ currentPassword: temp, newPassword: pw.next });
    setSaving(false);
    if (!res.ok) {
      // A wrong remembered value shouldn't leave them stuck: let them type it.
      if (/current password/i.test(res.error || "")) setKnowsTemp(false);
      setStatus(res.error || "Could not save your new password.");
      return;
    }
    setTemp("");
    setPw({ next: "", confirm: "" });
    await refreshUser();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="set-pw-title">
        <span className="eyebrow">Account security</span>
        <h3 id="set-pw-title" style={{ margin: "12px 0 6px" }}>Choose your new password</h3>
        <p className="form-note" style={{ marginTop: 0 }}>
          You logged in with a temporary password. Pick one of your own to keep using your account.
        </p>
        <form onSubmit={save}>
          {!knowsTemp && (
            <div className="field"><label htmlFor="setpw-temp">Temporary password</label>
              <input id="setpw-temp" type="password" value={temp} onChange={(e) => setTemp(e.target.value)}
                autoComplete="current-password" disabled={saving} /></div>
          )}
          <div className="field"><label htmlFor="setpw-new">New password</label>
            <input id="setpw-new" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })}
              placeholder="At least 8 characters" autoComplete="new-password" disabled={saving} autoFocus /></div>
          <div className="field"><label htmlFor="setpw-confirm">Confirm new password</label>
            <input id="setpw-confirm" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              placeholder="Repeat the new password" autoComplete="new-password" disabled={saving} /></div>
          {status && <Alert inline kind="error">{status}</Alert>}
          <button className="btn btn-solid" type="submit" disabled={saving} style={{ width: "100%", marginTop: 8 }}>
            {saving ? "Saving..." : "Save new password"}
          </button>
          <button className="btn btn-ghost" type="button" disabled={saving} style={{ width: "100%", marginTop: 10 }}
            onClick={() => { logout(); navigate("/"); }}>
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
