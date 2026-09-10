import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  adminGetCourses, adminGetVideos, adminUpdateVideo, adminDeleteVideo,
} from "../../services/api.js";
import { usePageMeta } from "../../hooks/usePageMeta.js";

// Read/curate view over the drip video schedule. Videos are created by the
// drive-to-b2-sync script (which streams each Google Meet recording into B2
// and registers it here) — this page is for fixing titles and reordering the
// unlock day, or removing a bad row. It does not upload.

function fmtDuration(seconds) {
  if (!seconds || seconds < 1) return "—";
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function AdminVideos() {
  usePageMeta({ title: "Course Videos | Crix Technology" });
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: "", dayNumber: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminGetCourses("course").then((res) => {
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
    const res = await adminGetVideos(cid);
    setLoading(false);
    if (res.ok) { setVideos(res.videos || []); setError(""); }
    else setError(res.error || "Could not load videos.");
  };

  useEffect(() => {
    if (courseId) load(courseId);
  }, [courseId]);

  const startEdit = (v) => {
    setEditingId(v._id);
    setForm({ title: v.title, dayNumber: String(v.dayNumber) });
  };
  const cancelEdit = () => { setEditingId(null); setForm({ title: "", dayNumber: "" }); };

  const save = async (v) => {
    const day = Number(form.dayNumber);
    if (!form.title.trim()) { setError("Title can't be empty."); return; }
    if (!Number.isInteger(day) || day < 1) { setError("Day must be a positive whole number."); return; }
    setSaving(true);
    setError("");
    const res = await adminUpdateVideo(v._id, { title: form.title.trim(), dayNumber: day });
    setSaving(false);
    if (res.ok) { cancelEdit(); load(courseId); }
    else setError(res.error || "Could not save.");
  };

  const remove = async (v) => {
    if (!window.confirm(`Remove "${v.title}" from the schedule? The file stays in B2.`)) return;
    const res = await adminDeleteVideo(v._id);
    if (res.ok) load(courseId); else setError(res.error || "Could not delete.");
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h2 style={{ margin: "14px 0 0" }}>Course videos (drip schedule)</h2>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
              One video unlocks per day from each student's enrollment date. New recordings are added automatically by the sync script.
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

        {error && <p className="form-note">{error}</p>}

        {loading ? (
          <p style={{ color: "var(--muted)", marginTop: 32 }}>Loading...</p>
        ) : videos.length === 0 ? (
          <p style={{ color: "var(--muted)", marginTop: 32 }}>
            No videos synced for this course yet. Run <code>scripts/drive-to-b2-sync</code> to import recordings.
          </p>
        ) : (
          <div className="admin-list" style={{ marginTop: 24 }}>
            {videos.map((v) => (
              <div className="admin-row" key={v._id}>
                {editingId === v._id ? (
                  <>
                    <div className="admin-row-main" style={{ flex: 1, gap: 8 }}>
                      <input
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="Title"
                      />
                      <input
                        type="number"
                        min="1"
                        value={form.dayNumber}
                        onChange={(e) => setForm({ ...form, dayNumber: e.target.value })}
                        placeholder="Day"
                        style={{ maxWidth: 120 }}
                      />
                    </div>
                    <div className="admin-row-actions">
                      <button className="btn btn-solid" onClick={() => save(v)} disabled={saving}>
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="admin-row-main">
                      <b>Day {v.dayNumber} — {v.title}</b>
                      <span className="admin-row-meta">
                        {fmtDuration(v.durationSeconds)} · <code>{v.b2Key}</code>
                        {v.sourceDriveFileId ? ` · Drive ${v.sourceDriveFileId}` : ""}
                      </span>
                    </div>
                    <div className="admin-row-actions">
                      <button className="btn btn-ghost" onClick={() => startEdit(v)}>Edit</button>
                      <button className="btn btn-ghost admin-danger" onClick={() => remove(v)}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
