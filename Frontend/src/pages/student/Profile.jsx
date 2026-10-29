import { useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UserContext, isProfileComplete, profileMissing } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { Alert } from "../../components/ui.jsx";
import PhoneInput from "../../components/PhoneInput.jsx";
import PasswordSettings from "../../components/PasswordSettings.jsx";
import WalletCard from "../../components/WalletCard.jsx";
import DeleteAccount from "../../components/DeleteAccount.jsx";
import { phoneError, phoneFieldError } from "../../utils/phone.js";
import { FieldError } from "../../components/FormFields.jsx";
import { useTouched } from "../../hooks/useTouched.js";
import { EducationFields, educationForm, educationPayload, emptyEducation } from "../../utils/education.js";
import { safeNextPath } from "../../utils/safePath.js";

export default function Profile() {
  usePageMeta({ title: "Your Profile | Crix Technology", description: "Manage your Crix Technology account details." });
  const { isLoggedIn, user, updateProfile, openAuthModal } = useContext(UserContext);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Where to go after a successful save — set when the user was sent here to
  // finish their details before an enrollment. Kept relative-only so it
  // can't be used as an open redirect.
  const next = safeNextPath(params.get("next"));
  const isNew = params.get("reason") === "new";
  const sentToComplete = params.get("reason") === "complete" || isNew || !!next;

  const [form, setForm] = useState({ name: "", phone: "" });
  const [education, setEducation] = useState(emptyEducation);
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [saving, setSaving] = useState(false);
  const fields = useTouched();

  useEffect(() => {
    // An account made from the login form has a placeholder name: start the box empty.
    if (user) setForm({ name: user.profilePending ? "" : user.name || "", phone: user.phone || "" });
    if (user) setEducation(educationForm(user));
  }, [user]);

  if (!isLoggedIn && params.get("deleted") === "1") {
    return (
      <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
        <div className="wrap" style={{ maxWidth: 520 }}>
          <span className="eyebrow">Your account</span>
          <h1 className="title-lg" style={{ margin: "14px 0 16px" }}>Your account has been deleted</h1>
          <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>
            Your account and personal data have been permanently deleted, and we've emailed you a confirmation. Payment
            records and receipts are kept, with no link to an account, as Indian tax and accounting law requires.
            You're always welcome back.
          </p>
        </div>
      </section>
    );
  }

  if (!isLoggedIn) {
    return (
      <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
        <div className="wrap" style={{ maxWidth: 480 }}>
          <span className="eyebrow">Your account</span>
          <h1 className="title-lg" style={{ margin: "14px 0 16px" }}>Log in to manage your profile</h1>
          <button className="btn btn-solid" onClick={() => openAuthModal("login")}>Log in</button>
        </div>
      </section>
    );
  }

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setStatus({ text: "", kind: "" }); };

  const missing = profileMissing(user);
  // Live errors under the name and phone fields (hooks/useTouched.js).
  const errors = {
    "pf-name": form.name.trim() ? "" : "Enter your full name.",
    "pf-phone": phoneFieldError(form.phone),
  };
  const showErr = (id) => (fields.show(id) && errors[id]) || "";

  const onSubmit = async (e) => {
    e.preventDefault();
    // A disabled submit button doesn't stop the browser's native form
    // submit on Enter inside a text field — without this guard, pressing
    // Enter twice quickly (or a slow network) fires two concurrent saves.
    if (saving) return;
    fields.markSubmitted();
    if (!form.name.trim()) { setStatus({ text: "Please add your full name.", kind: "error" }); return; }
    if (!form.phone.trim()) { setStatus({ text: "Please add a phone number.", kind: "error" }); return; }
    const phoneProblem = phoneError(form.phone);
    if (phoneProblem) { setStatus({ text: `Please add ${phoneProblem}.`, kind: "error" }); return; }

    setSaving(true);
    setStatus({ text: "Saving...", kind: "info" });
    // confirmName: this is the owner's own name, not the placeholder made from their email.
    const res = await updateProfile({ name: form.name.trim(), phone: form.phone.trim(), confirmName: true, ...educationPayload(education) });
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
        <h1 className="title-lg" style={{ margin: "14px 0 8px" }}>Your profile</h1>
        <p style={{ color: "var(--muted)", marginBottom: 28 }}>
          These details are used for your enrolments and payment receipts.
        </p>

        {(sentToComplete || user.profilePending) && missing.length > 0 && (
          <p className="form-note" role="status" style={{
            marginTop: 0, marginBottom: 24, padding: "14px 16px",
            background: "rgba(var(--teal-rgb),.08)", borderLeft: "3px solid var(--teal)", borderRadius: 10,
          }}>
            {isNew ? "Your account is ready. " : ""}Add your {missing.join(", ").replace(/, ([^,]*)$/, " and $1")}
            {next ? " to continue to payment." : " — you'll need them before buying anything."}
          </p>
        )}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="pf-name">Full name</label>
            <input id="pf-name" autoComplete="name" value={form.name} onChange={set("name")} placeholder="Your name" disabled={saving}
              onBlur={fields.touch("pf-name")} aria-invalid={!!showErr("pf-name") || undefined} aria-describedby="pf-name-err" />
            <FieldError id="pf-name-err">{showErr("pf-name")}</FieldError>
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
            <PhoneInput id="pf-phone" value={form.phone} disabled={saving}
              onChange={(phone) => { setForm((f) => ({ ...f, phone })); setStatus({ text: "", kind: "" }); }}
              onBlur={fields.touch("pf-phone")} invalid={!!showErr("pf-phone")} describedBy="pf-phone-err" />
            <FieldError id="pf-phone-err">{showErr("pf-phone")}</FieldError>
          </div>

          <h2 style={{ fontSize: "1.05rem", margin: "28px 0 4px" }}>Education</h2>
          <p className="form-note" style={{ marginTop: 0, marginBottom: 14 }}>
            Optional — but needed to apply for a free internship.
          </p>
          <EducationFields form={education} disabled={saving} idPrefix="pf-edu"
            onChange={(next) => { setEducation(next); setStatus({ text: "", kind: "" }); }} />

          <button className="btn btn-solid" type="submit" disabled={saving} style={{ width: "100%", marginTop: 4 }}>
            {saving ? "Saving..." : next ? "Save and continue" : "Save changes"}
          </button>

          <Alert kind={status.kind}>{status.text}</Alert>
        </form>

        <div style={{ marginTop: 40 }}><WalletCard /></div>

        <PasswordSettings />

        <DeleteAccount />
      </div>
    </section>
  );
}
