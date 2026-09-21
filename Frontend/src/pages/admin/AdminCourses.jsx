import { useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getAdminToken, adminGetCourses, adminCreateCourse, adminUpdateCourse, adminDeleteCourse,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { TIER_ORDER, TIER_LABEL, offeredTiers, planPrice, formatINR } from "../../utils/tiers.js";

const emptyPlans = () => Object.fromEntries(TIER_ORDER.map((t) => [t, { price: "", discountPercent: "0", features: "" }]));
// outcomes / audience / prerequisites are typed one per line; faqs is a list of { q, a } rows.
const EMPTY_FORM = { type: "course", title: "", tag: "", desc: "", points: "", outcomes: "", audience: "", prerequisites: "", faqs: [], durationDays: "", plans: emptyPlans() };
const MAX_FAQS = 15;
const lines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean);

function courseToForm(c) {
  const plans = emptyPlans();
  for (const t of c.tiers || []) {
    if (plans[t.tier]) plans[t.tier] = { price: String(t.price), discountPercent: String(t.discountPercent ?? 0), features: (t.features || []).join("\n") };
  }
  return {
    type: c.type === "internship" ? "internship" : "course",
    title: c.title || "", tag: c.tag || "", desc: c.desc || "",
    points: (c.points || []).join("\n"),
    outcomes: (c.outcomes || []).join("\n"),
    audience: (c.audience || []).join("\n"),
    prerequisites: (c.prerequisites || []).join("\n"),
    faqs: (c.faqs || []).map((f) => ({ q: f.q || "", a: f.a || "" })),
    durationDays: c.durationDays ? String(c.durationDays) : "",
    plans,
  };
}

