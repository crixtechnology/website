import { useState } from "react";
import { adminGetWallets } from "../services/api.js";
import { useDebouncedLoad } from "../hooks/useDebouncedLoad.js";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

// Every student holding wallet credit, biggest balance first, with a search.
// `onPick(student)` opens that student's wallet in the panel above (Admin → Wallet).
export default function WalletBalances({ onPick }) {
  const [wallets, setWallets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async (query) => {
    setLoading(true);
    const res = await adminGetWallets(query);
    setLoading(false);
    if (res && res.ok) { setWallets(res.wallets || []); setSummary(res.summary || null); }
  };
  useDebouncedLoad(load, q);

  return (
    <div style={{ marginTop: 40 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: "1.2rem" }}>Wallet balances</h2>
      {summary && (
        <p className="form-note" style={{ margin: "0 0 14px" }}>
          {summary.holders} student{summary.holders === 1 ? "" : "s"} with wallet history · {money(summary.outstanding)} of credit outstanding in total.
        </p>
      )}
      <input className="admin-search" type="search" placeholder="Search by name or email..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search wallet balances" />
      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading...</p>
      ) : wallets.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>{q ? "No wallets match that." : "No student has wallet credit yet."}</p>
      ) : (
        <div className="admin-list">
          {wallets.map((w) => (
            <div className="admin-row" key={w._id}>
              <div className="admin-row-main">
                <b>{w.name}</b>
                <span className="admin-row-meta">{w.email}{w.phone ? ` · ${w.phone}` : ""}</span>
              </div>
              <div className="admin-row-main" style={{ textAlign: "right" }}><b>{money(w.balance)}</b></div>
              <div className="admin-row-actions">
                <button className="btn btn-ghost" onClick={() => onPick(w)}>Adjust</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
