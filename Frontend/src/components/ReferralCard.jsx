import { useEffect, useRef, useState } from "react";
import { getMyReferral, applyReferral } from "../services/api.js";
import { referralLink, copyText, getStoredReferral, clearStoredReferral } from "../utils/referral.js";

const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const shortDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// "Refer & earn" — a student's own referral code and link, how their referrals
// are going, and their credit. Lives on My Dashboard. Also where a friend's code
// can be entered, for a student who hasn't bought anything yet.
export default function ReferralCard() {
  const [data, setData] = useState(undefined); // undefined = loading, null = couldn't load
  const [copied, setCopied] = useState(""); // "code" | "link" — which button just copied
  const [friendCode, setFriendCode] = useState(getStoredReferral());
  const [note, setNote] = useState({ kind: "", text: "" });
  const [busy, setBusy] = useState(false);
  const copyTimer = useRef(null);

  const load = () => getMyReferral().then((res) => setData(res.ok ? res : null));
  useEffect(() => { load(); return () => clearTimeout(copyTimer.current); }, []);

  if (data === undefined) return null;
  if (data === null) return null; // a hiccup here shouldn't break My Dashboard

  const { settings } = data;
  const link = referralLink(data.code);
  const shareText =
    `I'm learning with Crix Technology — use my code ${data.displayCode} to get ${settings.refereeDiscountPercent}% off your first course or internship: ${link}`;

  const copy = async (which, text) => {
    const ok = await copyText(text);
    setCopied(ok ? which : "failed");
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(""), 1800);
  };

  const applyFriendCode = async () => {
    if (busy || !friendCode.trim()) return;
    setBusy(true);
    setNote({ kind: "", text: "" });
    const res = await applyReferral(friendCode);
    setBusy(false);
    if (res.ok) {
      clearStoredReferral();
      setFriendCode("");
      setNote({ kind: "ok", text: `Applied — you'll get ${res.discountPercent}% off your first purchase.` });
      load();
    } else {
      setNote({ kind: "error", text: res.error });
    }
  };

  return (
    <div className="ref-card">
      <div className="ref-head">
        <span className="eyebrow">Refer &amp; earn</span>
        <h2 className="ref-title">Share Crix, earn credit.</h2>
        {settings.enabled ? (
          <p className="ref-lede">
            Friends who use your code get <b>{settings.refereeDiscountPercent}% off</b> their first course or internship.
            When they pay, you get <b>{money(settings.referrerCreditRupees)} credit</b> — applied automatically to your next purchase.
          </p>
        ) : (
          <p className="ref-lede">Referral rewards are paused right now. Your code and credit are safe and will work again when they resume.</p>
        )}
      </div>

      <div className="ref-code-row">
        <div className="ref-code" aria-label="Your referral code">{data.displayCode}</div>
        <div className="ref-actions">
          <button className="btn btn-solid" onClick={() => copy("code", data.displayCode)}>
            {copied === "code" ? "Copied ✓" : "Copy code"}
          </button>
          <button className="btn btn-ghost" onClick={() => copy("link", link)}>
            {copied === "link" ? "Link copied ✓" : "Copy link"}
          </button>
          <a className="btn btn-ghost ref-wa" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">
            Share on WhatsApp
          </a>
        </div>
        {copied === "failed" && <p className="form-error">Couldn't copy — select the code and copy it by hand.</p>}
      </div>

      <div className="ref-stats">
        <div className="ref-stat"><b>{data.stats.total}</b><span>Friends joined</span></div>
        <div className="ref-stat"><b>{data.stats.rewarded}</b><span>Made a purchase</span></div>
        <div className="ref-stat"><b>{money(data.stats.earned)}</b><span>Credit earned</span></div>
        <div className="ref-stat ref-stat--accent"><b>{money(data.creditBalance)}</b><span>Credit available</span></div>
      </div>

      {data.referrals.length > 0 && (
        <ul className="ref-list">
          {data.referrals.map((r, i) => (
            <li key={i}>
              <span>{r.name} <small>· joined {shortDate(r.joinedAt)}</small></span>
              {r.status === "rewarded"
                ? <span className="ref-pill ref-pill--paid">Purchased · +{money(r.reward)}</span>
                : <span className="ref-pill">Joined</span>}
            </li>
          ))}
        </ul>
      )}

      {data.referredBy && (
        <p className="ref-note">
          You joined with a friend's code
          {data.referredBy.status === "pending"
            ? ` — ${data.referredBy.discountPercent}% off your first purchase is waiting at checkout.`
            : " — thanks for being referred!"}
        </p>
      )}

      {data.canApplyCode && (
        <div className="ref-apply ref-apply--card">
          <label htmlFor="ref-friend-code">Got a friend's code?</label>
          <div className="ref-apply-row">
            <input id="ref-friend-code" value={friendCode} placeholder="CRIX-XXXXXX" autoComplete="off"
              onChange={(e) => { setFriendCode(e.target.value); setNote({ kind: "", text: "" }); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyFriendCode(); } }} />
            <button className="btn btn-ghost" type="button" onClick={applyFriendCode} disabled={busy || !friendCode.trim()}>
              {busy ? "Checking…" : "Apply"}
            </button>
          </div>
          {note.text && <p className={note.kind === "ok" ? "ref-ok" : "form-error"}>{note.text}</p>}
        </div>
      )}
    </div>
  );
}
