import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  adminGetCourses, adminGetLectures, adminCreateLecture, adminUpdateLecture, adminDeleteLecture,
} from "../../services/api.js";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { isValidHttpUrl } from "../../utils/validators.js";

const EMPTY_FORM = { title: "", scheduledAt: "", scheduledEndAt: "", link: "", notes: "" };

// Datetime-local inputs want "YYYY-MM-DDTHH:mm" — Lecture.scheduledAt comes
// back as a full ISO string from the API.
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminLectures() {
  usePageMeta({ title: "Live Class Schedule | Crix Technology" });
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    // Both types — an internship can now carry a real price and get a real
    // Enrollment the same way a course does (Backend/src/routes/courses.js),
    // so it can have a live-class schedule too, not just courses.
    adminGetCourses().then((res) => {
      if (res.ok) {
        setCourses(res.courses || []);
        if (res.courses?.length) setCourseId(res.courses[0]._id);
        else setLoading(false);
      } else {
        setError(res.error || "Could not load courses.");
        setLoading(false);
      }
    });
  }, []);

  const load = async (cid) => {
    setLoading(true);
    const res = await adminGetLectures(cid);
    setLoading(false);
    if (res.ok) { setLectures(res.lectures || []); setError(""); }
    else setError(res.error || "Could not load lectures.");
  };

  useEffect(() => {
    if (courseId) load(courseId);
  }, [courseId]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const startEdit = (l) => {
    setEditingId(l._id);
    setForm({
      title: l.title, scheduledAt: toLocalInput(l.scheduledAt), scheduledEndAt: toLocalInput(l.scheduledEndAt),
      link: l.link, notes: l.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); };

  const onSubmit = async (e) => {
    e.preventDefault();
    // A disabled submit button doesn't stop the browser's native form
    // submit on Enter inside a text field — without this guard, pressing
    // Enter twice quickly (or a slow network) fires two concurrent saves.
    if (saving) return;
    if (!form.title.trim() || !form.link.trim()) { setError("Title and Google Meet link are required."); return; }
    if (!isValidHttpUrl(form.link.trim())) { setError("Link must be a valid http(s) URL."); return; }
    if (!form.scheduledAt || !form.scheduledEndAt) { setError("Start and end time are both required."); return; }
    if (new Date(form.scheduledEndAt) <= new Date(form.scheduledAt)) { setError("End time must be after the start time."); return; }
    setSaving(true);
    setError("");
    const payload = {
      course: courseId, title: form.title.trim(),
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      scheduledEndAt: new Date(form.scheduledEndAt).toISOString(),
      link: form.link.trim(), notes: form.notes.trim(),
    };
    const res = editingId ? await adminUpdateLecture(editingId, payload) : await adminCreateLecture(payload);
    setSaving(false);
    if (res.ok) { cancelEdit(); load(courseId); }
    else setError(res.error || "Could not save lecture.");
  };

  const remove = async (l) => {
    if (!window.confirm(`Delete "${l.title}"? This cannot be undone.`)) return;
    const res = await adminDeleteLecture(l._id);
    if (res.ok) load(courseId); else setError(res.error || "Could not delete.");
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Live class schedule</h1>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
              Recorded lectures are managed under <Link to="/admin/videos">Course videos</Link>.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <div className="field" style={{ maxWidth: 420 }}>
          <label>Course</label>
          <select value={courseId} onChange={(e) => { setCourseId(e.target.value); cancelEdit(); }}>
            {courses.length === 0 && <option value="">No courses yet</option>}
            {courses.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
          </select>
        </div>

        {courseId && (
          <>
            <form onSubmit={onSubmit} className="admin-form">
              <h3 style={{ margin: "0 0 16px" }}>{editingId ? "Edit live session" : "Add a live session"}</h3>
              <div className="admin-form-grid">
                <div className="field"><label>Title</label>
                  <input value={form.title} onChange={set("title")} placeholder="Week 3 — React Hooks" /></div>
                <div className="field"><label>Starts</label>
                  <input type="datetime-local" value={form.scheduledAt} onChange={set("scheduledAt")} /></div>
                <div className="field"><label>Ends</label>
                  <input type="datetime-local" value={form.scheduledEndAt} onChange={set("scheduledEndAt")} /></div>
                <div className="field"><label>Google Meet link</label>
                  <input value={form.link} onChange={set("link")} placeholder="https://meet.google.com/..." /></div>
              </div>
              <p className="form-note" style={{ margin: "-8px 0 16px" }}>
                Students see the "Join live" button appear 10 minutes before Starts and disappear at Ends.
              </p>
              <div className="field"><label>Notes (optional)</label>
                <textarea rows="2" value={form.notes} onChange={set("notes")} placeholder="Shown to enrolled students" /></div>
              <div style={{ display: "flex", gap: 12 }}>
                <button className="btn btn-solid" type="submit" disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Save changes" : "Add"}
                </button>
                {editingId && <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>}
              </div>
              {error && <p className="form-note">{error}</p>}
            </form>

            {loading ? (
              <p style={{ color: "var(--muted)", marginTop: 32 }}>Loading...</p>
            ) : (
              <>
                <h3 style={{ margin: "40px 0 16px" }}>Scheduled sessions</h3>
                <input
                  className="admin-search"
                  type="search"
                  placeholder="Search sessions by title..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {lectures.length === 0 ? (
                  <p style={{ color: "var(--muted)" }}>No live sessions scheduled for this course yet.</p>
                ) : (
                  <div className="admin-list">
                    {lectures.filter((l) => l.title.toLowerCase().includes(q.trim().toLowerCase())).map((l) => (
                      <div className="admin-row" key={l._id}>
                        <div className="admin-row-main">
                          <b>{l.title}</b>
                          <span className="admin-row-meta">
                            {new Date(l.scheduledAt).toLocaleString("en-IN")} – {new Date(l.scheduledEndAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="admin-row-actions">
                          <button className="btn btn-ghost" onClick={() => startEdit(l)}>Edit</button>
                          <button className="btn btn-ghost admin-danger" onClick={() => remove(l)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
