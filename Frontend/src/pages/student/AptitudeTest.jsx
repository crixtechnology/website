import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { useNoIndex } from "../../hooks/useNoIndex.js";
import { Alert, DownloadPdfButton } from "../../components/ui.jsx";
import { testRuleLines, careersRulesDocument } from "../../data/careers.js";
import {
  getTestInfo, startTest, saveTestAnswer, testHeartbeat, reportTestViolation, submitTest, uploadTestSnapshot,
} from "../../services/api.js";

// The aptitude test (/test/:applicationId), in three parts:
//   <TestLobby>    the rules, the webcam check and consent, then "Start Test"
//   <TestRunner>   the test itself: full screen, timed, proctored
//   <TestFinished> what the candidate sees once it is submitted
//
// Everything that decides the outcome lives on the server (Backend
// routes/aptitudeTest.js): the questions arrive without answers, the clock is
// the server's, and the violation limit is enforced there. This page only shows
// the paper, saves each answer the moment it is picked, and reports what the
// browser can observe.
//
// <TestRunner> needs nothing from the rest of the site (no navbar, router or
// page layout), so the same screen can later be loaded inside a desktop
// lockdown app. That app announces itself as window.crixDesktop and supplies a
// token the server verifies (services/api.js desktopAppHeaders); inside it the
// browser's own full-screen step is skipped, because the app already is one.
const inDesktopApp = () => typeof window !== "undefined" && !!window.crixDesktop;

const HEARTBEAT_MS = 10 * 1000;
const RETRY_MS = 3000;
const SUBMIT_SAVE_WAIT_MS = 10 * 1000;
const SNAPSHOT = { width: 320, height: 240, quality: 0.6 };

// ---- full screen (with the older Safari names) ----
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const canFullscreen = () => { const el = document.documentElement; return !!(el.requestFullscreen || el.webkitRequestFullscreen); };
async function enterFullscreen() {
  if (isFullscreen()) return true;
  const el = document.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!request) return false;
  try {
    // Some embedded browsers never answer the request at all: don't wait forever.
    await Promise.race([request.call(el), new Promise((resolve, reject) => setTimeout(() => reject(new Error("timeout")), 4000))]);
    return isFullscreen();
  } catch (e) { return false; }
}
function leaveFullscreen() {
  if (!isFullscreen()) return;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  try { const p = exit && exit.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) { /* already out */ }
}

// ---- what survives a refresh, in this tab only ----
const sessionKey = (applicationId) => `crix_test_session_${applicationId}`;
const pendingKey = (attemptId) => `crix_test_unsent_${attemptId}`;
const stored = {
  get(key) { try { return window.sessionStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { window.sessionStorage.setItem(key, value); } catch (e) { /* storage blocked */ } },
  remove(key) { try { window.sessionStorage.removeItem(key); } catch (e) { /* storage blocked */ } },
};

const clock = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
};

const WARNING_TEXT = {
  fullscreen_exit: "You left full screen.",
  tab_switch: "You switched to another tab or app.",
  window_blur: "The test window lost focus.",
};