export default function AdminCourses() {
  usePageMeta({ title: "Manage Courses & Internships | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null); // null = create mode
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [params, setParams] = useSearchParams();

  // AdminGuard (see App.jsx) already keeps this route from mounting unless
  // logged in as admin — this only has to handle the session expiring
  // *while* already here. adminGetCourses() clears the stored token itself
  // on a 401; getAdminToken() coming back empty is how we notice that
  // happened and resync context state + bounce back to the login prompt.
  const load = async () => {
    setLoading(true);
    const res = await adminGetCourses();
    setLoading(false);
    if (res.ok) { setEntries(res.courses || []); setError(""); }
    else {
      setError(res.error || "Could not load courses.");
      if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
    }
  };

  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setPlan = (tier, k) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, plans: { ...f.plans, [tier]: { ...f.plans[tier], [k]: value } } }));
  };

  const setFaq = (i, k) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, faqs: f.faqs.map((row, j) => (j === i ? { ...row, [k]: value } : row)) }));
  };
  const addFaq = () => setForm((f) => (f.faqs.length >= MAX_FAQS ? f : { ...f, faqs: [...f.faqs, { q: "", a: "" }] }));
  const removeFaq = (i) => setForm((f) => ({ ...f, faqs: f.faqs.filter((_, j) => j !== i) }));

  const startEdit = (c) => { setEditingId(c._id); setForm(courseToForm(c)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancelEdit = () => { setEditingId(null); setForm({ ...EMPTY_FORM, plans: emptyPlans() }); };

  // Landed here as ?edit=<id> — from AdminApplications.jsx linking a course
  // application's title straight to its entry here. Same deep-link pattern
  // as Programs' own ?buy=<slug> (pages.jsx): open edit mode for the match
  // once `entries` has loaded, then drop the param so a refresh doesn't
  // re-trigger it.
  useEffect(() => {
    const id = params.get("edit");
    if (!id) return;
    const match = entries.find((c) => c._id === id);
    if (match) {
      startEdit(match);
      const nextParams = new URLSearchParams(params);
      nextParams.delete("edit");
      setParams(nextParams, { replace: true });
    }
  }, [params, entries, setParams]);

  const onSubmit = async (e) => {
    e.preventDefault();
    // A disabled submit button doesn't stop the browser's native form
    // submit on Enter inside a text field — without this guard, pressing
    // Enter twice quickly (or a slow network) fires two concurrent saves,
    // e.g. creating the same course/internship twice.
    if (saving) return;
    if (!form.title.trim()) { setError("Title is required."); return; }

    // A plan with a blank price is simply not offered. The server treats the
    // list as the complete set, so a plan cleared here is removed there too.
    const tiers = TIER_ORDER.map((tier) => {
      const p = form.plans[tier];
      return {
        tier,
        price: p.price.trim() ? Number(p.price) : null,
        discountPercent: Number(p.discountPercent) || 0,
        features: p.features.split("\n").map((f) => f.trim()).filter(Boolean),
      };
    });
    const bad = tiers.find((t) => t.price !== null && (!Number.isFinite(t.price) || t.price < 0));
    if (bad) { setError(`The ${TIER_LABEL[bad.tier]} price must be a number, 0 or more.`); return; }
    // A question needs an answer and the other way round; a row left completely blank is just ignored.
    const halfFilled = form.faqs.findIndex((f) => (f.q.trim() && !f.a.trim()) || (!f.q.trim() && f.a.trim()));
    if (halfFilled !== -1) { setError(`Question ${halfFilled + 1} needs both a question and an answer (or remove it).`); return; }
    if (form.type === "course" && !tiers.some((t) => t.price !== null)) {
      setError("Set a price on at least one plan (Basic, Plus or Pro) for a course.");
      return;
    }

    setSaving(true);
    setError("");
    const payload = {
      type: form.type,
      title: form.title.trim(),
      tag: form.tag.trim(),
      desc: form.desc.trim(),
      points: form.points.split("\n").map((p) => p.trim()).filter(Boolean),
      outcomes: lines(form.outcomes),
      audience: lines(form.audience),
      prerequisites: lines(form.prerequisites),
      faqs: form.faqs.filter((f) => f.q.trim() && f.a.trim()).map((f) => ({ q: f.q.trim(), a: f.a.trim() })),
      tiers,
      durationDays: form.durationDays ? Number(form.durationDays) : null,
    };
    const res = editingId ? await adminUpdateCourse(editingId, payload) : await adminCreateCourse(payload);
    setSaving(false);
    if (res.ok) { cancelEdit(); load(); }
    else setError(res.error || "Could not save.");
  };

  // The explicit trigger — saving prices never opens a course for sale by
  // itself (see routes/courses.js); this toggle is the separate, deliberate
  // step that actually does.
  const toggleStatus = async (c) => {
    const res = await adminUpdateCourse(c._id, { status: c.status === "open" ? "closed" : "open" });
    if (res.ok) load(); else setError(res.error || "Could not update status.");
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
    const res = await adminDeleteCourse(c._id);
    if (res.ok) load(); else setError(res.error || "Could not delete.");
  };

  const matches = (c) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return c.title.toLowerCase().includes(needle) || (c.tag || "").toLowerCase().includes(needle);
  };
  const courses = entries.filter((c) => c.type !== "internship" && matches(c));
  const internships = entries.filter((c) => c.type === "internship" && matches(c));

  const renderRow = (c) => {
    const plans = offeredTiers(c);
    const hasPlans = plans.length > 0;
    const cheapest = hasPlans ? Math.min(...plans.map(planPrice)) : null;
    return (
      <div className="admin-row" key={c._id}>
        <div className="admin-row-main">
          <b>{c.title}</b>
          <span className="admin-row-meta">
            {hasPlans
              ? <>{plans.map((p) => TIER_LABEL[p.tier]).join(" · ")} · from {formatINR(cheapest)} · {c.tag}</>
              : <>Apply-only · {c.tag}</>}
            {c.durationDays ? ` · ${c.durationDays} days` : ""}
          </span>
        </div>
        <div className="admin-row-actions">
          {hasPlans ? (
            <button className={`status-toggle ${c.status}`} onClick={() => toggleStatus(c)}
              title={c.status === "open" ? "Buy now is live — click to take it off sale" : "Not for sale yet — click to enable Buy now"}>
              {c.status === "open" ? "Open" : "Closed"}
            </button>
          ) : (
            <span className="status-toggle closed" style={{ opacity: 0.5, cursor: "not-allowed" }}
              title={c.type === "internship" ? "Apply-only — set a price on a plan above to make this purchasable" : "Set a price on a plan above before this can go on sale"}>
              {c.type === "internship" ? "Apply-only" : "No price yet"}
            </span>
          )}
          <button className="btn btn-ghost" onClick={() => startEdit(c)}>Edit</button>
          <button className="btn btn-ghost admin-danger" onClick={() => remove(c)}>Delete</button>
        </div>
      </div>
    );
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Courses & Internships</h1>
          </div>
          <button className="btn btn-ghost" onClick={() => { logout(); navigate("/admin"); }}>Log out</button>
        </div>

        <form onSubmit={onSubmit} className="admin-form">
          <h3 style={{ margin: "0 0 16px" }}>{editingId ? "Edit entry" : "Add a new course or internship"}</h3>
          <div className="admin-form-grid">
            <div className="field"><label>Type</label>
              <select value={form.type} onChange={set("type")}>
                <option value="course">Course</option>
                <option value="internship">Internship</option>
              </select>
            </div>
            <div className="field"><label>Title</label>
              <input value={form.title} onChange={set("title")} placeholder="Full Stack (MERN) Development" /></div>
            <div className="field"><label>Tag</label>
              <input value={form.tag} onChange={set("tag")} placeholder="Beginner friendly" /></div>
            <div className="field"><label>Duration (days)</label>
              <input type="number" min="1" value={form.durationDays} onChange={set("durationDays")} placeholder="30" /></div>
          </div>
          <div className="field"><label>Description</label>
            <textarea rows="2" value={form.desc} onChange={set("desc")} placeholder="Short description shown on the card" /></div>
          <div className="field"><label>Points (one per line)</label>
            <textarea rows="4" value={form.points} onChange={set("points")} placeholder={"Frontend fundamentals\nReact in depth\nNode.js & MongoDB"} /></div>

          <fieldset className="plan-editor-set">
            <legend>Course page content (optional)</legend>
            <p className="admin-row-meta" style={{ margin: "0 0 14px" }}>
              Shown on this course's own page. Anything you leave empty is simply not shown, so add only what's true and useful.
            </p>
            <div className="field"><label htmlFor="cc-outcomes">What you'll learn (one per line)</label>
              <textarea id="cc-outcomes" rows="5" value={form.outcomes} onChange={set("outcomes")} placeholder={"Build and deploy a REST API\nWork with a real database"} /></div>
            <div className="admin-form-grid admin-form-grid--2">
              <div className="field"><label htmlFor="cc-audience">Who it's for (one per line)</label>
                <textarea id="cc-audience" rows="4" value={form.audience} onChange={set("audience")} placeholder={"Final-year students\nCareer switchers"} /></div>
              <div className="field"><label htmlFor="cc-prereq">Before you start (one per line)</label>
                <textarea id="cc-prereq" rows="4" value={form.prerequisites} onChange={set("prerequisites")} placeholder={"A laptop and internet connection\nBasic programming"} /></div>
            </div>
            <div className="faq-editor">
              <span className="admin-row-meta" style={{ display: "block", margin: "4px 0 10px" }}>Questions &amp; answers ({form.faqs.length}/{MAX_FAQS})</span>
              {form.faqs.map((f, i) => (
                <div className="faq-editor-row" key={i}>
                  <input aria-label={`Question ${i + 1}`} value={f.q} onChange={setFaq(i, "q")} placeholder="Question" maxLength={200} />
                  <textarea aria-label={`Answer ${i + 1}`} rows="3" value={f.a} onChange={setFaq(i, "a")} placeholder="Answer" maxLength={1500} />
                  <button type="button" className="btn btn-ghost admin-danger" onClick={() => removeFaq(i)} aria-label={`Remove question ${i + 1}`}>Remove</button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" onClick={addFaq} disabled={form.faqs.length >= MAX_FAQS}>+ Add a question</button>
            </div>
          </fieldset>

          <fieldset className="plan-editor-set">
            <legend>Plans &amp; pricing</legend>
            <p className="form-note" style={{ margin: "0 0 14px" }}>
              Offer up to three plans. A plan with a blank price isn't offered.
              {form.type === "internship"
                ? " Leave all three blank to keep this an apply-only internship (shows \"Request to apply\")."
                : " A course needs at least one priced plan."}
              {" "}Saving prices doesn't put it on sale yet — use the Open/Closed toggle in the list below when you're ready for
              purchases to go live. What you list under each plan is shown to buyers; it doesn't restrict course access.
            </p>
            <div className="plan-editors">
              {TIER_ORDER.map((tier) => (
                <div className="plan-editor" key={tier}>
                  <h4>{TIER_LABEL[tier]}</h4>
                  <div className="field"><label htmlFor={`plan-${tier}-price`}>Price (₹)</label>
                    <input id={`plan-${tier}-price`} type="number" min="0" value={form.plans[tier].price} onChange={setPlan(tier, "price")} placeholder="Not offered" /></div>
                  <div className="field"><label htmlFor={`plan-${tier}-discount`}>Discount (%)</label>
                    <input id={`plan-${tier}-discount`} type="number" min="0" max="100" value={form.plans[tier].discountPercent} onChange={setPlan(tier, "discountPercent")} placeholder="0" /></div>
                  <div className="field"><label htmlFor={`plan-${tier}-features`}>What's included (one per line)</label>
                    <textarea id={`plan-${tier}-features`} rows="5" value={form.plans[tier].features} onChange={setPlan(tier, "features")}
                      placeholder={tier === "basic" ? "Recorded lectures\nCertificate" : tier === "plus" ? "Everything in Basic\nLive doubt sessions" : "Everything in Plus\n1:1 mentoring"} /></div>
                </div>
              ))}
            </div>
          </fieldset>

          {error && <p className="form-error">{error}</p>}
          <div className="admin-actions">
            <button className="btn btn-solid" type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create"}
            </button>
            {editingId && <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>

        <input
          className="admin-search"
          type="search"
          style={{ marginTop: 40 }}
          placeholder="Search courses & internships by title or tag..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {loading ? (
          <p style={{ color: "var(--muted)", marginTop: 32 }}>Loading...</p>
        ) : (
          <>
            <h3 style={{ margin: "40px 0 16px" }}>Courses</h3>
            {courses.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>{q ? "No courses match that search." : "No courses yet — add one above."}</p>
            ) : (
              <div className="admin-list">{courses.map(renderRow)}</div>
            )}

            <h3 style={{ margin: "40px 0 16px" }}>Internships</h3>
            {internships.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>{q ? "No internships match that search." : "No internships yet — add one above."}</p>
            ) : (
              <div className="admin-list">{internships.map(renderRow)}</div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
