import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminGetEnrollments } from "../../services/api.js";
import { usePageMeta } from "../../hooks/usePageMeta.js";

export default function AdminStudents() {
  usePageMeta({ title: "Students & Enrollments | Crix Technology" });
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminGetEnrollments().then((res) => {
      setLoading(false);
      if (res.ok) setEnrollments(res.enrollments || []);
      else setError(res.error || "Could not load enrollments.");
    });
  }, []);

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h2 style={{ margin: "14px 0 0" }}>Students & enrollments</h2>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : error ? (
          <p className="form-note">{error}</p>
        ) : enrollments.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No purchases yet.</p>
        ) : (
          <div className="admin-list">
            {enrollments.map((en) => (
              <div className="admin-row" key={en._id}>
                <div className="admin-row-main">
                  <b>{en.user?.name || "Unknown"}</b>
                  <span className="admin-row-meta">
                    {en.user?.email} {en.user?.phone ? `· ${en.user.phone}` : ""}
                  </span>
                </div>
                <div className="admin-row-main">
                  <b>{en.course?.title || "Course"}</b>
                  <span className="admin-row-meta">Purchased {new Date(en.createdAt).toLocaleDateString("en-IN")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
