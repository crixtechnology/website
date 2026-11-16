import { useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getAdminToken, adminGetCourses, adminCreateCourse, adminUpdateCourse, adminDeleteCourse,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { TIER_ORDER, TIER_LABEL, offeredTiers, planPrice, listPrice, formatINR } from "../../utils/tiers.js";
import { startsInFuture, formatStartDate, toStartDateInput } from "../../utils/startDate.js";
import { formatDuration, INTERNSHIP_DURATIONS } from "../../utils/duration.js";

// What the form adds: a Training + Internship track, a courses-table entry
// (type "internship") sold on /training-internship as a program card — 1, 2, 3
// or 6 months long, at the price set here, paid online through Razorpay. Every
// program includes an offer letter, certificate and LOR. Courses
// were dropped. Free internships are not managed in Admin: the Free Internship
// page is static, its roles written in the website's code
// (Frontend/src/data/freeInternships.json).

// price is the FINAL price (what the student pays); originalPrice is the
// optional higher price shown struck through beside it.
const emptyPlans = () => Object.fromEntries(TIER_ORDER.map((t) => [t, { price: "", originalPrice: "", features: "" }]));
// outcomes / audience / prerequisites / faqs are no longer edited here (the
// "More for the track's own page" section was removed); a card that already has
// them keeps them, since the form still carries and re-sends what it loaded.
// skills (comma-separated), responsibilities and eligibility (one per line), stipend, experience,
// mode and positions: the same details a Careers role shows.
const EMPTY_FORM = {
  type: "internship", title: "", tag: "", desc: "", points: "", outcomes: "", audience: "", prerequisites: "", faqs: [], durationDays: "", startsAt: "",
  skills: "", responsibilities: "", eligibility: "", stipend: "", stipendTrainingMonths: "0", experience: "", mode: "", positions: "",
  // Extras only some programs include (offer letter, certificate and LOR come with every one).
  joiningKit: false, linkedinRecognition: false,
  // Training + Internship card: one entry per duration (1 / 2 / 3 / 6 months),
  // each its own card; entries sharing a group link to each other. startingFrom is the card's optional "Starting from …" tag —
  // roughly when the batch is expected to start (not a price, not the exact date).
  group: "", startingFrom: "",
  plans: emptyPlans(),
};
const lines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean);

function courseToForm(c) {
  const plans = emptyPlans();
  for (const t of c.tiers || []) {
    // An older plan stored a price and a % discount: show it as original and
    // final price, which is how it is saved from now on.
    const final = planPrice(t);
    const original = t.originalPrice != null && t.originalPrice > final ? t.originalPrice : t.price > final ? t.price : null;
    if (plans[t.tier]) plans[t.tier] = { price: String(final), originalPrice: original === null ? "" : String(original), features: (t.features || []).join("\n") };
  }
  return {
    type: "internship",
    title: c.title || "", tag: c.tag || "", desc: c.desc || "",
    points: (c.points || []).join("\n"),
    outcomes: (c.outcomes || []).join("\n"),
    audience: (c.audience || []).join("\n"),
    prerequisites: (c.prerequisites || []).join("\n"),
    skills: (c.skills || []).join(", "),
    responsibilities: (c.responsibilities || []).join("\n"),
    eligibility: (c.eligibility || []).join("\n"),
    stipend: c.stipend || "", stipendTrainingMonths: String(c.stipendTrainingMonths || 0), experience: c.experience || "", mode: c.mode || "",
    joiningKit: !!c.joiningKit, linkedinRecognition: !!c.linkedinRecognition,
    group: c.group || "", startingFrom: c.startingFrom || "",
    positions: c.positions ? String(c.positions.total) : "",
    faqs: (c.faqs || []).map((f) => ({ q: f.q || "", a: f.a || "" })),
    durationDays: c.durationDays ? String(c.durationDays) : "",
    startsAt: toStartDateInput(c.startsAt),
    plans,
  };
}

// Choices for "Training months (no stipend)": none, or 1 up to one less than
// the program's length (at least one month must pay). With no length set, up
// to 5. The current value stays listed so editing never silently changes it.
function stipendTrainingChoices(durationDays, current) {
  const months = Math.round(Number(durationDays) / 30);
  const max = months > 0 ? months - 1 : 5;
  const list = Array.from({ length: max + 1 }, (_, m) => m);
  const cur = Number(current) || 0;
  if (!list.includes(cur)) list.push(cur);
  return list;
}

