import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetServices, adminCreateService, adminUpdateService, adminDeleteService,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { useDebouncedLoad } from "../../hooks/useDebouncedLoad.js";

const EMPTY_FORM = { title: "", tag: "", desc: "", points: "", order: "" };

function serviceToForm(s) {
  return {
    title: s.title || "", tag: s.tag || "", desc: s.desc || "",
    points: (s.points || []).join("\n"),
    order: String(s.order ?? ""),
  };
}

// Deliberately no price field anywhere here — services are quoted per
// engagement, not sold with an on-site price (see content.js's
// engagementModels / the site's no-pricing rule on this content).
export default function AdminServices() {
  usePageMeta({ title: "Manage Services | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async (query) => {
    setLoading(true);
    const res = await adminGetServices(query);
    setLoading(false);
    if (res.ok) { setServices(res.services || []); setError(""); }
    else {
      setError(res.error || "Could not load services.");
      if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
    }
  };

  useDebouncedLoad(load, q);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const startEdit = (s) => { setEditingId(s._id); setForm(serviceToForm(s)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); };

  const onSubmit = async (e) => {
    e.preventDefault();
    // A disabled submit button doesn't stop the browser's native form
    // submit on Enter inside a text field — without this guard, pressing
    // Enter twice quickly (or a slow network) fires two concurrent saves.
    if (saving) return;
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    const payload = {
      title: form.title.trim(), tag: form.tag.trim(), desc: form.desc.trim(),
      points: form.points.split("\n").map((p) => p.trim()).filter(Boolean),
      ...(form.order.trim() ? { order: Number(form.order) } : {}),
    };
    const res = editingId ? await adminUpdateService(editingId, payload) : await adminCreateService(payload);
    setSaving(false);
    if (res.ok) { cancelEdit(); load(q); }
    else setError(res.error || "Could not save.");
  };

  const toggleStatus = async (s) => {
    const res = await adminUpdateService(s._id, { status: s.status === "active" ? "inactive" : "active" });
    if (res.ok) load(q); else setError(res.error || "Could not update status.");
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete "${s.title}"? This cannot be undone.`)) return;
    const res = await adminDeleteService(s._id);
    if (res.ok) load(q); else setError(res.error || "Could not delete.");
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Services</h1>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <form onSubmit={onSubmit} className="admin-form">
          <h3 style={{ margin: "0 0 16px" }}>{editingId ? "Edit service" : "Add a new service"}</h3>
          <div className="admin-form-grid">
            <div className="field"><label>Title</label>
              <input value={form.title} onChange={set("title")} placeholder="Dynamic Website & Web Apps" /></div>
            <div className="field"><label>Tag</label>
              <input value={form.tag} onChange={set("tag")} placeholder="For businesses" /></div>
            <div className="field"><label>Display order</label>
              <input type="number" value={form.order} onChange={set("order")} placeholder="Auto (last)" /></div>
          </div>
          <div className="field"><label>Description</label>
            <textarea rows="2" value={form.desc} onChange={set("desc")} placeholder="Short description shown on the card" /></div>
          <div className="field"><label>Points (one per line)</label>
            <textarea rows="4" value={form.points} onChange={set("points")} placeholder={"Responsive design\nSEO-friendly structure"} /></div>
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
          placeholder="Search services by title, tag or description..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : services.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>{q ? "No services match that search." : "No services yet — add one above."}</p>
        ) : (
          <div className="admin-list">
            {services.map((s) => (
              <div className="admin-row" key={s._id}>
                <div className="admin-row-main">
                  <b>{s.title}</b>
                  <span className="admin-row-meta">{s.tag} · order {s.order}</span>
                </div>
                <div className="admin-row-actions">
                  <button className={`status-toggle ${s.status === "active" ? "open" : "closed"}`} onClick={() => toggleStatus(s)}
                    title={s.status === "active" ? "Shown on the public Services page — click to hide" : "Hidden from the public page — click to show"}>
                    {s.status === "active" ? "Visible" : "Hidden"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => startEdit(s)}>Edit</button>
                  <button className="btn btn-ghost admin-danger" onClick={() => remove(s)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
