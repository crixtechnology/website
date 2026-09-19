import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetAmbassadors, adminGetAmbassador, adminUpdateAmbassador, adminVoidEarning,
  adminGetAmbassadorPayouts, adminUpdateAmbassadorPayout, adminGetAmbassadorSettings, adminUpdateAmbassadorSettings,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { useDebouncedLoad } from "../../hooks/useDebouncedLoad.js";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const KIT_OPTIONS = [["not_sent", "Not sent"], ["preparing", "Preparing"], ["shipped", "Shipped"], ["delivered", "Delivered"]];

// Campus ambassadors: review applications, set commissions, track welcome kits,
// pay out requested commission by UPI / bank and record the transaction, and
// edit the programme's rules.
export default function AdminAmbassadors() {
  usePageMeta({ title: "Campus Ambassadors | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [error, setError] = useState("");

  const fail = (res, fallback) => {
    setError(res.error || fallback);
    if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
  };

  // ---------- rules ----------
  const [settings, setSettings] = useState(null);
  const [settingsMsg, setSettingsMsg] = useState({ kind: "", text: "" });
  const [savingSettings, setSavingSettings] = useState(false);
  useEffect(() => {
    adminGetAmbassadorSettings().then((res) => {
      if (!res.ok) return fail(res, "Could not load the rules.");
      const s = res.settings;
      setSettings({ enabled: !!s.enabled, defaultCommissionPercent: String(s.defaultCommissionPercent), holdDays: String(s.holdDays), minPayoutRupees: String(s.minPayoutRupees), perks: (s.perks || []).join("\n") });
    });
  }, []);
  const setS = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const saveSettings = async (e) => {
    e.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    setSettingsMsg({ kind: "", text: "" });
    const res = await adminUpdateAmbassadorSettings({
      enabled: settings.enabled,
      defaultCommissionPercent: Number(settings.defaultCommissionPercent),
      holdDays: Number(settings.holdDays),
      minPayoutRupees: Number(settings.minPayoutRupees),
      perks: settings.perks.split("\n").map((p) => p.trim()).filter(Boolean),
    });
    setSavingSettings(false);
    setSettingsMsg(res.ok ? { kind: "ok", text: "Saved. New referrals use the new commission; existing ones keep the % they were promised." } : { kind: "error", text: res.error });
  };

  // ---------- payouts ----------
  const [payoutFilter, setPayoutFilter] = useState("requested");
  const [payouts, setPayouts] = useState([]);
  const loadPayouts = async (filter = payoutFilter) => {
    const res = await adminGetAmbassadorPayouts(filter);
    if (res.ok) setPayouts(res.payouts || []); else fail(res, "Could not load payouts.");
  };
  useEffect(() => { loadPayouts(payoutFilter); }, [payoutFilter]);

  const markPaid = async (p) => {
    const reference = window.prompt(`Paying ${money(p.amount)} to ${p.ambassador.name}\n${p.payTo}\n\nTransaction reference (UTR / UPI ref):`);
    if (reference === null) return;
    const res = await adminUpdateAmbassadorPayout(p._id, { action: "paid", reference });
    if (res.ok) { loadPayouts(); loadList(query); } else setError(res.error);
  };
  const decline = async (p) => {
    const note = window.prompt(`Decline this ${money(p.amount)} payout? The commission goes back to the ambassador to request again.\n\nReason (shown in their history):`, "");
    if (note === null) return;
    const res = await adminUpdateAmbassadorPayout(p._id, { action: "rejected", note });
    if (res.ok) { loadPayouts(); loadList(query); } else setError(res.error);
  };

  // ---------- ambassadors ----------
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [list, setList] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const query = { q, status };
  const loadList = async ({ q: text, status: st }) => {
    setLoading(true);
    const res = await adminGetAmbassadors(text, st);
    setLoading(false);
    if (res.ok) { setList(res.ambassadors || []); setSummary(res.summary); setError(""); } else fail(res, "Could not load ambassadors.");
  };
  useDebouncedLoad((key) => loadList(JSON.parse(key)), JSON.stringify(query));

  const setStatusOf = async (a, next) => {
    const verb = { approved: "Approve", rejected: "Reject", suspended: "Suspend", applied: "Move back to applied" }[next];
    if (!window.confirm(`${verb} ${a.user.name}?`)) return;
    const res = await adminUpdateAmbassador(a._id, { status: next });
    if (res.ok) loadList(query); else setError(res.error);
  };

  // ---------- one ambassador, expanded ----------
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [edit, setEdit] = useState(null);
  const [editMsg, setEditMsg] = useState({ kind: "", text: "" });
  const openRow = async (a) => {
    if (openId === a._id) { setOpenId(null); return; }
    setOpenId(a._id);
    setDetail(null);
    setEdit({ commissionPercent: a.commissionOverride == null ? "" : String(a.commissionOverride), kitStatus: a.kitStatus, kitNote: a.kitNote || "", adminNote: a.adminNote || "" });
    setEditMsg({ kind: "", text: "" });
    const res = await adminGetAmbassador(a._id);
    if (res.ok) setDetail(res); else setError(res.error);
  };
  const saveEdit = async (a) => {
    setEditMsg({ kind: "", text: "" });
    const res = await adminUpdateAmbassador(a._id, {
      commissionPercent: edit.commissionPercent.trim() === "" ? null : Number(edit.commissionPercent),
      kitStatus: edit.kitStatus, kitNote: edit.kitNote, adminNote: edit.adminNote,
    });
    if (res.ok) { setEditMsg({ kind: "ok", text: "Saved." }); loadList(query); } else setEditMsg({ kind: "error", text: res.error });
  };
  const toggleVoid = async (a, earning) => {
    const res = await adminVoidEarning(earning._id, !earning.void);
    if (!res.ok) { setError(res.error); return; }
    const fresh = await adminGetAmbassador(a._id);
    if (fresh.ok) setDetail(fresh);
    loadList(query);
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Campus ambassadors</h1>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>Applications, commissions, welcome kits and payouts.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>
        {error && <p className="form-error">{error}</p>}

        {summary && (
          <div className="ref-stats" style={{ marginTop: 0 }}>
            <div className="ref-stat ref-stat--accent"><b>{summary.applied}</b><span>Applications to review</span></div>
            <div className="ref-stat"><b>{summary.approved}</b><span>Ambassadors</span></div>
            <div className="ref-stat"><b>{summary.payoutsWaiting}</b><span>Payouts to send</span></div>
            <div className="ref-stat"><b>{money(summary.payoutsWaitingAmount)}</b><span>Owed right now</span></div>
          </div>
        )}

        <h3 style={{ margin: "36px 0 14px" }}>Payouts</h3>
        <div className="admin-filters">
          <select className="admin-select" value={payoutFilter} onChange={(e) => setPayoutFilter(e.target.value)} aria-label="Payout status">
            <option value="requested">To pay</option>
            <option value="paid">Paid</option>
            <option value="rejected">Declined</option>
            <option value="">All</option>
          </select>
        </div>
        {payouts.length === 0 ? (
          <p style={{ color: "var(--muted)", marginTop: 14 }}>{payoutFilter === "requested" ? "Nothing waiting to be paid." : "No payouts here."}</p>
        ) : (
          <div className="admin-list" style={{ marginTop: 14 }}>
            {payouts.map((p) => (
              <div className="admin-row" key={p._id}>
                <div className="admin-row-main">
                  <b>{money(p.amount)} <span style={{ color: "var(--muted)", fontWeight: 400 }}>→</span> {p.ambassador.name}{" "}
                    <span className={`ref-pill${p.status === "paid" ? " ref-pill--paid" : ""}`}>{p.status === "requested" ? "To pay" : p.status === "paid" ? "Paid" : "Declined"}</span></b>
                  <span className="admin-row-meta amb-payto">{p.payTo}</span>
                  <span className="admin-row-meta">
                    {p.ambassador.college} · {p.ambassador.email}{p.ambassador.phone ? ` · ${p.ambassador.phone}` : ""} · requested {day(p.requestedAt)}
                    {p.status === "paid" ? ` · paid ${day(p.paidAt)} · ref ${p.reference}` : ""}{p.status === "rejected" && p.note ? ` · ${p.note}` : ""}
                  </span>
                </div>
                {p.status === "requested" && (
                  <div className="admin-row-actions">
                    <button className="btn btn-solid" onClick={() => markPaid(p)}>Mark paid</button>
                    <button className="btn btn-ghost admin-danger" onClick={() => decline(p)}>Decline</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <h3 style={{ margin: "40px 0 14px" }}>Ambassadors &amp; applications</h3>
        <div className="admin-filters">
          <input className="admin-search" type="search" style={{ margin: 0 }} placeholder="Search by name, email, college or city..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search ambassadors" />
          <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All</option>
            <option value="applied">Applied</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)", marginTop: 14 }}>Loading...</p>
        ) : list.length === 0 ? (
          <p style={{ color: "var(--muted)", marginTop: 14 }}>{q || status ? "No one matches that." : "No applications yet."}</p>
        ) : (
          <div className="admin-list" style={{ marginTop: 14 }}>
            {list.map((a) => (
              <div key={a._id} className="amb-admin-item">
                <div className="admin-row">
                  <div className="admin-row-main">
                    <b>{a.user.name} <span className={`ref-pill${a.status === "approved" ? " ref-pill--paid" : ""}`}>{a.status}</span></b>
                    <span className="admin-row-meta">{a.user.email}{a.user.phone ? ` · ${a.user.phone}` : ""}</span>
                    <span className="admin-row-meta">{[a.college, a.city, a.yearOfStudy, a.branch].filter(Boolean).join(" · ")}{a.socialHandle ? ` · ${a.socialHandle}` : ""}</span>
                    {a.stats && (
                      <span className="admin-row-meta">
                        {a.commissionPercent}% commission · {a.stats.paidCount}/{a.stats.referred} students purchased · earned {money(a.stats.total)}
                        {" "}(payable {money(a.stats.available)}, requested {money(a.stats.requested)}, paid {money(a.stats.paid)})
                      </span>
                    )}
                  </div>
                  <div className="admin-row-actions">
                    {a.status !== "approved" && <button className="btn btn-solid" onClick={() => setStatusOf(a, "approved")}>Approve</button>}
                    {a.status === "applied" && <button className="btn btn-ghost admin-danger" onClick={() => setStatusOf(a, "rejected")}>Reject</button>}
                    {a.status === "approved" && <button className="btn btn-ghost admin-danger" onClick={() => setStatusOf(a, "suspended")}>Suspend</button>}
                    <button className="btn btn-ghost" onClick={() => openRow(a)}>{openId === a._id ? "Close" : "Manage"}</button>
                  </div>
                </div>

                {openId === a._id && edit && (
                  <div className="amb-admin-detail">
                    <p className="amb-why"><b>Why they applied:</b> {a.motivation}</p>
                    <div className="amb-form-grid">
                      <div className="field"><label htmlFor={`c-${a._id}`}>Commission override (%)</label>
                        <input id={`c-${a._id}`} type="number" min="0" max="50" step="1" placeholder="Programme default" value={edit.commissionPercent} onChange={(e) => setEdit({ ...edit, commissionPercent: e.target.value })} /></div>
                      <div className="field"><label htmlFor={`k-${a._id}`}>Welcome kit</label>
                        <select id={`k-${a._id}`} className="admin-select" style={{ width: "100%" }} value={edit.kitStatus} onChange={(e) => setEdit({ ...edit, kitStatus: e.target.value })}>
                          {KIT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select></div>
                      <div className="field"><label htmlFor={`kn-${a._id}`}>Kit note (courier / tracking)</label>
                        <input id={`kn-${a._id}`} value={edit.kitNote} onChange={(e) => setEdit({ ...edit, kitNote: e.target.value })} /></div>
                      <div className="field"><label htmlFor={`an-${a._id}`}>Private note</label>
                        <input id={`an-${a._id}`} value={edit.adminNote} onChange={(e) => setEdit({ ...edit, adminNote: e.target.value })} /></div>
                    </div>
                    {a.shippingAddress && <p className="amb-why"><b>Kit address:</b> {a.shippingAddress}</p>}
                    {a.certificateNumber && <p className="amb-why"><b>Certificate:</b> {a.certificateNumber}</p>}
                    {detail && detail.payoutDestination && <p className="amb-why"><b>Pays to:</b> <span className="amb-payto">{detail.payoutDestination}</span></p>}
                    {editMsg.text && <p className={editMsg.kind === "ok" ? "ref-ok" : "form-error"}>{editMsg.text}</p>}
                    <button className="btn btn-solid" onClick={() => saveEdit(a)}>Save changes</button>

                    <h4 style={{ margin: "22px 0 8px" }}>Commissions</h4>
                    {!detail ? <p style={{ color: "var(--muted)" }}>Loading…</p> : detail.earnings.length === 0 ? (
                      <p style={{ color: "var(--muted)" }}>No commissions yet.</p>
                    ) : (
                      <div className="amb-table-wrap">
                        <table className="amb-table">
                          <thead><tr><th>Student</th><th>Date</th><th>Paid</th><th>%</th><th>Commission</th><th></th></tr></thead>
                          <tbody>
                            {detail.earnings.map((e) => (
                              <tr key={e._id} style={e.void ? { opacity: 0.5 } : undefined}>
                                <td>{e.friend} <small>{e.friendEmail}</small></td>
                                <td>{day(e.earnedOn)}</td>
                                <td>{money(e.paid)}</td>
                                <td>{e.percent}%</td>
                                <td><b>{money(e.amount)}</b>{e.void ? " (void)" : e.locked ? ` (${e.payoutStatus})` : ""}</td>
                                <td>{!e.locked && <button className="btn btn-ghost" onClick={() => toggleVoid(a, e)}>{e.void ? "Restore" : "Void"}</button>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <form className="admin-form" style={{ marginTop: 44 }} onSubmit={saveSettings}>
          <h3 style={{ margin: "0 0 16px" }}>Programme rules</h3>
          {settings ? (
            <>
              <label className="check-row">
                <input type="checkbox" checked={settings.enabled} onChange={setS("enabled")} />
                <span>Accepting new applications</span>
              </label>
              <div className="amb-form-grid" style={{ marginTop: 14 }}>
                <div className="field"><label htmlFor="s-comm">Default commission (% of what the student pays)</label>
                  <input id="s-comm" type="number" min="0" max="50" step="1" value={settings.defaultCommissionPercent} onChange={setS("defaultCommissionPercent")} /></div>
                <div className="field"><label htmlFor="s-hold">Hold period (days before it's payable)</label>
                  <input id="s-hold" type="number" min="0" max="90" step="1" value={settings.holdDays} onChange={setS("holdDays")} /></div>
                <div className="field"><label htmlFor="s-min">Minimum payout (₹)</label>
                  <input id="s-min" type="number" min="1" step="1" value={settings.minPayoutRupees} onChange={setS("minPayoutRupees")} /></div>
              </div>
              <div className="field"><label htmlFor="s-perks">Perks shown to applicants (one per line)</label>
                <textarea id="s-perks" rows="4" value={settings.perks} onChange={setS("perks")} /></div>
              <p className="form-note" style={{ margin: "-4px 0 16px" }}>
                A friend using an ambassador's code gets the same welcome discount as any referral (set on the Referrals page), so the
                referral programme must be on. The hold period protects against a purchase being reversed before you pay out.
              </p>
              {settingsMsg.text && <p className={settingsMsg.kind === "ok" ? "ref-ok" : "form-error"}>{settingsMsg.text}</p>}
              <button className="btn btn-solid" type="submit" disabled={savingSettings}>{savingSettings ? "Saving..." : "Save rules"}</button>
            </>
          ) : <p style={{ color: "var(--muted)" }}>Loading…</p>}
        </form>
      </div>
    </section>
  );
}
