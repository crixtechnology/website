import { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserContext } from "../../context/UserContext.jsx";
import { getMyEnrollments } from "../../services/api.js";
import { usePageMeta } from "../../hooks/usePageMeta.js";

export default function MyCourses() {
  usePageMeta({ title: "My Courses | Crix Technology" });
  const { isLoggedIn, user, logout, openAuthModal } = useContext(UserContext);
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) return;
    getMyEnrollments().then((res) => {
      setLoading(false);
      if (res.ok) setEnrollments(res.enrollments || []);
    });
  }, [isLoggedIn]);

  // No dedicated /login page anymore — log in happens in the popup, right
  // here on this page, so a direct link to /dashboard while logged out
  // still lands somewhere sensible instead of a blank screen.
  if (!isLoggedIn) {
    return (
      <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
        <div className="wrap" style={{ maxWidth: 480 }}>
          <span className="eyebrow">My learning</span>
          <h2 style={{ margin: "14px 0 16px" }}>Log in to see your courses</h2>
          <button className="btn btn-solid" onClick={() => openAuthModal("login")}>Log in</button>
        </div>
      </section>
    );
  }

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">My learning</span>
            <h2 style={{ margin: "14px 0 0" }}>Welcome, {user?.name}</h2>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link className="btn btn-ghost" to="/profile">Edit profile</Link>
            <button className="btn btn-ghost" onClick={() => { logout(); navigate("/"); }}>Log out</button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : enrollments.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            You haven't purchased a course yet. <Link to="/programs">Browse courses →</Link>
          </p>
        ) : (
          <div className="admin-list">
            {enrollments.map((en) => (
              <div className="admin-row" key={en._id}>
                <div className="admin-row-main">
                  <b>{en.course?.title || "Course"} {en.expired && <span className="admin-pill expired">expired</span>}</b>
                  <span className="admin-row-meta">Purchased {new Date(en.createdAt).toLocaleDateString("en-IN")}</span>
                </div>
                <div className="admin-row-actions">
                  {en.expired ? (
                    // The server 403s /learn/:slug once access has lapsed
                    // (see requireEnrollment.js) — show that up front instead
                    // of a "Go to course" link that would just dead-end.
                    <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>
                      Access has expired — contact us to renew.
                    </span>
                  ) : (
                    en.course?.slug && (
                      <Link className="btn btn-solid" to={`/learn/${en.course.slug}`}>Go to course →</Link>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
