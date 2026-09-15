import { useContext, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { UserContext } from "../../context/UserContext.jsx";
import { getLearnData } from "../../services/api.js";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import CourseVideos from "../../components/CourseVideos.jsx";

// How early the "Join live" button shows up before a class's start time —
// long enough to let students in a few minutes ahead, short enough that it
// isn't just sitting there all day. Purely a display window: the backend
// doesn't gate on this, it only excludes lectures that have fully ended
// (see GET /api/learn/:courseSlug in routes/lectures.js).
const JOIN_WINDOW_MINUTES_BEFORE = 10;

function fmtRange(startIso, endIso) {
  const start = new Date(startIso), end = new Date(endIso);
  const dateOpts = { day: "numeric", month: "short", year: "numeric" };
  const timeOpts = { hour: "2-digit", minute: "2-digit" };
  const sameDay = start.toDateString() === end.toDateString();
  const startStr = `${start.toLocaleDateString("en-IN", dateOpts)}, ${start.toLocaleTimeString("en-IN", timeOpts)}`;
  const endStr = sameDay
    ? end.toLocaleTimeString("en-IN", timeOpts)
    : `${end.toLocaleDateString("en-IN", dateOpts)}, ${end.toLocaleTimeString("en-IN", timeOpts)}`;
  return `${startStr} – ${endStr}`;
}

export default function Learn() {
  const { slug } = useParams();
  const { isLoggedIn, openAuthModal } = useContext(UserContext);
  const [data, setData] = useState(undefined); // undefined = loading
  const [error, setError] = useState("");
  // Ticks once a minute so the Join button's appear/disappear window (and a
  // class that just ended) updates live without the student refreshing.
  const [now, setNow] = useState(() => Date.now());
  usePageMeta({ title: data?.course ? `${data.course.title} — Learn | Crix Technology` : "My Courses | Crix Technology" });

  useEffect(() => {
    if (!isLoggedIn) return;
    // Guards against an out-of-order response: this effect re-runs on every
    // slug change without the component unmounting (same route, just a
    // different :slug param), so navigating from /learn/A to /learn/B before
    // A's request resolves could otherwise let A's late response overwrite
    // B's already-loaded data — same pattern already used in Home/Programs/
    // CourseDetail/Services/CourseVideos for the same reason.
    let alive = true;
    setData(undefined);
    setError("");
    getLearnData(slug).then((res) => {
      if (!alive) return;
      if (res.ok) setData(res);
      else { setData(null); setError(res.error || "Could not load this course."); }
    });
    return () => { alive = false; };
  }, [slug, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    // Same staleness concern as the load effect above: clearInterval on
    // cleanup stops future ticks, but a refetch already in flight the
    // instant the slug changes can still resolve afterward and overwrite
    // the new slug's data with the old one's.
    let alive = true;
    const tick = () => setNow(Date.now());
    // A live clock tick (for the Join button) plus an occasional full
    // refetch (so a class the admin just added/removed shows up without a
    // manual reload) — separate intervals since they serve different jobs.
    const clockId = setInterval(tick, 30 * 1000);
    const refetchId = setInterval(() => {
      getLearnData(slug).then((res) => { if (alive && res.ok) setData(res); });
    }, 2 * 60 * 1000);
    return () => { alive = false; clearInterval(clockId); clearInterval(refetchId); };
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

  // Client-side "has this ended?" filter, independent of the 2-minute
  // refetch above — this is what actually makes a class disappear right at
  // its end time rather than up to 2 minutes late.
  const visible = upcoming.filter((lec) => now <= new Date(lec.scheduledEndAt).getTime());

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap" style={{ maxWidth: 720 }}>
        <Link className="back-link" to="/dashboard">← My courses</Link>
        <h2 style={{ margin: "24px 0 6px" }}>{course.title}</h2>
        <p style={{ color: "var(--muted)", marginBottom: 32 }}>{course.desc}</p>

        <h3 style={{ margin: "0 0 16px" }}>Upcoming live classes</h3>
        {visible.length === 0 ? (
          <p style={{ color: "var(--muted)", marginBottom: 32 }}>No live classes scheduled right now — check back soon.</p>
        ) : (
          <div className="admin-list" style={{ marginBottom: 32 }}>
            {visible.map((lec) => {
              const start = new Date(lec.scheduledAt).getTime();
              const end = new Date(lec.scheduledEndAt).getTime();
              const joinOpensAt = start - JOIN_WINDOW_MINUTES_BEFORE * 60 * 1000;
              const canJoin = now >= joinOpensAt && now <= end;
              const live = now >= start && now <= end;
              return (
                <div className="admin-row" key={lec._id}>
                  <div className="admin-row-main">
                    <b>{lec.title} {live && <span className="admin-pill new">live now</span>}</b>
                    <span className="admin-row-meta">{fmtRange(lec.scheduledAt, lec.scheduledEndAt)}</span>
                  </div>
                  {canJoin ? (
                    <a className="btn btn-solid" href={lec.link} target="_blank" rel="noopener noreferrer">Join live →</a>
                  ) : (
                    <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>
                      Join opens {JOIN_WINDOW_MINUTES_BEFORE} min before start
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <h3 style={{ margin: "0 0 16px" }}>Recorded lectures</h3>
        <CourseVideos courseId={course._id} />
      </div>
    </section>
  );
}
