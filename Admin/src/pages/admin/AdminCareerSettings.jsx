import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminToken, adminGetCareerSettings, adminUpdateCareerSettings } from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";

const NUMBERS = ["testFeeRupees", "signupBonusCredits", "creditExpiryMonths", "creditUsagePercent", "violationLimit", "snapshotIntervalSeconds", "generatedQuestionsPercent"];
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
      ? { kind: "ok", text: "Saved. New payments, new accounts and tests started from now on use these rules." }
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
              <h3 style={{ margin: "0 0 16px" }}>Fee and credits</h3>
              <div className="admin-form-grid admin-form-grid--2">
                <div className="field"><label htmlFor="cs-fee">Aptitude test fee (₹)</label>
                  <input id="cs-fee" type="number" min="1" step="1" value={settings.testFeeRupees} onChange={setField("testFeeRupees")} /></div>
                <div className="field"><label htmlFor="cs-bonus">Signup bonus (credits, 0 = none)</label>
                  <input id="cs-bonus" type="number" min="0" step="1" value={settings.signupBonusCredits} onChange={setField("signupBonusCredits")} /></div>
                <div className="field"><label htmlFor="cs-expiry">Credit expiry (months, 0 = never)</label>
                  <input id="cs-expiry" type="number" min="0" max="120" step="1" value={settings.creditExpiryMonths} onChange={setField("creditExpiryMonths")} /></div>
                <div className="field"><label htmlFor="cs-usage">Credit usage limit (% of one purchase)</label>
                  <input id="cs-usage" type="number" min="0" max="100" step="1" value={settings.creditUsagePercent} onChange={setField("creditUsagePercent")} /></div>
              </div>
              <p className="form-note" style={{ margin: "-4px 0 20px" }}>
                The whole test fee comes back to the candidate as wallet credit (1 credit = ₹1). The expiry applies to the signup bonus and the
                test-fee credit added from now on — credit already in a wallet keeps the expiry it was given, and referral or admin credit doesn't expire.
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
              </div>
              <p className="form-note" style={{ margin: "-4px 0 16px" }}>
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
      </div>
    </section>
  );
}