/* ================= the test itself ================= */
function TestRunner({ data, stream, onFinished }) {
  const attemptId = data.attempt._id;
  const sessionId = data.sessionId;
  const questions = data.questions;

  const [answers, setAnswers] = useState(() => Object.fromEntries((data.answers || []).map((a) => [a.questionId, { selected: a.selected, marked: a.marked }])));
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(data.attempt.remainingMs);
  const [paused, setPaused] = useState(() => !inDesktopApp() && !isFullscreen());
  const [violations, setViolations] = useState({ count: data.attempt.violationCount || 0, limit: data.attempt.violationLimit || 3 });
  const [saveState, setSaveState] = useState("saved"); // "saved" | "saving" | "offline"
  const [toast, setToast] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState("");

  const videoRef = useRef(null);
  const finishedRef = useRef(false);
  const submittingRef = useRef(false);
  const pendingRef = useRef(new Map());   // questionId -> the change not yet saved on the server
  const flushingRef = useRef(false);
  const retryTimer = useRef(null);
  const toastTimer = useRef(null);
  const lateViolations = useRef([]);      // violations that happened while offline
  const lastReported = useRef({});
  // The countdown runs off performance.now(), which keeps counting steadily
  // whatever happens to the device's clock, and is re-set from the server's
  // "time left" on every reply. Changing the system time changes nothing.
  const clockRef = useRef({ remaining: data.attempt.remainingMs, at: performance.now() });
  const sync = (ms) => { if (typeof ms === "number") clockRef.current = { remaining: ms, at: performance.now() }; };
  const timeLeft = () => Math.max(0, clockRef.current.remaining - (performance.now() - clockRef.current.at));

  const finish = useCallback((reason) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearTimeout(retryTimer.current);
    stored.remove(pendingKey(attemptId));
    leaveFullscreen();
    onFinished({ reason });
  }, [attemptId, onFinished]);

  // The server says the test is over, or that this window no longer owns it.
  const handleRefusal = useCallback((res) => {
    if (res.code === "submitted") { finish(res.reason || "manual"); return true; }
    if (res.code === "session") { setBlocked(res.error || "This test is open in another window or device."); return true; }
    if (res.code === "auth") { setBlocked(res.error); return true; }
    return false;
  }, [finish]);

  const showToast = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6000);
  };

  // ---- saving answers: instantly, and again until it sticks ----
  const persistPending = () => {
    const unsent = Object.fromEntries(pendingRef.current);
    if (Object.keys(unsent).length) stored.set(pendingKey(attemptId), JSON.stringify(unsent));
    else stored.remove(pendingKey(attemptId));
  };

  const flush = useCallback(async () => {
    if (flushingRef.current || finishedRef.current) return;
    flushingRef.current = true;
    clearTimeout(retryTimer.current);
    while (pendingRef.current.size && !finishedRef.current) {
      const [questionId, change] = pendingRef.current.entries().next().value;
      pendingRef.current.delete(questionId);
      setSaveState("saving");
      const res = await saveTestAnswer(attemptId, sessionId, { questionId, ...change });
      if (res.ok) { sync(res.remainingMs); persistPending(); continue; }
      if (res.network || res.code === "retry" || res.status === 429) {
        // Not saved: keep it (under anything newer picked meanwhile) and try again shortly.
        pendingRef.current.set(questionId, { ...change, ...(pendingRef.current.get(questionId) || {}) });
        persistPending();
        setSaveState("offline");
        flushingRef.current = false;
        retryTimer.current = setTimeout(flush, RETRY_MS);
        return;
      }
      if (handleRefusal(res)) break;
      persistPending(); // refused as invalid: nothing to retry
    }
    flushingRef.current = false;
    if (!pendingRef.current.size && !finishedRef.current) setSaveState("saved");
  }, [attemptId, sessionId, handleRefusal]);

  const change = (questionId, patch) => {
    setAnswers((prev) => ({ ...prev, [questionId]: { selected: null, marked: false, ...prev[questionId], ...patch } }));
    pendingRef.current.set(questionId, { ...(pendingRef.current.get(questionId) || {}), ...patch });
    persistPending();
    flush();
  };

  // Answers picked while offline and then caught by a refresh: restore and send them.
  useEffect(() => {
    try {
      const unsent = JSON.parse(stored.get(pendingKey(attemptId)) || "{}");
      const ids = Object.keys(unsent).filter((id) => questions.some((q) => q.id === id));
      if (ids.length) {
        ids.forEach((id) => pendingRef.current.set(id, unsent[id]));
        setAnswers((prev) => {
          const next = { ...prev };
          ids.forEach((id) => { next[id] = { selected: null, marked: false, ...next[id], ...unsent[id] }; });
          return next;
        });
        flush();
      }
    } catch (e) { /* unreadable: the server's copy stands */ }
  }, []);

  // ---- violations ----
  const report = useCallback((type, detail) => {
    if (finishedRef.current) return;
    // One event can fire several times in a row (a held key, a double right-click).
    const now = performance.now();
    if (lastReported.current[type] && now - lastReported.current[type] < 1000) return;
    lastReported.current[type] = now;
    reportTestViolation(attemptId, sessionId, type, detail).then((res) => {
      if (res.ok) {
        if (res.counted) {
          setViolations({ count: res.count, limit: res.limit });
          showToast(`Warning ${res.count} of ${res.limit}: ${WARNING_TEXT[type] || "A test rule was broken."} At ${res.limit} warnings the test is submitted automatically.`);
        }
        if (res.submitted) finish("violations");
      } else if (res.network) {
        lateViolations.current.push({ type, detail: `${detail ? `${detail} ` : ""}(reported late: offline at the time)` });
      } else handleRefusal(res);
    });
  }, [attemptId, sessionId, finish, handleRefusal]);

  useEffect(() => {
    const app = inDesktopApp();
    const onFullscreen = () => {
      if (finishedRef.current || app) return;
      if (isFullscreen()) setPaused(false);
      else { setPaused(true); report("fullscreen_exit"); }
    };
    const onVisibility = () => { if (document.hidden) report("tab_switch"); };
    const onBlur = () => report("window_blur");
    const block = (type) => (e) => { e.preventDefault(); report(type); };
    const onCopy = block("copy");
    const onCut = block("cut");
    const onPaste = block("paste");
    const onContextMenu = block("context_menu");
    const prevent = (e) => e.preventDefault();
    const onKeyDown = (e) => {
      const key = String(e.key || "").toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const blockedKey =
        key === "f12" || key === "printscreen" ||
        (mod && e.shiftKey && ["i", "j", "c", "k"].includes(key)) ||
        (mod && ["c", "v", "x", "u", "s", "p", "a"].includes(key));
      if (!blockedKey) return;
      e.preventDefault();
      e.stopPropagation();
      report("shortcut", `${e.ctrlKey ? "Ctrl+" : ""}${e.metaKey ? "Cmd+" : ""}${e.shiftKey ? "Shift+" : ""}${e.key}`);
    };
    // PrintScreen often only fires on key-up, after the capture: it can't be
    // stopped, so it is logged and the clipboard is emptied where the browser allows.
    const onKeyUp = (e) => {
      if (String(e.key || "").toLowerCase() !== "printscreen") return;
      report("shortcut", "PrintScreen");
      try { const p = navigator.clipboard && navigator.clipboard.writeText(""); if (p && p.catch) p.catch(() => {}); } catch (err) { /* not allowed */ }
    };
    // Leaving or reloading asks first — the timer keeps running either way.
    const onBeforeUnload = (e) => { if (!finishedRef.current) { e.preventDefault(); e.returnValue = ""; } };

    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCut, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("selectstart", prevent, true);
    document.addEventListener("dragstart", prevent, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCut, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("selectstart", prevent, true);
      document.removeEventListener("dragstart", prevent, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [report]);

  // ---- submitting ----
  const submit = useCallback(async () => {
    if (finishedRef.current || submittingRef.current) return;
    submittingRef.current = true;
    setConfirming(false);
    setSubmitting(true);
    // Every picked answer must reach the server before it scores the paper. A
    // save may already be in flight (flush() then returns at once) or waiting
    // to retry: wait for those too — but not forever, since the server also
    // ends the test when time is up.
    const giveUpAt = Date.now() + SUBMIT_SAVE_WAIT_MS;
    while ((flushingRef.current || pendingRef.current.size) && !finishedRef.current && Date.now() < giveUpAt) {
      if (!flushingRef.current) await flush();
      // Still busy, or a save failed and is waiting to retry: pause before checking again.
      if (flushingRef.current || pendingRef.current.size) await new Promise((r) => setTimeout(r, 250));
    }
    const attempt = async () => {
      if (finishedRef.current) return;
      const res = await submitTest(attemptId, sessionId);
      if (res.ok) { finish(res.reason || "manual"); return; }
      if (res.network) { retryTimer.current = setTimeout(attempt, RETRY_MS); return; } // keep trying; the server also ends it when time is up
      if (!handleRefusal(res)) { submittingRef.current = false; setSubmitting(false); showToast(res.error || "Could not submit. Please try again."); }
    };
    attempt();
  }, [attemptId, sessionId, flush, finish, handleRefusal]);

  // ---- the countdown, and the heartbeat that keeps this window's hold on the test ----
  useEffect(() => {
    const tick = setInterval(() => {
      const left = timeLeft();
      setRemaining(left);
      if (left <= 0 && !finishedRef.current) submit();
    }, 500);
    const beat = setInterval(async () => {
      if (finishedRef.current) return;
      const res = await testHeartbeat(attemptId, sessionId);
      if (res.ok) {
        sync(res.remainingMs);
        setViolations((v) => ({ ...v, count: Math.max(v.count, res.violationCount || 0) }));
        if (pendingRef.current.size) flush();
        else setSaveState((s) => (s === "offline" ? "saved" : s));
        // Back online: send what couldn't be reported at the time.
        const late = lateViolations.current.splice(0);
        late.forEach((v) => reportTestViolation(attemptId, sessionId, v.type, v.detail).then((r) => {
          if (r.ok && r.counted) setViolations({ count: r.count, limit: r.limit });
          if (r.ok && r.submitted) finish("violations");
        }));
      } else if (res.network) setSaveState("offline");
      else handleRefusal(res);
    }, HEARTBEAT_MS);
    return () => { clearInterval(tick); clearInterval(beat); clearTimeout(retryTimer.current); clearTimeout(toastTimer.current); };
  }, [attemptId, sessionId, submit, flush, finish, handleRefusal]);

  // ---- webcam snapshots ----
  useEffect(() => {
    const video = videoRef.current;
    if (!stream || !video) return undefined;
    video.srcObject = stream;
    const playing = video.play();
    if (playing && playing.catch) playing.catch(() => {});
    const canvas = document.createElement("canvas");
    canvas.width = SNAPSHOT.width;
    canvas.height = SNAPSHOT.height;
    // Optional: the browser's own face detector, where it has one (Chrome).
    let detector = null;
    try { if ("FaceDetector" in window) detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 }); } catch (e) { detector = null; }

    const shoot = async () => {
      if (finishedRef.current || !video.videoWidth) return;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      let flag = "";
      if (detector) {
        try {
          const faces = await detector.detect(canvas);
          flag = faces.length === 0 ? "no_face" : faces.length > 1 ? "multiple_faces" : "";
        } catch (e) { flag = ""; }
      }
      canvas.toBlob((blob) => { if (blob && !finishedRef.current) uploadTestSnapshot(attemptId, sessionId, blob, flag); }, "image/jpeg", SNAPSHOT.quality);
    };
    const first = setTimeout(shoot, 4000);
    const every = setInterval(shoot, Math.max(20, data.attempt.snapshotIntervalSeconds || 60) * 1000);
    const track = stream.getVideoTracks()[0];
    const onEnded = () => report("webcam_off", "The camera stopped during the test");
    if (track) track.addEventListener("ended", onEnded);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      if (track) track.removeEventListener("ended", onEnded);
    };
  }, [stream]);

  const q = questions[current];
  const mine = answers[q.id] || { selected: null, marked: false };
  const answeredCount = questions.filter((x) => answers[x.id] && answers[x.id].selected !== null && answers[x.id].selected !== undefined).length;
  const go = (i) => setCurrent(Math.min(questions.length - 1, Math.max(0, i)));
  const paletteClass = (x, i) => {
    const a = answers[x.id];
    return [a && a.marked ? "marked" : a && a.selected !== null && a.selected !== undefined ? "answered" : "", i === current ? "current" : ""].filter(Boolean).join(" ");
  };

  return (
    <div className="test-shell" data-desktop-app={inDesktopApp() ? "true" : undefined}>
      <header className="test-bar">
        <div className="test-bar-title">
          <b>{data.role} — Aptitude Test</b>
          <span>{answeredCount} of {questions.length} answered</span>
        </div>
        <div className="test-bar-right">
          <span className={`test-save${saveState === "offline" ? " offline" : ""}`} role="status">
            {saveState === "offline" ? "Offline — your answers are kept and will be saved when you reconnect" : saveState === "saving" ? "Saving…" : "All answers saved"}
          </span>
          <span className={`test-chip${violations.count > 0 ? " warn" : " ok"}`}>Warnings {violations.count}/{violations.limit}</span>
          <span className={`test-timer${remaining < 5 * 60 * 1000 ? " low" : ""}`} role="timer" aria-label="Time left">{clock(remaining)}</span>
          <button className="btn btn-solid" disabled={submitting} onClick={() => setConfirming(true)}>Submit test</button>
        </div>
      </header>

      <div className="test-main">
        <section className="test-question" aria-live="polite">
          <div className="test-question-inner">
            <div className="test-q-meta">
              <span>Question {current + 1} of {questions.length}</span>
              <b>{q.categoryLabel}</b>
            </div>
            <h2 className="test-q-text">{q.text}</h2>
            <fieldset className="test-options">
              <legend className="sr-only">Choose one answer</legend>
              {q.options.map((option, i) => (
                <label key={i} className={`test-option${mine.selected === i ? " is-selected" : ""}`}>
                  <input type="radio" name={`q-${q.id}`} checked={mine.selected === i} onChange={() => change(q.id, { selected: i })} />
                  <span className="test-option-key" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>
            <div className="test-actions">
              <div>
                <button className="btn btn-ghost" onClick={() => change(q.id, { marked: !mine.marked })} aria-pressed={!!mine.marked}>
                  {mine.marked ? "Unmark review" : "Mark for review"}
                </button>
                <button className="btn btn-ghost" disabled={mine.selected === null || mine.selected === undefined} onClick={() => change(q.id, { selected: null })}>Clear answer</button>
              </div>
              <div>
                <button className="btn btn-ghost" disabled={current === 0} onClick={() => go(current - 1)}>← Previous</button>
                <button className="btn btn-solid" disabled={current === questions.length - 1} onClick={() => go(current + 1)}>Next →</button>
              </div>
            </div>
          </div>
        </section>

        <aside className="test-side">
          <h4>Questions</h4>
          <div className="test-palette">
            {questions.map((x, i) => (
              <button key={x.id} type="button" className={paletteClass(x, i)} onClick={() => go(i)} aria-label={`Question ${i + 1}`} aria-current={i === current ? "true" : undefined}>{i + 1}</button>
            ))}
          </div>
          <ul className="test-legend">
            <li><i className="answered" aria-hidden="true"></i>Answered</li>
            <li><i aria-hidden="true"></i>Not answered</li>
            <li><i className="marked" aria-hidden="true"></i>Marked for review</li>
          </ul>
          {stream && (
            <>
              <h4>Webcam</h4>
              <video ref={videoRef} muted playsInline aria-label="Your webcam preview"></video>
              <p className="test-side-note">A photo is taken from time to time while the test runs.</p>
            </>
          )}
        </aside>
      </div>

      {toast && !paused && !blocked && <div className="test-toast" role="alert">{toast}</div>}

      {confirming && !paused && !blocked && (
        <div className="test-overlay" role="dialog" aria-modal="true" aria-labelledby="test-confirm-title">
          <div className="test-overlay-box">
            <span className="eyebrow">Submit test</span>
            <h2 id="test-confirm-title">Submit your test now?</h2>
            <p>You've answered {answeredCount} of {questions.length} questions. Once submitted, the test can't be reopened.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn btn-ghost" onClick={() => setConfirming(false)}>Keep working</button>
              <button className="btn btn-solid" onClick={submit}>Submit test</button>
            </div>
          </div>
        </div>
      )}

      {submitting && !blocked && (
        <div className="test-overlay" role="status">
          <div className="test-overlay-box">
            <span className="eyebrow">Submitting</span>
            <h2>Submitting your test…</h2>
            <p>{saveState === "offline" ? "Waiting for your connection to come back. Keep this page open — your answers are safe." : "One moment."}</p>
          </div>
        </div>
      )}

      {/* Out of full screen the paper is covered and can't be worked on. */}
      {paused && !blocked && !submitting && (
        <div className="test-overlay" role="alertdialog" aria-modal="true" aria-labelledby="test-paused-title">
          <div className="test-overlay-box">
            <span className="eyebrow">Test paused</span>
            <h2 id="test-paused-title">You left full screen</h2>
            <p>The test only runs in full screen. This has been recorded as warning {violations.count} of {violations.limit} — at {violations.limit} the test is submitted automatically.</p>
            <p><b style={{ color: "var(--text)" }}>The timer is still running:</b> {clock(remaining)} left.</p>
            <button className="btn btn-solid" onClick={enterFullscreen}>Return to full screen</button>
          </div>
        </div>
      )}

      {blocked && (
        <div className="test-overlay" role="alertdialog" aria-modal="true">
          <div className="test-overlay-box">
            <span className="eyebrow">Test not available here</span>
            <h2>This window can't continue the test</h2>
            <p>{blocked}</p>
            <p>Your saved answers are safe. Close the other window, wait a few seconds, and reload this page to carry on.</p>
            <button className="btn btn-solid" onClick={() => { finishedRef.current = true; window.location.reload(); }}>Reload</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= after the test ================= */
const ENDED = {
  manual: "Your answers have been submitted.",
  time_up: "Your time ran out, so the test was submitted automatically with the answers you had saved.",
  violations: "The test was submitted automatically because the limit on test-rule warnings was reached. The answers you had saved were kept.",
};

// Only that the test is in and how it ended. The score is never shown to the
// candidate — here or anywhere else on the site — and the server doesn't send it.
function TestFinished({ reason }) {
  return (
    <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
      <div className="wrap" style={{ maxWidth: 620 }}>
        <span className="eyebrow">Aptitude test</span>
        <h1 className="title-lg" style={{ margin: "14px 0 16px" }}>Your test has been submitted</h1>
        <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{ENDED[reason] || ENDED.manual}</p>
        <p className="form-note" style={{ padding: "14px 16px", background: "rgba(var(--teal-rgb),.08)", borderLeft: "3px solid var(--teal)", borderRadius: 10 }}>
          Shortlisting result within 7 days. We'll email you, and your status is always in My Applications.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
          <Link className="btn btn-solid" to="/dashboard?tab=applications">Go to My Applications</Link>
          <Link className="btn btn-ghost" to="/programs">Browse courses</Link>
        </div>
      </div>
    </section>
  );
}

/* ================= before the test ================= */
function TestLobby({ info, camera, onEnableCamera, onStart, starting, error }) {
  const [agreed, setAgreed] = useState(false);
  const videoRef = useRef(null);
  const rules = info.rules;
  const resuming = info.state === "in_progress";
  const app = inDesktopApp();

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !camera.stream) return;
    video.srcObject = camera.stream;
    const playing = video.play();
    if (playing && playing.catch) playing.catch(() => {});
  }, [camera.stream]);

  const needsApp = rules.requireDesktopApp && !app;
  const noFullscreen = !app && !canFullscreen();
  const cameraReady = !!camera.stream || !rules.requireWebcam;
  const canStart = (resuming || agreed) && cameraReady && !needsApp && !noFullscreen && !starting;

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap" style={{ maxWidth: 760 }}>
        <Link to="/dashboard?tab=apply" className="back-link">← Back to My Dashboard</Link>
        <div style={{ marginTop: 24 }}>
          <span className="eyebrow">Aptitude test</span>
          <h1 className="title-lg" style={{ margin: "14px 0 10px" }}>{info.role}</h1>
          <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>
            {resuming
              ? "Your test is already under way and its timer is still running. Turn your webcam on and continue — your questions and saved answers are exactly as you left them."
              : "Read the rules, turn on your webcam, and start when you're ready. The timer begins the moment you press Start, and it can't be paused."}
          </p>
        </div>

        <dl className="course-facts">
          <div><dt>Questions</dt><dd>{rules.questions}</dd></div>
          <div><dt>Time</dt><dd>{rules.durationMinutes} min</dd></div>
          <div><dt>Each correct</dt><dd>+{rules.marksPerQuestion}</dd></div>
          <div><dt>Each wrong</dt><dd>{rules.negativeMarks ? `−${rules.negativeMarks}` : "0"}</dd></div>
        </dl>

        <section className="course-block">
          <h2>Test rules</h2>
          <ul className="check-list test-rules">
            {testRuleLines(rules).map((line) => <li key={line}>{line}</li>)}
          </ul>
          <DownloadPdfButton label="Download these rules (PDF)" getDocument={() => careersRulesDocument(null, { role: info.role, rules })} />
        </section>

        <section className="course-block">
          <h2>Webcam check</h2>
          <div className="test-cam">
            {camera.stream
              ? <video ref={videoRef} muted playsInline aria-label="Your webcam preview"></video>
              : <div className="test-cam-off">{camera.error || "Webcam is off"}</div>}
            <div>
              <p className="form-note" style={{ marginTop: 0 }}>
                {camera.stream
                  ? "Your webcam is working. Make sure your face is clearly visible and well lit."
                  : rules.requireWebcam
                    ? "A working webcam is required for this test. Allow camera access when your browser asks."
                    : "Turn on your webcam so photos can be taken during the test."}
              </p>
              {!camera.stream && <button type="button" className="btn btn-ghost" onClick={onEnableCamera} disabled={camera.asking}>{camera.asking ? "Waiting for permission…" : "Turn on webcam"}</button>}
            </div>
          </div>
        </section>

        {!resuming && (
          <label className="check-row" style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "8px 0 20px", cursor: "pointer" }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 5 }} />
            <span>I confirm I am 18 or older, I have read the rules, and I agree to my webcam photos, IP address and device details being recorded during this test.</span>
          </label>
        )}

        {needsApp && <Alert inline kind="error">This test can only be taken in the Crix test app.</Alert>}
        {noFullscreen && <Alert inline kind="error">This browser can't show the test in full screen. Please use Chrome, Edge or Firefox on a laptop or desktop computer.</Alert>}
        {error && <Alert inline kind="error">{error}</Alert>}

        <button className="btn btn-solid" disabled={!canStart} onClick={onStart} style={{ minWidth: 220 }}>
          {starting ? "Starting…" : resuming ? "Resume Test" : "Start Test"}
        </button>
        {!resuming && !canStart && !starting && !needsApp && !noFullscreen && (
          <p className="form-note">{!cameraReady ? "Turn on your webcam to continue." : "Tick the box above to continue."}</p>
        )}
      </div>
    </section>
  );
}

