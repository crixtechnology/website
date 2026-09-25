import { useRef, useState } from "react";
import { updateAmbassadorProfile, requestAmbassadorPayout } from "../services/api.js";
import { referralLink, copyText } from "../utils/referral.js";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const day = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const KIT_LABEL = {
  not_sent: "Not sent yet",
  preparing: "Being prepared",
  shipped: "On its way",
  delivered: "Delivered",
};
const EARNING_LABEL = { on_hold: "On hold", available: "Payable", requested: "Payout requested", paid: "Paid" };

// The approved ambassador's home: their code and share links, what they've
// earned, payouts, the certificate and welcome kit. `data` is /api/me/ambassador
// (status "approved"); `reload` refetches it after a change.
export default function AmbassadorDashboard({ data, reload }) {
  const { program, stats, profile } = data;
  const [copied, setCopied] = useState("");
  const copyTimer = useRef(null);

  const link = referralLink(data.code);
  const shareText =
    `I'm a Crix Technology Campus Ambassador. Use my code ${data.displayCode} to get ${program.friendDiscountPercent}% off your first course or internship: ${link}`;

  const copy = async (which, text) => {
    const ok = await copyText(text);
    setCopied(ok ? which : "failed");
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(""), 1800);
  };

  // ---- payout request ----
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState({ kind: "", text: "" });
  const requestPayout = async () => {
    if (payoutBusy) return;
    setPayoutBusy(true);
    setPayoutMsg({ kind: "", text: "" });
    const res = await requestAmbassadorPayout();
    setPayoutBusy(false);
    if (res.ok) {
      setPayoutMsg({ kind: "ok", text: `Payout of ${money(res.amount)} requested. We'll send it to you and mark it paid here.` });
      reload();
    } else {
      setPayoutMsg({ kind: "error", text: res.error });
    }
  };

  // ---- payout details + kit address ----
  const [form, setForm] = useState({
    upiId: profile.upiId || "",
    bankHolder: profile.bankHolder || "",
    bankAccount: "", // never sent back by the server in full — typed again to change it
    bankIfsc: profile.bankIfsc || "",
    shippingAddress: profile.shippingAddress || "",
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState({ kind: "", text: "" });
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setSaveMsg({ kind: "", text: "" }); };

  const saveProfile = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    // The bank account number is only sent when re-typed; leaving it empty keeps the saved one.
    const fields = { upiId: form.upiId, bankHolder: form.bankHolder, bankIfsc: form.bankIfsc, shippingAddress: form.shippingAddress };
    if (form.bankAccount.trim()) fields.bankAccount = form.bankAccount;
    const res = await updateAmbassadorProfile(fields);
    setSaving(false);
    if (res.ok) {
      setSaveMsg({ kind: "ok", text: "Saved." });
      setForm((f) => ({ ...f, bankAccount: "" }));
      reload();
    } else {
      setSaveMsg({ kind: "error", text: res.error });
    }
  };

  const clearBank = async () => {
    if (!window.confirm("Remove your saved bank account details?")) return;
    const res = await updateAmbassadorProfile({ bankHolder: "", bankAccount: "", bankIfsc: "" });
    if (res.ok) { setForm((f) => ({ ...f, bankHolder: "", bankAccount: "", bankIfsc: "" })); reload(); }
    else setSaveMsg({ kind: "error", text: res.error });
  };

  return (
    <div className="amb-dash">
      <div className="ref-card">
        <span className="eyebrow">Your ambassador code</span>
        <h2 className="ref-title">You're a Crix Campus Ambassador.</h2>
        <p className="ref-lede">
          Students who use your code get <b>{program.friendDiscountPercent}% off</b> their first course or internship.
          You earn <b>{data.commissionPercent}%</b> of what each of them pays.
        </p>
        <div className="ref-code-row">
          <div className="ref-code" aria-label="Your ambassador code">{data.displayCode}</div>
          <div className="ref-actions">
            <button className="btn btn-solid" onClick={() => copy("code", data.displayCode)}>{copied === "code" ? "Copied ✓" : "Copy code"}</button>
            <button className="btn btn-ghost" onClick={() => copy("link", link)}>{copied === "link" ? "Link copied ✓" : "Copy link"}</button>
            <a className="btn btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
          </div>
          {copied === "failed" && <p className="form-error">Couldn't copy — select the code and copy it by hand.</p>}
        </div>
        <div className="ref-stats ref-stats--six">
          <div className="ref-stat"><b>{stats.referred}</b><span>Students joined</span></div>
          <div className="ref-stat"><b>{stats.paidCount}</b><span>Made a purchase</span></div>
          <div className="ref-stat"><b>{money(stats.total)}</b><span>Total earned</span></div>
          <div className="ref-stat"><b>{money(stats.onHold)}</b><span>On hold ({program.holdDays} days)</span></div>
          <div className="ref-stat ref-stat--accent"><b>{money(stats.available)}</b><span>Ready to pay out</span></div>
          <div className="ref-stat"><b>{money(stats.paid)}</b><span>Paid to you</span></div>
        </div>
      </div>

      <div className="amb-grid">
        <section className="amb-panel">
          <h3>Payouts</h3>
          <p className="amb-hint">
            Commission is held for {program.holdDays} days after a student pays, then becomes payable. Once
            {" "}{money(program.minPayoutRupees)} is ready you can request a payout; we send it by UPI / bank transfer and mark it paid here.
          </p>
          <button className="btn btn-solid" onClick={requestPayout} disabled={!data.canRequestPayout || payoutBusy}>
            {payoutBusy ? "Requesting…" : stats.available > 0 ? `Request payout · ${money(stats.available)}` : "Request payout"}
          </button>
          {!data.canRequestPayout && (
            <p className="amb-hint">
              {!profile.hasPayoutMethod
                ? "Add your UPI ID or bank details below first."
                : `Available now: ${money(stats.available)}. You can request once it reaches ${money(program.minPayoutRupees)}.`}
            </p>
          )}
          {payoutMsg.text && <p className={payoutMsg.kind === "ok" ? "ref-ok" : "form-error"}>{payoutMsg.text}</p>}
          {data.payouts.length > 0 && (
            <ul className="ref-list">
              {data.payouts.map((p) => (
                <li key={p._id}>
                  <span>{money(p.amount)} <small>· {day(p.requestedAt)} · {p.payTo}</small>{p.reference && <small> · ref {p.reference}</small>}</span>
                  <span className={`ref-pill${p.status === "paid" ? " ref-pill--paid" : ""}`}>{p.status === "requested" ? "Requested" : p.status === "paid" ? "Paid" : "Declined"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="amb-panel">
          <h3>Your perks</h3>
          {/* Certificates are handed over personally by the Crix team, not
              downloaded from the site — this row just shows its number/status. */}
          <div className="amb-perk">
            <div>
              <b>Ambassador certificate</b>
              <span>{data.certificate ? `No. ${data.certificate.number} · issued ${day(data.certificate.issuedAt)}` : "Being prepared"} · sent to you personally by the Crix team</span>
            </div>
            <span className={`ref-pill${data.certificate ? " ref-pill--paid" : ""}`}>{data.certificate ? "Issued" : "Pending"}</span>
          </div>
          <div className="amb-perk">
            <div>
              <b>Welcome kit</b>
              <span>{KIT_LABEL[data.kit.status] || data.kit.status}{data.kit.note ? ` — ${data.kit.note}` : ""}</span>
            </div>
            <span className={`ref-pill${data.kit.status === "delivered" || data.kit.status === "shipped" ? " ref-pill--paid" : ""}`}>{KIT_LABEL[data.kit.status]}</span>
          </div>
          {data.kit.status === "not_sent" && !profile.shippingAddress && (
            <p className="amb-hint">Add your address below so we know where to send your kit.</p>
          )}
        </section>
      </div>

      <section className="amb-panel">
        <h3>Your details</h3>
        <form onSubmit={saveProfile}>
          <div className="amb-form-grid">
            <div className="field"><label htmlFor="amb-upi">UPI ID</label>
              <input id="amb-upi" value={form.upiId} onChange={set("upiId")} placeholder="name@okbank" autoComplete="off" /></div>
            <div className="field"><label htmlFor="amb-holder">Bank account holder</label>
              <input id="amb-holder" value={form.bankHolder} onChange={set("bankHolder")} placeholder="As on the account" autoComplete="off" /></div>
            <div className="field"><label htmlFor="amb-acct">Bank account number</label>
              <input id="amb-acct" inputMode="numeric" value={form.bankAccount} onChange={set("bankAccount")} autoComplete="off"
                placeholder={profile.hasBankAccount ? `${profile.bankAccountMasked} (saved — type to change)` : "9–18 digits"} /></div>
            <div className="field"><label htmlFor="amb-ifsc">IFSC</label>
              <input id="amb-ifsc" value={form.bankIfsc} onChange={set("bankIfsc")} placeholder="HDFC0001234" autoComplete="off" style={{ textTransform: "uppercase" }} /></div>
          </div>
          <p className="amb-hint">Give a UPI ID, or the full bank details (holder, account number, IFSC) — either is enough. These are only used to pay you.</p>
          <div className="field"><label htmlFor="amb-address">Address for your welcome kit</label>
            <textarea id="amb-address" rows="3" value={form.shippingAddress} onChange={set("shippingAddress")} placeholder="House / hostel, street, city, PIN code, phone" /></div>
          {saveMsg.text && <p className={saveMsg.kind === "ok" ? "ref-ok" : "form-error"}>{saveMsg.text}</p>}
          <div className="ref-actions">
            <button className="btn btn-solid" type="submit" disabled={saving}>{saving ? "Saving…" : "Save details"}</button>
            {profile.hasBankAccount && <button className="btn btn-ghost" type="button" onClick={clearBank}>Remove bank details</button>}
          </div>
        </form>
      </section>

      <section className="amb-panel">
        <h3>Your students</h3>
        {data.earnings.length === 0 ? (
          <p className="amb-hint">Nobody has purchased with your code yet. Share it — your first commission will show up here.</p>
        ) : (
          <div className="amb-table-wrap">
            <table className="amb-table">
              <thead><tr><th>Student</th><th>Date</th><th>They paid</th><th>You earn</th><th>Status</th></tr></thead>
              <tbody>
                {data.earnings.map((e) => (
                  <tr key={e._id}>
                    <td>{e.friend}</td>
                    <td>{day(e.earnedOn)}</td>
                    <td>{money(e.paid)}</td>
                    <td><b>{money(e.amount)}</b> <small>({e.percent}%)</small></td>
                    <td>
                      <span className={`ref-pill${e.state === "paid" ? " ref-pill--paid" : ""}`}>{EARNING_LABEL[e.state]}</span>
                      {e.state === "on_hold" && <small> until {day(e.availableOn)}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
