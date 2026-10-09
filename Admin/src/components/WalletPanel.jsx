import { useState } from "react";
import { adminAdjustWallet } from "../services/api.js";

const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN") : "—");

// One student's wallet for the admin: balance, add / take away credit (whole
// rupees, with a note the student sees in their history) and recent entries.
// `wallet` is the shape from GET /admin/users/:id; `onChange` gets the updated
// wallet after each successful change. Used by Admin → Users and Admin → Wallet.
export default function WalletPanel({ userId, userName, wallet, onChange }) {
  const [form, setForm] = useState({ amount: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  // sign: 1 adds credit, -1 takes it away.
  const change = async (sign) => {
    if (busy) return;
    const rupees = Number(form.amount);
    if (!Number.isInteger(rupees) || rupees <= 0) { setMsg({ kind: "error", text: "Enter a whole number of rupees, like 500." }); return; }
    if (!window.confirm(`${sign > 0 ? "Add" : "Take away"} ${money(rupees)} ${sign > 0 ? "to" : "from"} ${userName}'s wallet?`)) return;
    setBusy(true);
    setMsg({ kind: "", text: "" });
    const res = await adminAdjustWallet(userId, sign * rupees, form.note.trim());
    setBusy(false);
    if (res.ok) {
      onChange(res.wallet);
      setForm({ amount: "", note: "" });
      setMsg({ kind: "ok", text: sign > 0 ? "Credit added." : "Credit taken away." });
    } else {
      setMsg({ kind: "error", text: res.error || "Could not update the wallet." });
    }
  };

  return (
    <div>
      <p className="form-note" style={{ margin: "0 0 12px" }}>
        Balance <b style={{ color: "var(--text)" }}>{money(wallet.balance)}</b>
        {" "}· received {money(wallet.earned)} · spent {money(wallet.spent)}.
        {" "}They use it to pay for courses and internships at checkout.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0, flex: "0 1 130px" }}>
          <label htmlFor="au-wallet-amount">Amount (₹)</label>
          <input id="au-wallet-amount" type="number" inputMode="numeric" min="1" step="1" value={form.amount}
            onChange={(e) => { setForm({ ...form, amount: e.target.value }); setMsg({ kind: "", text: "" }); }} />
        </div>
        <div className="field" style={{ margin: 0, flex: "1 1 200px" }}>
          <label htmlFor="au-wallet-note">Note (they'll see it)</label>
          <input id="au-wallet-note" maxLength={200} value={form.note} placeholder="e.g. Welcome credit"
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </div>
      <div className="admin-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-solid" onClick={() => change(1)} disabled={busy || !form.amount}>Add credit</button>
        <button type="button" className="btn btn-ghost admin-danger" onClick={() => change(-1)} disabled={busy || !form.amount}>Take away</button>
      </div>
      {msg.text && <p className={msg.kind === "ok" ? "form-note" : "form-error"} role="status">{msg.text}</p>}
      {wallet.entries.length > 0 && (
        <div className="admin-list" style={{ marginTop: 14 }}>
          {wallet.entries.map((en) => (
            <div className="admin-row" key={en.id}>
              <div className="admin-row-main">
                <b>{en.amount > 0 ? "+" : "−"}{money(Math.abs(en.amount))}</b>
                <span className="admin-row-meta">{en.label} · {fmtDate(en.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
