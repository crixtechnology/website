import { useContext, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { UserContext } from "../../context/UserContext.jsx";
import { getLearnData } from "../../services/api.js";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import CourseVideos from "../../components/CourseVideos.jsx";

export default function Learn() {
  const { slug } = useParams();
  const { isLoggedIn, openAuthModal } = useContext(UserContext);
  const [data, setData] = useState(undefined); // undefined = loading
  const [error, setError] = useState("");
  usePageMeta({ title: data?.course ? `${data.course.title} — Learn | Crix Technology` : "My Courses | Crix Technology" });

  useEffect(() => {
    if (!isLoggedIn) return;
    setData(undefined);
    setError("");
    getLearnData(slug).then((res) => {
      if (res.ok) setData(res);
      else { setData(null); setError(res.error || "Could not load this course."); }
    });
  }, [slug, isLoggedIn]);

  // No dedicated /login page — log in from right here via the popup.
  if (!isLoggedIn) {
    return (
      <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
        <div className="wrap" style={{ maxWidth: 480 }}>
          <span className="eyebrow">Course access</span>
          <h2 style={{ margin: "14px 0 16px" }}>Log in to view this course</h2>
          <button className="btn btn-solid" onClick={() => openAuthModal("login")}>Log in</button>
        </div>
      </section>
    );
  }

  if (data === undefined) {
    return (
      <section className="section" style={{ paddingTop: 140 }}>
        <div className="wrap"><p style={{ color: "var(--muted)" }}>Loading...</p></div>
      </section>
    );
  }

  if (data === null) {
    return (
      <section className="section" style={{ paddingTop: 140 }}>
        <div className="wrap">
          <span className="eyebrow">Not available</span>
          <h2 style={{ margin: "14px 0 16px" }}>{error}</h2>
          <Link className="btn btn-solid" to="/dashboard">← My courses</Link>
        </div>
      </section>
    );
  }

  const { course, upcoming } = data;

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap" style={{ maxWidth: 720 }}>
        <Link className="back-link" to="/dashboard">← My courses</Link>
        <h2 style={{ margin: "24px 0 6px" }}>{course.title}</h2>
        <p style={{ color: "var(--muted)", marginBottom: 32 }}>{course.desc}</p>

        <h3 style={{ margin: "0 0 16px" }}>Upcoming live classes</h3>
        {upcoming.length === 0 ? (
          <p style={{ color: "var(--muted)", marginBottom: 32 }}>No live classes scheduled right now — check back soon.</p>
        ) : (
          <div className="admin-list" style={{ marginBottom: 32 }}>
            {upcoming.map((lec) => (
              <div className="admin-row" key={lec._id}>
                <div className="admin-row-main">
                  <b>{lec.title}</b>
                  <span className="admin-row-meta">{new Date(lec.scheduledAt).toLocaleString("en-IN")}</span>
                </div>
                <a className="btn btn-solid" href={lec.link} target="_blank" rel="noopener noreferrer">Join live →</a>
              </div>
            ))}
          </div>
        )}

        <h3 style={{ margin: "0 0 16px" }}>Recorded lectures</h3>
        <CourseVideos courseId={course._id} />
      </div>
    </section>
  );
}
