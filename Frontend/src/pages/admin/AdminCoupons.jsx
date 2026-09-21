import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetCoupons, adminCreateCoupon, adminUpdateCoupon, adminDeleteCoupon, adminGetCourses,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { formatINR } from "../../utils/tiers.js";

// Offer / discount codes. The admin makes them here; a student types one into
// the buy popup when purchasing a course or internship (Backend routes/
// coupons.js, utils/coupons.js). A code can take off a percentage or a fixed
// amount, and be limited by date, by total uses, by uses per student, and to
// certain courses/internships.

const EMPTY_FORM = {
  code: "", description: "", discountType: "percent", discountValue: "", maxDiscount: "",
  appliesTo: "all", courseIds: [], startsAt: "", expiresAt: "", maxUses: "", perUserLimit: "1", active: true,
};

// <input type="datetime-local"> works in local time without a zone ("2026-09-30T18:00").
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

function couponToForm(c) {
  return {
    code: c.code, description: c.description || "", discountType: c.discountType, discountValue: String(c.discountValue),
    maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "", appliesTo: c.appliesTo, courseIds: c.courseIds || [],
    startsAt: toLocalInput(c.startsAt), expiresAt: toLocalInput(c.expiresAt),
    maxUses: c.maxUses ? String(c.maxUses) : "", perUserLimit: String(c.perUserLimit), active: c.active,
  };
}