/* ================= the page ================= */
export default function AptitudeTest() {
  usePageMeta({ title: "Aptitude Test | Crix Technology" });
  useNoIndex(true);
  const { applicationId } = useParams();
  const { isLoggedIn, openAuthModal } = useContext(UserContext);
  const [info, setInfo] = useState(undefined); // undefined = loading, null = couldn't load
  const [loadError, setLoadError] = useState("");
  const [camera, setCamera] = useState({ stream: null, asking: false, error: "" });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [running, setRunning] = useState(null);   // the start response, while the test is on screen
  const [finished, setFinished] = useState(null); // { reason }
  const streamRef = useRef(null);

  const load = useCallback(async () => {
    const res = await getTestInfo(applicationId);
    if (res.ok) { setInfo(res); setLoadError(""); }
    else { setInfo(null); setLoadError(res.error || "Could not load this test."); }
  }, [applicationId]);

  useEffect(() => { if (isLoggedIn) load(); }, [isLoggedIn, load]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  // The camera is released when the test ends or the page is left.
  useEffect(() => stopCamera, [stopCamera]);

  const enableCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCamera({ stream: null, asking: false, error: "This browser can't use a webcam." });
      return;
    }
    setCamera((c) => ({ ...c, asking: true, error: "" }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCamera({ stream, asking: false, error: "" });
    } catch (e) {
      setCamera({ stream: null, asking: false, error: e && e.name === "NotAllowedError" ? "Camera access was blocked. Allow it in your browser's site settings, then try again." : "No working webcam was found." });
    }
  };

  // Pressing Start: full screen first (browsers only allow it straight from a
  // click), then the server starts — or returns to — the attempt.
  const start = async () => {
    if (starting) return;
    setStarting(true);
    setStartError("");
    if (!inDesktopApp() && !(await enterFullscreen())) {
      setStarting(false);
      setStartError("The test needs full screen. Please allow it and press Start again.");
      return;
    }
    const res = await startTest(applicationId, { consent: true, adult: true, sessionId: stored.get(sessionKey(applicationId)) || undefined });
    setStarting(false);
    if (!res.ok) {
      leaveFullscreen();
      if (res.code === "submitted") { load(); return; }
      setStartError(res.error || "Could not start the test right now.");
      return;
    }
    stored.set(sessionKey(applicationId), res.sessionId);
    setRunning(res);
  };

  const onFinished = useCallback((outcome) => {
    stored.remove(sessionKey(applicationId));
    stopCamera();
    setCamera({ stream: null, asking: false, error: "" });
    setRunning(null);
    setFinished(outcome);
  }, [applicationId, stopCamera]);

  if (!isLoggedIn) {
    return (
      <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
        <div className="wrap" style={{ maxWidth: 480 }}>
          <span className="eyebrow">Aptitude test</span>
          <h1 className="title-lg" style={{ margin: "14px 0 16px" }}>Log in to take your test</h1>
          <button className="btn btn-solid" onClick={() => openAuthModal("login")}>Log in</button>
        </div>
      </section>
    );
  }
  if (finished) return <TestFinished reason={finished.reason} />;
  if (running) return <TestRunner data={running} stream={camera.stream} onFinished={onFinished} />;

  if (info === undefined) {
    return (
      <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
        <div className="wrap"><p style={{ color: "var(--muted)" }}>Loading...</p></div>
      </section>
    );
  }
  if (info === null || info.state === "locked") {
    return (
      <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
        <div className="wrap" style={{ maxWidth: 560 }}>
          <span className="eyebrow">Aptitude test</span>
          <h1 className="title-lg" style={{ margin: "14px 0 16px" }}>{info === null ? "We couldn't open this test" : "This test is locked"}</h1>
          <p style={{ color: "var(--muted)", marginBottom: 24, lineHeight: 1.7 }}>
            {info === null ? loadError : "Unlock it from My Dashboard → Apply / Aptitude Test — accept the terms (and pay the registration fee, if the role has one). You can take the test straight away."}
          </p>
          <Link className="btn btn-solid" to="/dashboard?tab=apply">Go to My Dashboard</Link>
        </div>
      </section>
    );
  }
  if (info.state === "submitted") return <TestFinished reason={info.attempt ? info.attempt.submitReason : "manual"} />;

  return <TestLobby info={info} camera={camera} onEnableCamera={enableCamera} onStart={start} starting={starting} error={startError} />;
}
