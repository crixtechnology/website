import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetReferrals, adminGetReferralSettings, adminUpdateReferralSettings,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { useDebouncedLoad } from "../../hooks/useDebouncedLoad.js";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

// The referral programme: the rules (on/off, the friend's discount, the
// referrer's credit) and every referral made — who referred whom, whether the
// friend has paid yet, and what was earned.
export default function AdminReferrals() {
  usePageMeta({ title: "Referrals | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [referrals, setReferrals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const [settings, setSettings] = useState(null); // { enabled, refereeDiscountPercent, referrerCreditRupees } as form strings
  const [saving, setSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState({ kind: "", text: "" });

  const dropToLoginIfExpired = () => {
    if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
  };

  const load = async ({ q: query, status: st }) => {
    setLoading(true);
    const res = await adminGetReferrals(query, st);
    setLoading(false);
    if (res.ok) { setReferrals(res.referrals || []); setSummary(res.summary); setError(""); }
    else { setError(res.error || "Could not load referrals."); dropToLoginIfExpired(); }
  };
  useDebouncedLoad((key) => load(JSON.parse(key)), JSON.stringify({ q, status }));

  useEffect(() => {
    adminGetReferralSettings().then((res) => {
      if (res.ok) {
        setSettings({
          enabled: !!res.settings.enabled,
          refereeDiscountPercent: String(res.settings.refereeDiscountPercent),
          referrerCreditRupees: String(res.settings.referrerCreditRupees),
        });
      } else dropToLoginIfExpired();
    });
  }, []);

  const saveSettings = async (e) => {
    e.preventDefault();
    if (saving || !settings) return;
    setSaving(true);
    setSettingsMsg({ kind: "", text: "" });
    const res = await adminUpdateReferralSettings({
      enabled: settings.enabled,
      refereeDiscountPercent: Number(settings.refereeDiscountPercent),
      referrerCreditRupees: Number(settings.referrerCreditRupees),
    });
    setSaving(false);
    setSettingsMsg(res.ok
      ? { kind: "ok", text: "Saved. New referrals use these rules; ones already made keep what they were promised." }
      : { kind: "error", text: res.error || "Could not save." });
  };

  const setField = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Referrals</h1>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>Students share a code; friends get a welcome discount, and the referrer earns credit when the friend pays.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <form className="admin-form" onSubmit={saveSettings}>
          <h3 style={{ margin: "0 0 16px" }}>Rules</h3>
          {settings ? (
            <>
              <label className="check-row">
                <input type="checkbox" checked={settings.enabled} onChange={setField("enabled")} />
                <span>Referral programme is on (codes are accepted and rewards are earned)</span>
              </label>
              <div className="admin-form-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", marginTop: 14 }}>
                <div className="field"><label htmlFor="ref-discount">Friend's discount (% off first purchase)</label>
                  <input id="ref-discount" type="number" min="0" max="90" step="1" value={settings.refereeDiscountPercent} onChange={setField("refereeDiscountPercent")} /></div>
                <div className="field"><label htmlFor="ref-credit">Referrer's credit (₹ per friend who pays)</label>
                  <input id="ref-credit" type="number" min="0" max="100000" step="1" value={settings.referrerCreditRupees} onChange={setField("referrerCreditRupees")} /></div>
              </div>
              <p className="form-note" style={{ margin: "-4px 0 16px" }}>
                Credit is applied automatically against the referrer's next purchase, and an order never drops below ₹1. It is not paid out as cash.
              </p>
              {settingsMsg.text && <p className={settingsMsg.kind === "ok" ? "ref-ok" : "form-error"}>{settingsMsg.text}</p>}
              <button className="btn btn-solid" type="submit" disabled={saving}>{saving ? "Saving..." : "Save rules"}</button>
            </>
          ) : (
            <p style={{ color: "var(--muted)" }}>Loading…</p>
          )}
        </form>

        {summary && (
          <div className="ref-stats ref-stats--admin" style={{ marginTop: 28 }}>
            <div className="ref-stat"><b>{summary.total}</b><span>Referrals</span></div>
            <div className="ref-stat"><b>{summary.pending}</b><span>Waiting for a purchase</span></div>
            <div className="ref-stat"><b>{summary.rewarded}</b><span>Rewarded</span></div>
            <div className="ref-stat"><b>{money(summary.creditIssued)}</b><span>Credit issued</span></div>
            <div className="ref-stat"><b>{money(summary.creditRedeemed)}</b><span>Credit used</span></div>
            <div className="ref-stat ref-stat--accent"><b>{money(summary.creditOutstanding)}</b><span>Credit outstanding</span></div>
          </div>
        )}

        <div className="admin-filters" style={{ marginTop: 28 }}>
          <input className="admin-search" type="search" style={{ margin: 0 }} placeholder="Search by referrer or friend name / email..."
            value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search referrals" />
          <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="pending">Waiting for a purchase</option>
            <option value="rewarded">Rewarded</option>
          </select>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)", marginTop: 20 }}>Loading...</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : referrals.length === 0 ? (
          <p style={{ color: "var(--muted)", marginTop: 20 }}>{q || status ? "No referrals match that." : "No referrals yet."}</p>
        ) : (
          <div className="admin-list" style={{ marginTop: 20 }}>
            {referrals.map((r) => (
              <div className="admin-row" key={r._id}>
                <div className="admin-row-main">
                  <b>{r.referrer.name} <span style={{ color: "var(--muted)", fontWeight: 400 }}>referred</span> {r.referee.name}{" "}
                    <span className={`ref-pill${r.status === "rewarded" ? " ref-pill--paid" : ""}`}>{r.status === "rewarded" ? "Rewarded" : "Waiting"}</span></b>
                  <span className="admin-row-meta">
                    {r.referrer.email} → {r.referee.email} · joined {new Date(r.createdAt).toLocaleDateString("en-IN")}
                    {r.rewardedAt ? ` · paid ${new Date(r.rewardedAt).toLocaleDateString("en-IN")}` : ""}
                  </span>
                </div>
                <div className="admin-row-main" style={{ textAlign: "right" }}>
                  <span>Friend's discount: <b>{r.refereeDiscountPercent}%</b></span>
                  <span className="admin-row-meta">
                    {r.status === "rewarded"
                      ? `Friend paid ${r.friendPaid != null ? money(r.friendPaid) : "—"} · referrer earned ${money(r.reward)}`
                      : `${money(r.reward)} credit on their first purchase`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