// A random suggestion for the code box. Letters/digits with no look-alikes
// (0/O, 1/I/L), drawn from the browser's secure random source so codes aren't guessable.
function suggestCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(8);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const STATE_LABEL = { live: "Live", inactive: "Off", expired: "Expired", scheduled: "Scheduled", "used-up": "Used up" };
const STATE_PILL = { live: "lifetime", inactive: "read", expired: "expired", scheduled: "new", "used-up": "expired" };

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function AdminCoupons() {
  usePageMeta({ title: "Offer Codes | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [coupons, setCoupons] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const dropToLoginIfExpired = () => {
    if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
  };

  const load = useCallback(async () => {
    const res = await adminGetCoupons();
    setLoading(false);
    if (res.ok) { setCoupons(res.coupons || []); setError(""); }
    else {
      setError(res.error || "Could not load offer codes.");
      if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
    }
  }, [logout, navigate]);

  useEffect(() => {
    load();
    adminGetCourses().then((res) => { if (res.ok) setCourses(res.courses || []); });
  }, [load]);

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setError(""); };
  const startEdit = (c) => { setEditingId(c._id); setForm(couponToForm(c)); setError(""); setNotice(""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); setError(""); };

  const toggleCourse = (id) => setForm((f) => ({
    ...f, courseIds: f.courseIds.includes(id) ? f.courseIds.filter((x) => x !== id) : [...f.courseIds, id],
  }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.code.trim()) { setError("Enter a code, or press Generate."); return; }
    if (!form.discountValue.trim()) { setError(`Enter the ${form.discountType === "percent" ? "percentage" : "amount"} to take off.`); return; }
    if (form.appliesTo === "selected" && form.courseIds.length === 0) { setError("Pick at least one course or internship."); return; }

    const payload = {
      code: form.code.trim(),
      description: form.description.trim(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      maxDiscount: form.discountType === "percent" && form.maxDiscount.trim() ? Number(form.maxDiscount) : null,
      appliesTo: form.appliesTo,
      courseIds: form.appliesTo === "selected" ? form.courseIds : [],
      startsAt: fromLocalInput(form.startsAt),
      expiresAt: fromLocalInput(form.expiresAt),
      maxUses: form.maxUses.trim() ? Number(form.maxUses) : null,
      perUserLimit: Number(form.perUserLimit) || 1,
      active: form.active,
    };
    setSaving(true);
    setError("");
    setNotice("");
    const res = editingId ? await adminUpdateCoupon(editingId, payload) : await adminCreateCoupon(payload);
    setSaving(false);
    if (!res.ok) { setError(res.error || "Could not save."); dropToLoginIfExpired(); return; }
    setNotice(editingId ? `Saved ${res.coupon.code}.` : `Created ${res.coupon.code}. Share it with the student personally — it isn't shown anywhere on the site.`);
    cancelEdit();
    load();
  };

  const toggleActive = async (c) => {
    setError("");
    setNotice("");
    const res = await adminUpdateCoupon(c._id, { active: !c.active });
    if (res.ok) load(); else setError(res.error || "Could not update.");
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete the code ${c.code}? This cannot be undone.`)) return;
    setError("");
    setNotice("");
    const res = await adminDeleteCoupon(c._id);
    if (res.ok) { if (editingId === c._id) cancelEdit(); load(); } else setError(res.error || "Could not delete.");
  };

  const copy = async (c) => {
    try { await navigator.clipboard.writeText(c.code); setNotice(`Copied ${c.code}.`); } catch (e) { setNotice(`Code: ${c.code}`); }
  };

  const courseTitle = (id) => courses.find((c) => c._id === id)?.title || "a deleted item";
  const describe = (c) => {
    const off = c.discountType === "percent"
      ? `${c.discountValue}% off${c.maxDiscount ? ` (up to ${formatINR(c.maxDiscount)})` : ""}`
      : `${formatINR(c.discountValue)} off`;
    const where = c.appliesTo === "all" ? "all courses & internships"
      : c.appliesTo === "course" ? "all courses"
      : c.appliesTo === "internship" ? "all internships"
      : (c.courseIds || []).map(courseTitle).join(", ") || "selected items";
    const when = c.expiresAt ? `until ${fmtDate(c.expiresAt)}` : "no expiry";
    const used = `${c.redeemed}${c.maxUses ? ` of ${c.maxUses}` : ""} used`;
    return `${off} · ${where} · ${when} · ${used}${c.redeemed ? ` · ${formatINR(c.totalDiscount)} given` : ""} · ${c.perUserLimit === 1 ? "once per student" : `${c.perUserLimit}× per student`}`;
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Offer codes</h1>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
              Codes are never shown to students on the site. Share a code with a student personally (for example on WhatsApp or email); they type it into the offer-code box when buying. For a code meant for one person, set "Total uses" to 1.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <form onSubmit={onSubmit} className="admin-form">
          <h3 style={{ margin: "0 0 16px" }}>{editingId ? "Edit offer code" : "Create an offer code"}</h3>
          <div className="admin-form-grid admin-form-grid--2">
            <div className="field"><label htmlFor="cp-code">Code</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input id="cp-code" value={form.code} onChange={set("code")} placeholder="e.g. DIWALI25" autoComplete="off"
                  style={{ textTransform: "uppercase", flex: 1, minWidth: 0 }} />
                <button type="button" className="btn btn-ghost" onClick={() => setForm({ ...form, code: suggestCode() })}>Generate</button>
              </div>
              <span className="admin-row-meta">Letters and numbers, 3–20. Students can type it in any case.</span>
            </div>
            <div className="field"><label htmlFor="cp-desc">Note for yourself (optional)</label>
              <input id="cp-desc" value={form.description} onChange={set("description")} placeholder="e.g. Given to Rahul, referral by college" maxLength={120} />
              <span className="admin-row-meta">Only admins ever see this.</span></div>

            <div className="field"><label htmlFor="cp-type">Discount type</label>
              <select id="cp-type" value={form.discountType} onChange={set("discountType")}>
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed amount (₹)</option>
              </select></div>
            <div className="field"><label htmlFor="cp-value">{form.discountType === "percent" ? "Percentage off (1–90)" : "Rupees off"}</label>
              <input id="cp-value" type="number" min="1" max={form.discountType === "percent" ? 90 : undefined} step="1"
                value={form.discountValue} onChange={set("discountValue")} placeholder={form.discountType === "percent" ? "20" : "500"} /></div>

            {form.discountType === "percent" && (
              <div className="field"><label htmlFor="cp-cap">Maximum discount (₹, optional)</label>
                <input id="cp-cap" type="number" min="1" step="1" value={form.maxDiscount} onChange={set("maxDiscount")} placeholder="No limit" /></div>
            )}
            <div className="field"><label htmlFor="cp-applies">Applies to</label>
              <select id="cp-applies" value={form.appliesTo} onChange={set("appliesTo")}>
                <option value="all">All courses &amp; internships</option>
                <option value="course">All courses</option>
                <option value="internship">All internships</option>
                <option value="selected">Only the ones I pick</option>
              </select></div>

            <div className="field"><label htmlFor="cp-starts">Starts (optional)</label>
              <input id="cp-starts" type="datetime-local" value={form.startsAt} onChange={set("startsAt")} /></div>
            <div className="field"><label htmlFor="cp-expires">Expires (optional)</label>
              <input id="cp-expires" type="datetime-local" value={form.expiresAt} onChange={set("expiresAt")} /></div>

            <div className="field"><label htmlFor="cp-max">Total uses (optional)</label>
              <input id="cp-max" type="number" min="1" step="1" value={form.maxUses} onChange={set("maxUses")} placeholder="Unlimited" /></div>
            <div className="field"><label htmlFor="cp-per">Uses per student</label>
              <input id="cp-per" type="number" min="1" step="1" value={form.perUserLimit} onChange={set("perUserLimit")} /></div>
          </div>

          {form.appliesTo === "selected" && (
            <fieldset className="field" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", margin: "0 0 16px" }}>
              <legend style={{ padding: "0 6px", fontSize: ".82rem", color: "var(--muted)" }}>Pick courses &amp; internships ({form.courseIds.length} selected)</legend>
              <div style={{ maxHeight: 220, overflowY: "auto", display: "grid", gap: 8 }}>
                {courses.length === 0 && <span style={{ color: "var(--muted)" }}>No courses or internships yet.</span>}
                {courses.map((c) => (
                  <label key={c._id} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                    <input type="checkbox" checked={form.courseIds.includes(c._id)} onChange={() => toggleCourse(c._id)} style={{ width: "auto" }} />
                    <span>{c.title} <span className="admin-row-meta">· {c.type === "internship" ? "Internship" : "Course"}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <label style={{ display: "flex", gap: 10, alignItems: "center", margin: "0 0 16px", cursor: "pointer" }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} style={{ width: "auto" }} />
            <span>Active — students can use this code</span>
          </label>

          <p className="admin-row-meta" style={{ margin: "0 0 12px" }}>
            An offer code comes off the price first; a referral discount and referral credit then apply to what's left. Buyers always pay at least ₹1.
          </p>

          {error && <p className="form-error">{error}</p>}
          <div className="admin-actions">
            <button className="btn btn-solid" type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create code"}
            </button>
            {editingId && <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>

        {notice && <p className="ref-ok" role="status" style={{ marginTop: 20 }}>{notice}</p>}

        <h3 style={{ margin: "40px 0 16px" }}>All codes</h3>
        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : coupons.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No offer codes yet — create one above.</p>
        ) : (
          <div className="admin-list">
            {coupons.map((c) => (
              <div className="admin-row" key={c._id}>
                <div className="admin-row-main">
                  <b>
                    <code>{c.code}</code>{" "}
                    <span className={`admin-pill ${STATE_PILL[c.state] || "read"}`}>{STATE_LABEL[c.state] || c.state}</span>
                  </b>
                  <span className="admin-row-meta">{c.description ? `${c.description} · ` : ""}{describe(c)}</span>
                </div>
                <div className="admin-row-actions">
                  <button className="btn btn-ghost" onClick={() => copy(c)}>Copy</button>
                  <button className="btn btn-ghost" onClick={() => startEdit(c)}>Edit</button>
                  <button className="btn btn-ghost" onClick={() => toggleActive(c)}>{c.active ? "Switch off" : "Switch on"}</button>
                  <button className="btn btn-ghost admin-danger" onClick={() => remove(c)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
