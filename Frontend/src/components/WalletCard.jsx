import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyWallet } from "../services/api.js";
import { formatINR } from "../utils/tiers.js";

const shortDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const PREVIEW = 6; // history rows shown before "Show all"

// The student's wallet on the Profile page: credit they've been given (by Crix, or
// earned from referrals), what it's been spent on, and how it's used. Credit is
// applied at checkout, and when it covers the whole price the buy popup offers
// "Pay with wallet" — see BuyModal in components/ui.jsx.
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
                <span>{e.label} <small>· {shortDate(e.createdAt)}</small></span>
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
