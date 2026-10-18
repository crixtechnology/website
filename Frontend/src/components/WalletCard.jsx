import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyWallet, sendBonusCode, verifyBonusCode } from "../services/api.js";
import { Alert } from "./ui.jsx";
import { formatINR } from "../utils/tiers.js";

const shortDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const PREVIEW = 6; // history rows shown before "Show all"
// "Signup Bonus" and "Signup bonus" say the same thing: show the type alone.
const sameText = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// The student's wallet (Profile page, and "My Wallet" in My Dashboard): credit they've
// been given (signup bonus, the aptitude-test fee coming back, referrals, or by Crix),
// what it's been spent on, and how it's used. Credit is
// applied at checkout, and when it covers the whole price the buy popup offers
// "Pay with wallet" — see BuyModal in components/ui.jsx.
/* ---------- the signup bonus, waiting for the email to be verified ---------- */
function BonusVerify({ credits, onClaimed }) {
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setMsg({ kind: "", text: "" });
    const res = await sendBonusCode();
    setBusy(false);
    if (res.ok) setSentTo(res.sentTo || "your email");
    else setMsg({ kind: "error", text: res.error });
  };
  const verify = async (e) => {
    e.preventDefault();
    if (busy || !/^\d{6}$/.test(code.trim())) { setMsg({ kind: "error", text: "Enter the 6-digit code from the email." }); return; }
    setBusy(true);
    setMsg({ kind: "", text: "" });
    const res = await verifyBonusCode(code.trim());
    setBusy(false);
    if (res.ok) onClaimed(res.wallet);
    else setMsg({ kind: "error", text: res.error });
  };

  return (
    <div className="wallet-bonus" role="region" aria-label="Claim your signup bonus">
      <b>{credits} bonus credits are waiting for you</b>
      <p className="wallet-muted">Verify your email address to add them to your wallet.</p>
      {!sentTo ? (
        <button type="button" className="btn btn-solid" onClick={send} disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
      ) : (
        <form onSubmit={verify} className="wallet-bonus-form">
          <label htmlFor="bonus-code" className="wallet-muted">Enter the 6-digit code we sent to {sentTo}</label>
          <div className="wallet-bonus-row">
            <input id="bonus-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <button type="submit" className="btn btn-solid" disabled={busy}>{busy ? "Checking…" : "Verify"}</button>
          </div>
          <button type="button" className="link-btn" onClick={send} disabled={busy}>Send a new code</button>
        </form>
      )}
      <Alert inline kind={msg.kind || "info"}>{msg.text}</Alert>
    </div>
  );
}

export default function WalletCard() {
  const [wallet, setWallet] = useState(undefined); // undefined = loading, null = couldn't load
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyWallet().then((res) => { if (alive) setWallet(res.ok ? res.wallet : null); });
    return () => { alive = false; };
  }, []);

  if (wallet === undefined) return <div className="wallet-card" aria-busy="true"><span className="eyebrow">Wallet</span><p className="wallet-muted">Loading your wallet…</p></div>;
  if (wallet === null) return null; // a hiccup here shouldn't break the profile page

  const rows = showAll ? wallet.entries : wallet.entries.slice(0, PREVIEW);
  return (
    <section className="wallet-card" aria-labelledby="wallet-title">
      <span className="eyebrow">Wallet</span>
      <div className="wallet-balance">
        <h2 id="wallet-title" className="wallet-amount" aria-label={`Wallet balance ${formatINR(wallet.balance)}`}>{formatINR(wallet.balance)}</h2>
        <span className="wallet-muted">credit available</span>
      </div>
      <p className="wallet-lede">
        Use your credit to pay for any course or internship. It's taken off at checkout automatically — and if it covers the
        full price, you can pay with your wallet alone.
      </p>
      <ul className="check-list wallet-rules">
        <li>1 credit = ₹1, usable only for purchases on crixtechnology.com.</li>
        {wallet.usagePercent < 100 && <li>Credit can pay for up to {wallet.usagePercent}% of a purchase.</li>}
        <li>Credit can't be withdrawn as cash or transferred to anyone else.</li>
      </ul>
      {wallet.pendingBonus > 0 && <BonusVerify credits={wallet.pendingBonus} onClaimed={(w) => w && setWallet(w)} />}
      {wallet.reserved > 0 && (
        <p className="wallet-note" role="status">
          {formatINR(wallet.reserved)} is held by a checkout you started and haven't finished, so only {formatINR(wallet.available)} can be spent right now.
        </p>
      )}

      <div className="ref-stats wallet-stats">
        <div className="ref-stat"><b>{formatINR(wallet.earned)}</b><span>Credit received</span></div>
        <div className="ref-stat"><b>{formatINR(wallet.spent)}</b><span>Spent</span></div>
      </div>

      {wallet.entries.length === 0 ? (
        <p className="wallet-muted wallet-empty">
          No credit yet. You'll see it here when Crix adds some to your wallet, or when a friend you refer makes their first purchase.
        </p>
      ) : (
        <>
          <h3 className="wallet-history-title">History</h3>
          <ul className="ref-list wallet-history">
            {rows.map((e) => (
              <li key={e.id}>
                <span>
                  {e.type && <span className="wallet-type">{e.type}</span>}
                  {sameText(e.type, e.label) ? "" : `${e.label} `}
                  <small>· {shortDate(e.createdAt)}{e.expiresAt ? ` · valid till ${shortDate(e.expiresAt)}` : ""}</small>
                </span>
                <b className={e.amount > 0 ? "wallet-in" : "wallet-out"}>
                  {e.amount > 0 ? "+" : "−"}{formatINR(Math.abs(e.amount))}
                </b>
              </li>
            ))}
          </ul>
          {wallet.entries.length > PREVIEW && (
            <button type="button" className="link-btn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : `Show all ${wallet.entries.length}`}
            </button>
          )}
        </>
      )}

      <Link className="btn btn-ghost wallet-browse" to="/programs">Browse courses</Link>
    </section>
  );
}
