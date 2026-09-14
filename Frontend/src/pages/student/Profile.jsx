import { useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UserContext, isProfileComplete } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { Alert } from "../../components/ui.jsx";

export default function Profile() {
  usePageMeta({ title: "Your Profile | Crix Technology", description: "Manage your Crix Technology account details." });
  const { isLoggedIn, user, updateProfile, openAuthModal } = useContext(UserContext);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Where to go after a successful save — set when the user was sent here to
  // finish their details before an enrollment. Kept relative-only so it
  // can't be used as an open redirect.
  const rawNext = params.get("next") || "";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "";
  const sentToComplete = params.get("reason") === "complete" || !!next;

  const [form, setForm] = useState({ name: "", phone: "" });
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) setForm({ name: user.name || "", phone: user.phone || "" });
  }, [user]);

  if (!isLoggedIn) {
    return (
      <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
        <div className="wrap" style={{ maxWidth: 480 }}>
          <span className="eyebrow">Your account</span>
          <h2 style={{ margin: "14px 0 16px" }}>Log in to manage your profile</h2>
          <button className="btn btn-solid" onClick={() => openAuthModal("login")}>Log in</button>
        </div>
      </section>
    );
  }

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setStatus({ text: "", kind: "" }); };

  const missing = [
    !(user.name || "").trim() && "name",
    !(user.email || "").trim() && "email",
    !(user.phone || "").trim() && "phone number",
  ].filter(Boolean);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setStatus({ text: "Name can't be empty.", kind: "error" }); return; }
    if (!form.phone.trim()) { setStatus({ text: "Please add a phone number.", kind: "error" }); return; }

    setSaving(true);
    setStatus({ text: "Saving...", kind: "info" });
    const res = await updateProfile({ name: form.name.trim(), phone: form.phone.trim() });
    setSaving(false);

    if (!res.ok) {
      setStatus({ text: res.error || "Could not save your profile.", kind: "error" });
      return;
    }
    if (next && isProfileComplete(res.user)) {
      navigate(next, { replace: true });
      return;
    }
    setStatus({ text: "Profile saved.", kind: "success" });
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap" style={{ maxWidth: 560 }}>
        <span className="eyebrow">Your account</span>
        <h2 style={{ margin: "14px 0 8px" }}>Your profile</h2>
        <p style={{ color: "var(--muted)", marginBottom: 28 }}>
          These details are used for your enrolments and payment receipts.
        </p>

        {sentToComplete && missing.length > 0 && (
          <p className="form-note" role="status" style={{
            marginTop: 0, marginBottom: 24, padding: "14px 16px",
            background: "rgba(20,201,201,.08)", borderLeft: "3px solid var(--teal)", borderRadius: 10,
          }}>
            Add your {missing.join(", ").replace(/, ([^,]*)$/, " and $1")} to continue to payment.
          </p>
        )}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="pf-name">Full name</label>
            <input id="pf-name" autoComplete="name" value={form.name} onChange={set("name")} placeholder="Your name" disabled={saving} />
          </div>

          <div className="field">
            <label htmlFor="pf-email">Email</label>
            <input id="pf-email" type="email" value={user.email || ""} readOnly disabled
              style={{ opacity: 0.7, cursor: "not-allowed" }} />
            <span style={{ display: "block", marginTop: 6, fontSize: ".75rem", color: "var(--muted)" }}>
              Email is your login and can't be changed here.
            </span>
          </div>

          <div className="field">
            <label htmlFor="pf-phone">Phone</label>
            <input id="pf-phone" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set("phone")}
              placeholder="98765 43210" disabled={saving} />
          </div>

          <button className="btn btn-solid" type="submit" disabled={saving} style={{ width: "100%", marginTop: 4 }}>
            {saving ? "Saving..." : next ? "Save and continue" : "Save changes"}
          </button>

          <Alert kind={status.kind}>{status.text}</Alert>
        </form>
      </div>
    </section>
  );
}