export default function AdminCourses() {
  usePageMeta({ title: "Manage Training + Internship | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null); // null = create mode
  // Title of the card the form was filled from by "Copy" (still create mode), else null.
  const [copyOf, setCopyOf] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [params, setParams] = useSearchParams();
  // The long form stays shut until it's needed (Add, Edit or Copy), so the
  // list is the first thing on the page instead of a screen's scroll away.
  const [formOpen, setFormOpen] = useState(false);
  // Program cards of one length only: "all", or days (30 / 60 / 90 / 180).
  const [durFilter, setDurFilter] = useState("all");

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

  // Domain groups already in use, so a second duration joins the right one.
  const groupNames = [...new Set(entries.map((c) => (c.group || "").trim()).filter(Boolean))].sort();

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setPlan = (tier, k) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, plans: { ...f.plans, [tier]: { ...f.plans[tier], [k]: value } } }));
  };

  const startEdit = (c) => {
    setCopyOf(null);
    setFormOpen(true);
    setEditingId(c._id); setForm(courseToForm(c)); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // Copy: the form is filled with an existing card's details but stays in create
  // mode, so the same program in another duration (or batch) only needs its
  // duration, price and start changed before Create. The original is untouched.
  const startCopy = (c) => {
    setEditingId(null);
    setCopyOf(c.title);
    setError("");
    setFormOpen(true);
    setForm(courseToForm(c)); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // Also what a successful save calls: the form empties and shuts, back to the list.
  const cancelEdit = () => { setEditingId(null); setCopyOf(null); setFormOpen(false); setForm({ ...EMPTY_FORM, type: "internship", plans: emptyPlans() }); };
  // "+ Add program card": a blank form.
  const openAdd = () => {
    setEditingId(null); setCopyOf(null);
    setForm({ ...EMPTY_FORM, type: "internship", plans: emptyPlans() });
    setError(""); setFormOpen(true);
  };

  // Landed here as ?edit=<id> — from AdminApplications.jsx linking a course
  // application's title straight to its entry here. Same deep-link pattern
  // as Programs' own ?buy=<slug> (pages.jsx): open edit mode for the match
  // once `entries` has loaded, then drop the param so a refresh doesn't
  // re-trigger it.
  useEffect(() => {
    if (!params.get("type")) return;
    const nextParams = new URLSearchParams(params);
    nextParams.delete("type");
    setParams(nextParams, { replace: true });
  }, [params, setParams]);
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

    // A program has one price, stored as its Basic plan. A blank price means
    // none (the card shows Request to apply). The server treats the list as the
    // complete set, so a card's older Plus / Pro plans go when it is saved.
    const one = form.plans.basic;
    const tiers = [{
      tier: "basic",
      price: one.price.trim() ? Number(one.price) : null,
      originalPrice: one.originalPrice.trim() ? Number(one.originalPrice) : null,
      discountPercent: 0, // the final price is typed as it is; nothing more comes off it
      features: one.features.split("\n").map((f) => f.trim()).filter(Boolean),
    }];
    if (tiers[0].price !== null && (!Number.isFinite(tiers[0].price) || tiers[0].price < 0)) { setError("The final price must be a number, 0 or more."); return; }
    if (tiers[0].originalPrice !== null) {
      if (tiers[0].price === null) { setError("Enter the final price too — the original price is only shown crossed out beside it."); return; }
      if (!Number.isFinite(tiers[0].originalPrice) || tiers[0].originalPrice <= tiers[0].price) {
        setError("The original price must be higher than the final price (or leave it blank for no crossed-out price).");
        return;
      }
    }
    const positions = form.positions.trim() ? Number(form.positions) : null;
    if (positions !== null && (!Number.isInteger(positions) || positions < 1 || positions > 1000)) {
      setError("Positions must be a whole number from 1 to 1000 (or blank for no limit).");
      return;
    }
    // Training is paid, not free: a ₹0 plan isn't allowed.
    if (tiers.some((t) => t.price === 0)) {
      setError("Training is paid, not free — set a price above ₹0 (or leave it blank).");
      return;
    }

    setSaving(true);
    setError("");
    const payload = {
      type: "internship",
      title: form.title.trim(),
      tag: form.tag.trim(),
      desc: form.desc.trim(),
      points: form.points.split("\n").map((p) => p.trim()).filter(Boolean),
      outcomes: lines(form.outcomes),
      audience: lines(form.audience),
      prerequisites: lines(form.prerequisites),
      skills: form.skills.split(/[,\n]/).map((v) => v.trim()).filter(Boolean),
      responsibilities: lines(form.responsibilities),
      eligibility: lines(form.eligibility),
      stipend: form.stipend.trim(), experience: form.experience.trim(), mode: form.mode.trim(),
      // No stipend means no unpaid training months to show either.
      stipendTrainingMonths: form.stipend.trim() ? Number(form.stipendTrainingMonths) || 0 : 0,
      joiningKit: !!form.joiningKit, linkedinRecognition: !!form.linkedinRecognition,
      group: form.group.trim(), startingFrom: form.startingFrom.trim(),
      positions,
      faqs: form.faqs.filter((f) => f.q.trim() && f.a.trim()).map((f) => ({ q: f.q.trim(), a: f.a.trim() })),
      tiers,
      durationDays: form.durationDays ? Number(form.durationDays) : null,
        startsAt: "", // no program has an exact start date: clears any old one
    };
    const res = editingId ? await adminUpdateCourse(editingId, payload) : await adminCreateCourse(payload);
    setSaving(false);
    if (res.ok) { cancelEdit(); load(); }
    else setError(res.error || "Could not save.");
  };

  // Open/Closed: whether the program can be joined. A closed one shows
  // "Currently closed" on the website and refuses new enrollments and applications.
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
    return [c.title, c.tag, c.group, formatDuration(c.durationDays)].some((v) => String(v || "").toLowerCase().includes(needle));
  };
  const allCards = entries.filter((c) => c.type === "internship");
  const internships = allCards.filter((c) => matches(c) && (durFilter === "all" || Number(c.durationDays) === durFilter));

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
              ? <>{plans.length > 1 ? `${plans.map((p) => TIER_LABEL[p.tier]).join(" · ")} · from ` : ""}{formatINR(cheapest)}
                {plans.length === 1 && listPrice(plans[0]) ? ` (was ${formatINR(listPrice(plans[0]))})` : ""}</>
              : <>No price — apply-only</>}
            {c.tag ? ` · ${c.tag}` : ""}
            {c.durationDays ? ` · ${formatDuration(c.durationDays)}` : ""}
            {c.group ? ` · group: ${c.group}` : ""}
            {c.startingFrom ? ` · starts ${c.startingFrom}` : ""}
            {c.startsAt ? ` · ${startsInFuture(c) ? "starts" : "started"} ${formatStartDate(c.startsAt)}` : ""}
          </span>
          {c.positions && (
            <span className="admin-row-meta" style={c.positions.left === 0 ? { color: "var(--amber)" } : undefined}>
              {c.positions.filled} of {c.positions.total} {c.type === "internship" ? "position" : "seat"}{c.positions.total === 1 ? "" : "s"} filled
              {c.positions.left === 0 ? " — full, can't be bought" : ` · ${c.positions.left} left`}
            </span>
          )}
        </div>
        <div className="admin-row-actions">
          <button className={`status-toggle ${c.status === "closed" ? "closed" : "open"}`} onClick={() => toggleStatus(c)}
            title={c.status === "closed"
              ? "Closed — the website shows Currently closed and takes no enrollments. Click to open it."
              : "Open — students can enroll and pay online. Click to close it."}>
            {c.status === "closed" ? "Closed" : "Open"}
          </button>
          <button className="btn btn-ghost" onClick={() => startEdit(c)}>Edit</button>
          <button className="btn btn-ghost" onClick={() => startCopy(c)} title="Start a new card with these details — for another duration or batch">Copy</button>
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
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Training + Internship</h1>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
              Training + Internship program cards. Careers roles are on Job openings. The Free Internship page is fixed in the website's code,
              so its roles and apply link aren't edited here.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => { logout(); navigate("/admin"); }}>Log out</button>
        </div>

        {!formOpen ? (
          <div className="list-toolbar">
            <button type="button" className="btn btn-solid" onClick={openAdd}>+ Add program card</button>
          </div>
        ) : (
        <form onSubmit={onSubmit} className="admin-form">
          {/* Laid out like the Careers form (AdminJobOpenings.jsx
              OpeningForm): the same fields in the same order. Where those have
              their aptitude test, training has its fee — it has no test. */}
          <h3 style={{ margin: "0 0 16px" }}>{editingId ? "Edit this Training + Internship program card" : copyOf ? "Add a copy of a program card" : "Add a Training + Internship program card"}</h3>
          {copyOf && (
            <p className="form-note copy-note" style={{ margin: "0 0 16px" }}>
              Filled in from <b>{copyOf}</b>. Change what differs — usually the title, duration, price and start — then press Create.
              This adds a new card; the original stays as it is.
            </p>
          )}
          <div className="admin-form-grid">
            <div className="field"><label htmlFor="courses-title">Title</label>
              <input id="courses-title" value={form.title} onChange={set("title")} placeholder="Full Stack (MERN) Development" /></div>
            <div className="field"><label htmlFor="courses-group">Domain group (optional)</label>
              <input id="courses-group" list="courses-group-list" maxLength={60} value={form.group} onChange={set("group")} placeholder="e.g. MERN Stack" />
              <datalist id="courses-group-list">
                {groupNames.map((g) => <option key={g} value={g} />)}
              </datalist>
              <p className="form-note" style={{ margin: "6px 0 0" }}>Add one entry per duration. Entries of one domain share a group, so each one's page links to its other durations.</p></div>
          </div>
          <div className="field"><label htmlFor="courses-description">Short description</label>
            <textarea id="courses-description" rows="2" value={form.desc} onChange={set("desc")} placeholder="Shown on the card" /></div>
          <div className="field"><label htmlFor="cd-skills">Skills (separate with commas)</label>
            <input id="cd-skills" value={form.skills} onChange={set("skills")} placeholder="HTML, CSS, JavaScript, React basics" /></div>
          <div className="admin-form-grid admin-form-grid--2">
            <div className="field"><label htmlFor="cd-resp">Responsibilities (one per line)</label>
              <textarea id="cd-resp" rows="4" value={form.responsibilities} onChange={set("responsibilities")} placeholder={"Ship features with the team\nJoin weekly reviews"} /></div>
            <div className="field"><label htmlFor="cd-elig">Eligibility (one per line)</label>
              <textarea id="cd-elig" rows="4" value={form.eligibility} onChange={set("eligibility")} placeholder={"Students of any year\nA laptop with internet"} /></div>
          </div>
          <div className="admin-form-grid">
            <div className="field"><label htmlFor="cd-positions">Positions available</label>
              <input id="cd-positions" type="number" min="1" max="1000" step="1" value={form.positions} onChange={set("positions")} placeholder="No limit" />
              <p className="form-note" style={{ margin: "6px 0 0" }}>Each enrolled student fills one. When all are filled, the track shows “All positions filled”.</p></div>
            <div className="field"><label htmlFor="cd-stipend">Stipend (empty = none)</label>
              <input id="cd-stipend" value={form.stipend} onChange={set("stipend")} placeholder="Up to ₹6,000/month (performance based)" />
              {form.stipend.trim() && (
                <>
                  <label htmlFor="cd-stipend-training" className="field-label" style={{ marginTop: 14 }}>Training months (no stipend)</label>
                  <select id="cd-stipend-training" value={form.stipendTrainingMonths} onChange={set("stipendTrainingMonths")}>
                    {stipendTrainingChoices(form.durationDays, form.stipendTrainingMonths).map((m) => (
                      <option key={m} value={String(m)}>{m === 0 ? "None — stipend from month 1" : `First ${m} month${m === 1 ? "" : "s"} — stipend from month ${m + 1}`}</option>
                    ))}
                  </select>
                  <p className="form-note" style={{ margin: "6px 0 0" }}>The opening months that are training only. The stipend is paid for the months after them.</p>
                </>
              )}</div>
            <div className="field"><span className="field-label">Extras this program includes</span>
              <label className="check-row"><input type="checkbox" checked={!!form.joiningKit}
                onChange={(e) => setForm({ ...form, joiningKit: e.target.checked })} /> Joining kit</label>
              <label className="check-row" style={{ marginTop: 8 }}><input type="checkbox" checked={!!form.linkedinRecognition}
                onChange={(e) => setForm({ ...form, linkedinRecognition: e.target.checked })} /> LinkedIn recognition</label>
              <p className="form-note" style={{ margin: "6px 0 0" }}>Offer letter, training certificate and LOR come with every program. Ticked extras show as “Also includes” on the card and page.</p></div>
            <div className="field"><label htmlFor="cd-exp">Experience</label>
              <input id="cd-exp" value={form.experience} onChange={set("experience")} placeholder="0–1 year (freshers welcome)" /></div>
            <div className="field"><label htmlFor="ac-duration">Duration</label>
              <select id="ac-duration" value={form.durationDays} onChange={set("durationDays")}>
                <option value="">Not set (access never expires)</option>
                {INTERNSHIP_DURATIONS.map((d) => <option key={d} value={String(d)}>{formatDuration(d)}</option>)}
                {/* A track from before this list existed may carry another length: keep it selectable so editing doesn't silently change it. */}
                {form.durationDays && !INTERNSHIP_DURATIONS.includes(Number(form.durationDays)) && (
                  <option value={form.durationDays}>{formatDuration(form.durationDays)} (current)</option>
                )}
              </select>
              <p className="form-note" style={{ margin: "6px 0 0" }}>The website's duration filter (All / 1 / 2 / 3 / 6 months) shows this card under the length you pick. With none set it appears only under All.</p></div>
            <div className="field"><label htmlFor="cd-mode">Mode</label>
              <input id="cd-mode" value={form.mode} onChange={set("mode")} placeholder="Remote / Ahmedabad" /></div>
            <div className="field"><label htmlFor="courses-starting-from">Starts on (optional)</label>
              <input id="courses-starting-from" maxLength={60} value={form.startingFrom} onChange={set("startingFrom")} placeholder="e.g. 2nd week of January" />
              <p className="form-note" style={{ margin: "6px 0 0" }}>Roughly when the batch starts — an estimate shown on the card. Leave empty to show nothing.</p></div>
          </div>

          <h3 style={{ margin: "12px 0 8px" }}>Price for this program</h3>
          <p className="form-note" style={{ margin: "0 0 14px" }}>
            The final price is what students pay online (Razorpay) when they tap Enroll now. Add an original price to show it crossed out beside the
            final price — e.g. original ₹1,999, final ₹1,499. With the final price blank, the card shows Request to apply instead.
            Use the Open/Closed switch in the list to stop or restart enrollment.
          </p>
          {editingId && (form.plans.plus.price.trim() || form.plans.pro.price.trim()) && (
            <p className="form-error" style={{ margin: "0 0 14px" }}>
              This card also has an older Plus or Pro plan. Saving keeps only the one price below and removes those plans.
            </p>
          )}
          <div className="admin-form-grid admin-form-grid--2">
            <div className="field"><label htmlFor="plan-basic-original">Original price (₹, optional)</label>
              <input id="plan-basic-original" type="number" min="0" value={form.plans.basic.originalPrice} onChange={setPlan("basic", "originalPrice")} placeholder="e.g. 1999 — shown crossed out" /></div>
            <div className="field"><label htmlFor="plan-basic-price">Final price (₹)</label>
              <input id="plan-basic-price" type="number" min="0" value={form.plans.basic.price} onChange={setPlan("basic", "price")} placeholder="e.g. 1499 — what the student pays" /></div>
          </div>
          {(() => {
            const o = Number(form.plans.basic.originalPrice), f = Number(form.plans.basic.price);
            return form.plans.basic.originalPrice.trim() && form.plans.basic.price.trim() && o > f && f >= 0 ? (
              <p className="form-note price-preview" style={{ margin: "-4px 0 14px" }}>
                Shown on the card as: <span className="price-old">{formatINR(o)}</span> <b>{formatINR(f)}</b> <span className="price-off">{Math.round(((o - f) / o) * 100)}% off</span>
              </p>
            ) : null;
          })()}
          <div className="field"><label htmlFor="plan-basic-features">What's included (one per line)</label>
            <textarea id="plan-basic-features" rows="4" value={form.plans.basic.features} onChange={setPlan("basic", "features")}
              placeholder={"Live classes\nMentor support\nTraining certificate"} /></div>

          {error && <p className="form-error">{error}</p>}
          <div className="admin-actions">
            <button className="btn btn-solid" type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
          </div>
        </form>
        )}

        {/* The list: searchable, and program cards by length. */}
        <h2 style={{ fontSize: "1.15rem", margin: `${formOpen ? 40 : 8}px 0 0` }}>
          Program cards <span className="list-tab-count">{allCards.length}</span>
        </h2>
        <div className="list-toolbar">
          <input
            className="admin-search" aria-label="Search by title, group or duration"
            type="search"
            placeholder="Search program cards by title, group or duration..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="filter-pills" role="group" aria-label="Show program cards of one duration">
            {["all", ...INTERNSHIP_DURATIONS].map((d) => (
              <button key={d} type="button" className={`filter-pill${durFilter === d ? " on" : ""}`} aria-pressed={durFilter === d} onClick={() => setDurFilter(d)}>
                {d === "all" ? "All" : formatDuration(d)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)", marginTop: 32 }}>Loading...</p>
        ) : (
          <>
            <h3 className="sr-only">Training + Internship program cards</h3>
            {!formOpen && error && <p className="form-error">{error}</p>}
            {internships.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>{q || durFilter !== "all" ? "No program cards match." : "No program cards yet — press Add program card."}</p>
            ) : (
              <div className="admin-list">{internships.map(renderRow)}</div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
