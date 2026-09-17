import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCourseVideos, getVideoPlayUrl } from "../services/api.js";

// The student-facing recorded-lecture list for one course. Every video is
// playable any time once a student is enrolled. Playback streams from the
// Cloudflare Worker gateway via a short-lived signed URL that this component
// fetches right before play (and re-fetches, resuming in place, if it
// expires mid-lecture).

function fmtDuration(seconds) {
  if (!seconds || seconds < 1) return null;
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function CourseVideos({ courseId }) {
  const [data, setData] = useState(undefined); // undefined = loading, null = error
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    if (!courseId) return;
    setData(undefined);
    getCourseVideos(courseId).then((res) => {
      if (res.ok) setData(res);
      else { setData(null); setError(res.error || "Could not load recorded lectures."); }
    });
  }, [courseId]);

  if (data === undefined) return <p style={{ color: "var(--muted)" }}>Loading recorded lectures…</p>;
  if (data === null) return <p style={{ color: "var(--muted)" }}>{error}</p>;
  if (!data.videos.length) return <p style={{ color: "var(--muted)" }}>No recorded lectures posted yet.</p>;

  return (
    <>
      <div className="admin-list">
        {data.videos.map((v) => {
          const dur = fmtDuration(v.durationSeconds);
          return (
            <div className="admin-row" key={v._id}>
              <div className="admin-row-main">
                <b>{v.title}</b>
                <span className="admin-row-meta">
                  Day {v.dayNumber}
                  {dur ? ` · ${dur}` : ""}
                </span>
              </div>
              <div className="admin-row-actions">
                <button className="btn btn-solid" onClick={() => setPlaying(v)}>Watch →</button>
              </div>
            </div>
          );
        })}
      </div>
      {playing && (
        <VideoPlayerModal courseId={courseId} video={playing} onClose={() => setPlaying(null)} />
      )}
    </>
  );
}

const MAX_RETRIES = 3;

function VideoPlayerModal({ courseId, video, onClose }) {
  const videoRef = useRef(null);
  const lastTimeRef = useRef(0); // where the student was, to resume after a token refresh
  const retriesRef = useRef(0);
  const retryTimerRef = useRef(null);
  const [src, setSrc] = useState(null);
  const [status, setStatus] = useState("Loading…");

  const fetchUrl = useCallback(async () => {
    const res = await getVideoPlayUrl(courseId, video._id);
    if (!res.ok) {
      setStatus(res.error || "Could not load this video.");
      return;
    }
    setStatus("");
    setSrc(res.url); // new URL each call (exp differs)
  }, [courseId, video._id]);

  useEffect(() => { fetchUrl(); }, [fetchUrl]);

  // Reload the element whenever a fresh signed URL is swapped in. Changing the
  // src prop alone isn't a reliable reload after an error state in some
  // browsers — an explicit load() is. onLoadedMetadata then re-seeks.
  useEffect(() => {
    if (src && videoRef.current) videoRef.current.load();
  }, [src]);

  useEffect(() => () => clearTimeout(retryTimerRef.current), []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const onTimeUpdate = () => {
    const el = videoRef.current;
    if (el && !el.seeking && el.currentTime > 0) lastTimeRef.current = el.currentTime;
  };

  const onLoadedMetadata = () => {
    const el = videoRef.current;
    if (!el) return;
    if (lastTimeRef.current > 1 && Math.abs(el.currentTime - lastTimeRef.current) > 1) {
      try { el.currentTime = Math.max(0, lastTimeRef.current - 3); } catch (e) { /* ignore */ }
    }
    el.play().catch(() => {});
  };

  const onPlaying = () => { retriesRef.current = 0; };

  const onError = () => {
    // Almost always the signed URL expired mid-lecture — get a fresh one and
    // resume from lastTimeRef (handled in onLoadedMetadata).
    if (retriesRef.current >= MAX_RETRIES) {
      setStatus("Playback keeps dropping. Close and reopen the lecture to continue.");
      return;
    }
    retriesRef.current += 1;
    setStatus("");
    // Back off a little so a URL that fails instantly (e.g. clock skew) doesn't
    // burn every retry in one tick.
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(fetchUrl, 400 * retriesRef.current);
  };

  // Portaled to <body> — this modal is opened from deep inside a course's
  // page content (Learn.jsx's section/wrap), and position:fixed's viewport
  // pinning isn't reliable from an arbitrarily nested call site on every
  // mobile browser (same reasoning as Alert's and the mobile nav dropdown's
  // own portals elsewhere in this file). Unportaled, this showed up as the
  // popup needing a scroll to fully appear and the page footer scrolling up
  // over it — both symptoms of the backdrop not actually staying fixed to
  // the real viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box modal-box--video"
        role="dialog"
        aria-modal="true"
        aria-label={video.title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 14px" }}>{video.title}</h3>
        <div className="lecture-embed">
          {src ? (
            <video
              ref={videoRef}
              src={src}
              controls
              autoPlay
              playsInline
              controlsList="nodownload"
              onContextMenu={(e) => e.preventDefault()}
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={onLoadedMetadata}
              onPlaying={onPlaying}
              onError={onError}
            />
          ) : (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--muted)" }}>{status}</div>
          )}
          <button type="button" className="lecture-embed-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {src && status && <p className="form-note">{status}</p>}
      </div>
    </div>,
    document.body
  );
}
