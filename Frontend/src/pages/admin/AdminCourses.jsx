import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetCourses, adminCreateCourse, adminUpdateCourse, adminDeleteCourse,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";

const EMPTY_FORM = { type: "course", title: "", tag: "", desc: "", points: "", price: "", discountPercent: "0", durationDays: "" };

function courseToForm(c) {
  return {
    type: c.type === "internship" ? "internship" : "course",
    title: c.title || "", tag: c.tag || "", desc: c.desc || "",
    points: (c.points || []).join("\n"),
    price: String(c.price ?? ""), discountPercent: String(c.discountPercent ?? 0),
    durationDays: c.durationDays ? String(c.durationDays) : "",
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

  const startEdit = (c) => { setEditingId(c._id); setForm(courseToForm(c)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required."); return; }
    if (form.type === "course" && !form.price.trim()) { setError("Price is required for a course."); return; }
    setSaving(true);
    setError("");
    const payload = {
      type: form.type,
      title: form.title.trim(),
      tag: form.tag.trim(),
      desc: form.desc.trim(),
      points: form.points.split("\n").map((p) => p.trim()).filter(Boolean),
      price: form.type === "course" ? Number(form.price) : null,
      discountPercent: form.type === "course" ? Number(form.discountPercent) || 0 : 0,
      durationDays: form.durationDays ? Number(form.durationDays) : null,
    };
    const res = editingId ? await adminUpdateCourse(editingId, payload) : await adminCreateCourse(payload);
    setSaving(false);
    if (res.ok) { cancelEdit(); load(); }
    else setError(res.error || "Could not save.");
  };

  // The explicit trigger — saving a price never opens a course for sale by
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

  const courses = entries.filter((c) => c.type !== "internship");
  const internships = entries.filter((c) => c.type === "internship");

  const renderRow = (c) => {
    const hasPrice = c.price != null;
    return (
      <div className="admin-row" key={c._id}>
        <div className="admin-row-main">
          <b>{c.title}</b>
          <span className="admin-row-meta">
            {c.type === "internship"
              ? c.tag
              : <>₹{c.price ?? "—"} {c.discountPercent > 0 && `· ${c.discountPercent}% off`} · {c.tag}</>}
            {c.durationDays ? ` · ${c.durationDays} days` : ""}
          </span>
        </div>
        <div className="admin-row-actions">
          {c.type === "course" && (
            hasPrice ? (
              <button className={`status-toggle ${c.status}`} onClick={() => toggleStatus(c)}
                title={c.status === "open" ? "Buy now is live — click to take it off sale" : "Not for sale yet — click to enable Buy now"}>
                {c.status === "open" ? "Open" : "Closed"}
              </button>
            ) : (
              <span className="status-toggle closed" style={{ opacity: 0.5, cursor: "not-allowed" }}
                title="Set a price above before this can go on sale">
                No price yet
              </span>
            )
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
            <h2 style={{ margin: "14px 0 0" }}>Courses & Internships</h2>
          </div>
          <button className="btn btn-ghost" onClick={() => { logout(); navigate("/admin"); }}>Log out</button>
        </div>

        <form onSubmit={onSubmit} className="admin-form">
          <h3 style={{ margin: "0 0 16px" }}>{editingId ? "Edit entry" : "Add a new course or internship"}</h3>
          <div className="admin-form-grid">
            <div className="field"><label>Type</label>
              <select value={form.type} onChange={set("type")}>
                <option value="course">Course (paid, online)</option>
                <option value="internship">Internship (apply-only, no online price)</option>
              </select>
            </div>
            <div className="field"><label>Title</label>
              <input value={form.title} onChange={set("title")} placeholder="Full Stack (MERN) Development" /></div>
            <div className="field"><label>Tag</label>
              <input value={form.tag} onChange={set("tag")} placeholder="Beginner friendly" /></div>
            {form.type === "course" && (
              <>
                <div className="field"><label>Price (₹)</label>
                  <input type="number" min="0" value={form.price} onChange={set("price")} placeholder="4999" /></div>
                <div className="field"><label>Discount (%)</label>
                  <input type="number" min="0" max="100" value={form.discountPercent} onChange={set("discountPercent")} placeholder="0" /></div>
              </>
            )}
            <div className="field"><label>Duration (days)</label>
              <input type="number" min="1" value={form.durationDays} onChange={set("durationDays")} placeholder="30" /></div>
          </div>
          {form.type === "course" && (
            <p className="form-note" style={{ margin: "-8px 0 16px" }}>
              Saving a price doesn't put it on sale yet — use the Open/Closed toggle next to it in the list below when you're ready for "Buy now" to go live.
            </p>
          )}
          <div className="field"><label>Description</label>
            <textarea rows="2" value={form.desc} onChange={set("desc")} placeholder="Short description shown on the card" /></div>
          <div className="field"><label>Points (one per line)</label>
            <textarea rows="4" value={form.points} onChange={set("points")} placeholder={"Frontend fundamentals\nReact in depth\nNode.js & MongoDB"} /></div>
          {error && <p className="form-error">{error}</p>}
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-solid" type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create"}
            </button>
            {editingId && <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>

        {loading ? (
          <p style={{ color: "var(--muted)", marginTop: 32 }}>Loading...</p>
        ) : (
          <>
            <h3 style={{ margin: "40px 0 16px" }}>Courses</h3>
            {courses.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No courses yet — add one above.</p>
            ) : (
              <div className="admin-list">{courses.map(renderRow)}</div>
            )}

            <h3 style={{ margin: "40px 0 16px" }}>Internships</h3>
            {internships.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No internships yet — add one above.</p>
            ) : (
              <div className="admin-list">{internships.map(renderRow)}</div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
