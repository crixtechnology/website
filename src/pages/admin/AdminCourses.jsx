import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminLogout, adminGetCourses, adminCreateCourse, adminUpdateCourse, adminDeleteCourse,
} from "../../services/api.js";

const EMPTY_FORM = { title: "", tag: "", desc: "", points: "", price: "", discountPercent: "0", durationDays: "" };

function courseToForm(c) {
  return {
    title: c.title || "", tag: c.tag || "", desc: c.desc || "",
    points: (c.points || []).join("\n"),
    price: String(c.price ?? ""), discountPercent: String(c.discountPercent ?? 0),
    durationDays: c.durationDays ? String(c.durationDays) : "",
  };
}

export default function AdminCourses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null); // null = create mode
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await adminGetCourses();
    setLoading(false);
    if (!getAdminToken()) { navigate("/admin/login", { replace: true }); return; }
    if (res.ok) { setCourses(res.courses || []); setError(""); }
    else setError(res.error || "Could not load courses.");
  };

  useEffect(() => {
    if (!getAdminToken()) { navigate("/admin/login", { replace: true }); return; }
    load();
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const startEdit = (c) => { setEditingId(c._id); setForm(courseToForm(c)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.price.trim()) { setError("Title and price are required."); return; }
    setSaving(true);
    setError("");
    const payload = {
      title: form.title.trim(),
      tag: form.tag.trim(),
      desc: form.desc.trim(),
      points: form.points.split("\n").map((p) => p.trim()).filter(Boolean),
      price: Number(form.price),
      discountPercent: Number(form.discountPercent) || 0,
      durationDays: form.durationDays ? Number(form.durationDays) : null,
    };
    const res = editingId ? await adminUpdateCourse(editingId, payload) : await adminCreateCourse(payload);
    setSaving(false);
    if (res.ok) { cancelEdit(); load(); }
    else setError(res.error || "Could not save course.");
  };

  const toggleStatus = async (c) => {
    const res = await adminUpdateCourse(c._id, { status: c.status === "open" ? "closed" : "open" });
    if (res.ok) load(); else setError(res.error || "Could not update status.");
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
    const res = await adminDeleteCourse(c._id);
    if (res.ok) load(); else setError(res.error || "Could not delete course.");
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h2 style={{ margin: "14px 0 0" }}>Courses</h2>
          </div>
          <button className="btn btn-ghost" onClick={() => { adminLogout(); navigate("/admin/login"); }}>Log out</button>
        </div>

        <form onSubmit={onSubmit} className="admin-form">
          <h3 style={{ margin: "0 0 16px" }}>{editingId ? "Edit course" : "Add a new course"}</h3>
          <div className="admin-form-grid">
            <div className="field"><label>Title</label>
              <input value={form.title} onChange={set("title")} placeholder="Full Stack (MERN) Development" /></div>
            <div className="field"><label>Tag</label>
              <input value={form.tag} onChange={set("tag")} placeholder="Beginner friendly" /></div>
            <div className="field"><label>Price (₹)</label>
              <input type="number" min="0" value={form.price} onChange={set("price")} placeholder="4999" /></div>
            <div className="field"><label>Discount (%)</label>
              <input type="number" min="0" max="100" value={form.discountPercent} onChange={set("discountPercent")} placeholder="0" /></div>
            <div className="field"><label>Duration (days)</label>
              <input type="number" min="1" value={form.durationDays} onChange={set("durationDays")} placeholder="30" /></div>
          </div>
          <div className="field"><label>Description</label>
            <textarea rows="2" value={form.desc} onChange={set("desc")} placeholder="Short description shown on the card" /></div>
          <div className="field"><label>Points (one per line)</label>
            <textarea rows="4" value={form.points} onChange={set("points")} placeholder={"Frontend fundamentals\nReact in depth\nNode.js & MongoDB"} /></div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-solid" type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create course"}
            </button>
            {editingId && <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>}
          </div>
          {error && <p className="form-note">{error}</p>}
        </form>

        <h3 style={{ margin: "40px 0 16px" }}>All courses</h3>
        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : courses.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No courses yet — add one above.</p>
        ) : (
          <div className="admin-list">
            {courses.map((c) => (
              <div className="admin-row" key={c._id}>
                <div className="admin-row-main">
                  <b>{c.title}</b>
                  <span className="admin-row-meta">
                    ₹{c.price} {c.discountPercent > 0 && `· ${c.discountPercent}% off`} · {c.tag}
                    {c.durationDays ? ` · ${c.durationDays} days` : ""}
                  </span>
                </div>
                <div className="admin-row-actions">
                  <button className={`status-toggle ${c.status}`} onClick={() => toggleStatus(c)}>
                    {c.status === "open" ? "Open" : "Closed"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => startEdit(c)}>Edit</button>
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
