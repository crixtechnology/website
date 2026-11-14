import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminToken, adminGetCareerSettings, adminUpdateCareerSettings, adminCheckStorage } from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";

const NUMBERS = ["signupBonusCredits", "creditExpiryMonths", "creditUsagePercent", "violationLimit", "snapshotIntervalSeconds", "generatedQuestionsPercent", "reapplyCooldownDays"];
const TOGGLES = ["requireWebcam", "requireDesktopApp"];

// The rules of the careers flow: what the aptitude test costs, the credit new
// accounts and test-takers get and how it can be used, and how strict the test is.
export default function AdminCareerSettings() {
  usePageMeta({ title: "Careers settings | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [settings, setSettings] = useState(null); // numbers held as the text typed
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [storage, setStorage] = useState({ busy: false, result: null });

  const checkStorage = async () => {
    if (storage.busy) return;
    setStorage({ busy: true, result: null });
    setStorage({ busy: false, result: await adminCheckStorage() });
  };

  useEffect(() => {
    adminGetCareerSettings().then((res) => {
      if (res.ok) setSettings({ ...res.settings, ...Object.fromEntries(NUMBERS.map((k) => [k, String(res.settings[k])])) });
      else {
        setMsg({ kind: "error", text: res.error || "Could not load the settings." });
        if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
      }
    });
  }, []);

  const setField = (k) => (e) => {
    setSettings((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
    setMsg({ kind: "", text: "" });
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving || !settings) return;
    setSaving(true);
    setMsg({ kind: "", text: "" });
    const res = await adminUpdateCareerSettings({
      ...Object.fromEntries(NUMBERS.map((k) => [k, Number(settings[k])])),
      ...Object.fromEntries(TOGGLES.map((k) => [k, !!settings[k]])),
    });
    setSaving(false);
    setMsg(res.ok
      ? { kind: "ok", text: "Saved. New accounts and tests started from now on use these rules." }
      : { kind: "error", text: res.error || "Could not save." });
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Careers settings</h1>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <form className="admin-form" onSubmit={save}>
          {settings ? (
            <>
              <h3 style={{ margin: "0 0 16px" }}>Wallet credits</h3>
              <div className="admin-form-grid admin-form-grid--2">
                <div className="field"><label htmlFor="cs-bonus">Signup bonus (credits, 0 = none)</label>
                  <input id="cs-bonus" type="number" min="0" step="1" value={settings.signupBonusCredits} onChange={setField("signupBonusCredits")} /></div>
                <div className="field"><label htmlFor="cs-expiry">Credit expiry (months, 0 = never)</label>
                  <input id="cs-expiry" type="number" min="0" max="120" step="1" value={settings.creditExpiryMonths} onChange={setField("creditExpiryMonths")} /></div>
                <div className="field"><label htmlFor="cs-usage">Credit usage limit (% of one purchase)</label>
                  <input id="cs-usage" type="number" min="0" max="100" step="1" value={settings.creditUsagePercent} onChange={setField("creditUsagePercent")} /></div>
              </div>
              <p className="form-note" style={{ margin: "-4px 0 20px" }}>
                Applying and the aptitude test are free for every role, so there is no fee to set here.
                The expiry applies to signup bonus credit added from now on (1 credit = ₹1) — credit already in a wallet keeps the expiry it was given, and referral or admin credit doesn't expire.
                The usage limit applies to every purchase: at 100% credit can pay for a whole course.
              </p>

              <h3 style={{ margin: "0 0 16px" }}>The test</h3>
              <div className="admin-form-grid admin-form-grid--2">
                <div className="field"><label htmlFor="cs-violations">Violation limit (auto-submit after this many)</label>
                  <input id="cs-violations" type="number" min="1" max="50" step="1" value={settings.violationLimit} onChange={setField("violationLimit")} /></div>
                <div className="field"><label htmlFor="cs-snap">Webcam photo every (seconds)</label>
                  <input id="cs-snap" type="number" min="20" max="600" step="1" value={settings.snapshotIntervalSeconds} onChange={setField("snapshotIntervalSeconds")} /></div>
                <div className="field"><label htmlFor="cs-generated">Generated questions (% of each test)</label>
                  <input id="cs-generated" type="number" min="0" max="100" step="1" value={settings.generatedQuestionsPercent} onChange={setField("generatedQuestionsPercent")} /></div>
                <div className="field"><label htmlFor="cs-cooldown">Re-apply wait (days, 0 = none)</label>
                  <input id="cs-cooldown" type="number" min="0" max="365" step="1" value={settings.reapplyCooldownDays ?? 30} onChange={setField("reapplyCooldownDays")} /></div>
              </div>
              <p className="form-note" style={{ margin: "-4px 0 16px" }}>
                After an application ends without an offer, the same candidate can apply to that role again only after the
                re-apply wait, so the test can't be retaken over and over.
                Generated questions are written at the moment a test starts, with fresh numbers, words or code each time, so no two candidates
                get the same ones. The rest of each test comes from the question bank. Set this to 0 to use the bank only.
              </p>
              <p className="form-note" style={{ margin: "0 0 12px" }}>
                Candidates are never shown their score. It appears only here in the admin panel, under Applicants.
              </p>
              <label className="check-row">
                <input type="checkbox" checked={!!settings.requireWebcam} onChange={setField("requireWebcam")} />
                <span>A working webcam is required to start the test</span>
              </label>
              <label className="check-row" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={!!settings.requireDesktopApp} onChange={setField("requireDesktopApp")} />
                <span>Only allow the test in the desktop lockdown app (leave off until that app exists — it would block everyone)</span>
              </label>

              {msg.text && <p className={msg.kind === "ok" ? "ref-ok" : "form-error"} style={{ marginTop: 16 }}>{msg.text}</p>}
              <button className="btn btn-solid" type="submit" disabled={saving} style={{ marginTop: 18 }}>{saving ? "Saving..." : "Save settings"}</button>
            </>
          ) : msg.text ? (
            <p className="form-error">{msg.text}</p>
          ) : (
            <p style={{ color: "var(--muted)" }}>Loading…</p>
          )}
        </form>

        <div className="admin-form" style={{ marginTop: 24 }}>
          <h3 style={{ margin: "0 0 10px" }}>File storage (CVs and webcam photos)</h3>
          <p className="form-note" style={{ margin: "0 0 14px" }}>
            Saves a tiny test file where CVs and webcam photos go, reads it back and deletes it. If a CV upload or the test's
            photos fail, run this to see why.
          </p>
          <button type="button" className="btn btn-ghost" onClick={checkStorage} disabled={storage.busy}>{storage.busy ? "Checking…" : "Check storage"}</button>
          {storage.result && (storage.result.ok ? (
            <div style={{ marginTop: 14 }}>
              <p className="form-note" style={{ margin: "0 0 8px" }}>{storage.result.message}</p>
              <ul className="admin-check-list" style={{ margin: 0, paddingLeft: 18 }}>
                {storage.result.results.map((r) => (
                  <li key={r.area} className={r.ok ? "ref-ok" : "form-error"}>{r.area}: {r.ok ? "working" : r.error}</li>
                ))}
              </ul>
            </div>
          ) : <p className="form-error" style={{ marginTop: 14 }}>{storage.result.error}</p>)}
        </div>
      </div>
    </section>
  );
}
