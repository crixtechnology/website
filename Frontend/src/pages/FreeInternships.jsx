import { useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Reveal, TiltCard, Aurora, SkeletonCards, SectionIndex, CopyButton, Alert, DownloadPdfButton,
  useBodyScrollLock, useModalEscape, useModalFocus, burstConfetti, REDUCED,
} from "../components/ui.jsx";
import { openApplicationFor, StatusPill, AdultCheckbox, checkoutTestFee } from "../components/CareersDashboard.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { usePageMeta } from "../hooks/usePageMeta.js";
import { useNoIndex } from "../hooks/useNoIndex.js";
import { getFreeOpenings, getMyJobApplications, applyForRole, uploadApplicationCv, unlockFreeTest, hasBackend } from "../services/api.js";
import PhoneInput from "../components/PhoneInput.jsx";
import { phoneError, phoneFieldError } from "../utils/phone.js";
import { FieldError } from "../components/FormFields.jsx";
import { useTouched } from "../hooks/useTouched.js";
import { EducationFields, educationForm, educationPayload, educationMissing, emptyEducation } from "../utils/education.js";
import { careersContact, isRoleFull, positionsLabel, positionsTag } from "../data/careers.js";
import { legal } from "../data/content.js";
import {
  freeHero, freeSteps, freeEligibility, freeRules, processingFeePoints, defaultFreeTerms, CV_MAX_MB, RESULT_DAYS,
} from "../data/freeInternships.js";
import { formatINR } from "../utils/tiers.js";

// The free internships page, open to students of every field. Not linked from
// anywhere on the site and kept out of search results (noindex, not in the
// sitemap): it is shared by its address only. Roles are free; applying needs an account and a CV (PDF), which makes
// the candidate eligible for the aptitude test (pages/student/AptitudeTest.jsx).

const LOADING_CAP_MS = 4000;
const CV_MAX_BYTES = CV_MAX_MB * 1024 * 1024;

const INDEX = [
  { id: "openings", label: "Openings" },
  { id: "how", label: "How it works" },
  { id: "rules", label: "Rules" },
];

const scrollToId = (id) => (e) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
};

const openingFacts = (o) => [
  ["Positions", positionsLabel(o.positions)],
  ["Stipend", o.stipend],
  ["Experience", o.experience],
  ["Duration", o.duration],
  ["Mode", o.mode],
].filter(([, v]) => v);

// Checks a chosen file before it is sent: a PDF of up to 2 MB.
function cvProblem(file) {
  if (!file) return "Choose your CV (PDF).";
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) return "Your CV must be a PDF file. Save it as PDF from Word or Google Docs and try again.";
  if (file.size > CV_MAX_BYTES) return `That file is too large — the CV can be up to ${CV_MAX_MB} MB.`;
  if (file.size === 0) return "That file is empty.";
  return "";
}

// The badge on a role: "Processing fee" (its amount changes, so it is shown
// only at the payment step), or "Free" when there is none.
function FeeBadge({ fee }) {
  return fee > 0
    ? <span className="fee-pill">Processing fee</span>
    : <span className="fee-pill fee-pill--free">Free</span>;
}

/* ---------- one opening's card ---------- */
function FreeOpeningCard({ opening, i, fee, onOpen, onApply }) {
  return (
    <Reveal as="div" variant={i % 3 === 0 ? "reveal-l" : i % 3 === 2 ? "reveal-r" : "reveal-top"} style={{ "--i": i }}>
      <TiltCard className="card-type-internship job-card">
        <div className="job-card-body" onClick={() => onOpen(opening)}>
          <div className="card-top">
            <div className="card-top-left">
              <span className="type-pill type-pill--internship">Internship</span>
              <span className={`tag${isRoleFull(opening) ? " tag--full" : ""}`}>{positionsTag(opening.positions, "Open")}</span>
            </div>
            <FeeBadge fee={fee} />
          </div>
          <h3>{opening.title}</h3>
          <p>{opening.summary}</p>
          <div className="deliverable-row">
            {(opening.skills || []).map((s) => <span key={s} className="deliverable-chip">{s}</span>)}
          </div>
          <dl className="job-facts">
            {openingFacts(opening).map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </div>
        <div className="card-btn-row">
          <button className="btn btn-solid buy-btn" disabled={isRoleFull(opening)} onClick={() => onApply(opening)}>
            {isRoleFull(opening) ? "Positions filled" : "Apply with CV"}
          </button>
          <button className="btn btn-ghost see-more-btn" onClick={() => onOpen(opening)} aria-haspopup="dialog">View details →</button>
        </div>
      </TiltCard>
    </Reveal>
  );
}

/* ---------- full details of one opening ---------- */
function FreeOpeningModal({ opening, fee, onClose, onApply }) {
  useBodyScrollLock(!!opening);
  useModalFocus(!!opening);
  useModalEscape(!!opening, onClose);
  if (!opening) return null;
  const test = opening.test || {};
  const lists = [
    ["Responsibilities", opening.responsibilities],
    ["Eligibility", opening.eligibility],
  ].filter(([, items]) => items && items.length);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box detail-modal-box" role="dialog" aria-modal="true" aria-labelledby="free-modal-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="detail-modal-top">
          <span className="eyebrow">Free internship</span>
          <FeeBadge fee={fee} />
        </div>
        <h3 id="free-modal-title" style={{ margin: "12px 0 8px" }}>{opening.title}</h3>
        <p style={{ color: "var(--muted)", fontSize: ".9rem", lineHeight: 1.65 }}>{opening.summary}</p>
        {openingFacts(opening).map(([label, value]) => (
          <div className="detail-fact" key={label}><span>{label}</span><b>{value}</b></div>
        ))}
        {lists.map(([heading, items]) => (
          <div key={heading}>
            <h4 className="job-modal-heading">{heading}</h4>
            <ul className="detail-points">{items.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ))}
        <h4 className="job-modal-heading">Aptitude test</h4>
        <p className="form-note" style={{ marginTop: 0 }}>
          {test.questions ? `${test.questions} multiple-choice questions` : "A multiple-choice test"}
          {test.durationMinutes ? ` in ${test.durationMinutes} minutes` : ""}
          {test.negativeMarks ? `, with ${test.negativeMarks} taken off for each wrong answer` : ""}: quantitative, logical reasoning and
          verbal questions pitched for students of any field, and technical questions for this role. It unlocks once your CV is uploaded
          {fee > 0 ? " and the test processing fee is paid (it all comes back as wallet credits)" : ""}.
          You'll get your result by email within {RESULT_DAYS} days of submitting it.
        </p>
        <button className="btn btn-solid" style={{ width: "100%", marginTop: 16 }} disabled={isRoleFull(opening)} onClick={() => onApply(opening)}>
          {isRoleFull(opening) ? "All positions filled" : fee > 0 ? "Apply with CV" : "Apply with CV — Free"}
        </button>
      </div>
    </div>
  );
}

/* ---------- apply: details, CV upload, processing fee, then the test unlocks ----------
   Opened by "Apply with CV" for a logged-in student. The student's details and
   education come prefilled from Profile; whatever they confirm is saved back to
   Profile (and the server keeps a copy on the application). Then it applies for
   the role (or reuses the open application), uploads the CV, and takes the test
   processing fee through Razorpay — the fee comes back as wallet credit — or,
   when the fee is set to 0, unlocks the test straight away. A role already
   applied for shows where that application stands. */
function FreeApplyModal({ opening, terms, onClose }) {
  const { user, updateProfile } = useContext(UserContext);
  const [details, setDetails] = useState({ name: "", phone: "" });
  const [education, setEducation] = useState(emptyEducation);
  const [application, setApplication] = useState(undefined); // undefined = checking
  const [file, setFile] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [doneId, setDoneId] = useState("");
  const fields = useTouched();
  const submitBtn = useRef(null);
  const alive = useRef(true);
  useBodyScrollLock(!!opening);
  useModalFocus(!!opening);
  const close = () => { if (!busy) onClose(); };
  useModalEscape(!!opening, close);

  useEffect(() => {
    alive.current = true;
    if (!opening) return undefined;
    setApplication(undefined);
    setFile(null);
    setAgreed(false);
    setAdult(false);
    setBusy(false);
    setMsg({ kind: "", text: "" });
    setDoneId("");
    getMyJobApplications().then((res) => {
      if (alive.current) setApplication(res && res.ok ? openApplicationFor(res.applications || [], opening) || null : null);
    });
    return () => { alive.current = false; };
  }, [opening]);

  // Prefilled from Profile each time the form opens (a login-form account's placeholder name starts empty).
  useEffect(() => {
    if (!opening || !user) return;
    setDetails({ name: user.profilePending ? "" : user.name || "", phone: user.phone || "" });
    setEducation(educationForm(user));
  }, [opening]); // only when it opens, not on every profile save

  if (!opening) return null;
  const test = opening.test || {};
  const fee = terms.processingFee || 0;
  // Live errors under the two detail fields (hooks/useTouched.js).
  const detailErrors = {
    "free-name": details.name.trim() ? "" : "Enter your full name.",
    "free-phone": phoneFieldError(details.phone),
  };
  const showDetailErr = (id) => (fields.show(id) && detailErrors[id]) || "";
  const status = application ? application.status : "none";
  const existingCv = application && application.cv;

  const pickFile = (e) => {
    const chosen = e.target.files && e.target.files[0];
    setFile(chosen || null);
    const problem = chosen ? cvProblem(chosen) : "";
    setMsg(problem ? { kind: "error", text: problem } : { kind: "", text: "" });
  };

  const submit = async () => {
    if (busy || !agreed || !adult) return;
    fields.markSubmitted();
    const missing = [
      ...(details.name.trim() ? [] : ["full name"]),
      ...(details.phone.trim() ? [] : ["phone number"]),
      ...educationMissing(education),
    ];
    if (missing.length) { setMsg({ kind: "error", text: `Please add your ${missing.join(", ")}.` }); return; }
    const phoneProblem = phoneError(details.phone);
    if (phoneProblem) { setMsg({ kind: "error", text: `Please add ${phoneProblem}.` }); return; }
    const problem = file ? cvProblem(file) : existingCv ? "" : cvProblem(null);
    if (problem) { setMsg({ kind: "error", text: problem }); return; }
    setBusy(true);
    setMsg({ kind: "info", text: "Sending your application…" });

    const saved = await updateProfile({ name: details.name.trim(), phone: details.phone.trim(), confirmName: true, ...educationPayload(education) });
    if (!alive.current) return;
    if (!saved.ok) { setBusy(false); setMsg({ kind: "error", text: saved.error }); return; }

    let id = application && application._id;
    if (!id) {
      const applied = await applyForRole(opening.slug);
      if (!alive.current) return;
      if (!applied.ok) { setBusy(false); setMsg({ kind: "error", text: applied.error }); return; }
      id = applied.application._id;
      setApplication(applied.application);
    }
    if (file) {
      const up = await uploadApplicationCv(id, file);
      if (!alive.current) return;
      if (!up.ok) { setBusy(false); setMsg({ kind: "error", text: up.error }); return; }
    }
    const unlocked = fee > 0
      ? await checkoutTestFee({
        opening,
        user: saved.user || user,
        description: `Test processing fee — ${opening.title}`,
        onConfirming: () => { if (alive.current) setMsg({ kind: "info", text: "Confirming your payment…" }); },
      })
      : await unlockFreeTest(id);
    if (!alive.current) return;
    setBusy(false);
    if (!unlocked.ok) {
      setMsg(unlocked.dismissed
        ? { kind: "info", text: "Payment cancelled. Your details and CV are saved — pay whenever you're ready." }
        : { kind: "error", text: unlocked.error });
      return;
    }
    setMsg({ kind: "", text: "" });
    setDoneId(id);
    burstConfetti(submitBtn.current);
  };

  let body;
  if (doneId) {
    body = (
      <>
        <Alert inline kind="success">
          {fee > 0
            ? `Payment confirmed — ${fee} credits are in your wallet and your aptitude test is unlocked.`
            : "Application sent — your CV is in and you're eligible for the aptitude test."}
        </Alert>
        <p className="form-note">
          You have {test.durationMinutes || "the set"} minutes for {test.questions || "the"} questions, and one attempt. Use a laptop or
          desktop with a webcam, somewhere quiet. You'll get your result by email within {RESULT_DAYS} days of submitting the test.
        </p>
        <Link className="btn btn-solid" style={{ width: "100%" }} to={`/test/${doneId}`}>Start test now →</Link>
        <Link className="btn btn-ghost" style={{ width: "100%", marginTop: 10 }} to="/dashboard?tab=applications">Take it later from My Dashboard</Link>
      </>
    );
  } else if (application === undefined) {
    body = <p className="form-note">Checking your applications…</p>;
  } else if (status === "test_pending") {
    body = (
      <>
        <p className="form-note">You've already applied for this role{existingCv ? ` with ${existingCv.fileName}` : ""} — your test is unlocked. <StatusPill application={application} /></p>
        <Link className="btn btn-solid" style={{ width: "100%" }} to={`/test/${application._id}`}>
          {application.attempt ? "Resume test →" : "Start test →"}
        </Link>
      </>
    );
  } else if (status !== "none" && status !== "payment_pending") {
    body = (
      <>
        <p className="form-note">You've taken the test for this role. Current status: <StatusPill application={application} /></p>
        <p className="form-note">We email every candidate their result — selected or not selected — within {RESULT_DAYS} days of the test.</p>
        <Link className="btn btn-ghost" style={{ width: "100%" }} to="/dashboard?tab=applications">See My Applications →</Link>
      </>
    );
  } else {
    body = (
      <>
        <p className="form-note" style={{ marginTop: 0 }}>
          Check your details and upload your CV to apply.
          {fee > 0 ? ` Then pay the ${formatINR(fee)} test processing fee — it comes back as ${fee} wallet credits — and your aptitude test unlocks` : " Once it's in, your free aptitude test unlocks"}
          {test.questions ? ` — ${test.questions} questions` : ""}{test.durationMinutes ? ` in ${test.durationMinutes} minutes` : ""}.
        </p>
        <h4 className="job-modal-heading">Your details</h4>
        <div className="field">
          <label htmlFor="free-name">Full name</label>
          <input id="free-name" autoComplete="name" maxLength={80} value={details.name} disabled={busy}
            onChange={(e) => { setDetails({ ...details, name: e.target.value }); setMsg({ kind: "", text: "" }); }}
            onBlur={fields.touch("free-name")} aria-invalid={!!showDetailErr("free-name") || undefined} aria-describedby="free-name-err" />
          <FieldError id="free-name-err">{showDetailErr("free-name")}</FieldError>
        </div>
        <div className="field">
          <label htmlFor="free-phone">Phone</label>
          <PhoneInput id="free-phone" value={details.phone} disabled={busy}
            onChange={(phone) => { setDetails((d) => ({ ...d, phone })); setMsg({ kind: "", text: "" }); }}
            onBlur={fields.touch("free-phone")} invalid={!!showDetailErr("free-phone")} describedBy="free-phone-err" />
          <FieldError id="free-phone-err">{showDetailErr("free-phone")}</FieldError>
        </div>
        <h4 className="job-modal-heading">Education</h4>
        <EducationFields form={education} disabled={busy} idPrefix="free-edu"
          onChange={(next) => { setEducation(next); setMsg({ kind: "", text: "" }); }} />
        <p className="form-note" style={{ marginTop: 0 }}>These are saved to your profile, so next time they're filled in for you.</p>
        <h4 className="job-modal-heading">CV</h4>
        <div className="field">
          <label htmlFor="free-cv">Your CV (PDF, up to {CV_MAX_MB} MB)</label>
          <input id="free-cv" type="file" accept="application/pdf,.pdf" onChange={pickFile} disabled={busy} />
          {existingCv && !file && <p className="form-note" style={{ margin: "6px 0 0" }}>Already uploaded: <b>{existingCv.fileName}</b> — choose a file only to replace it.</p>}
        </div>
        {fee > 0 && (
          <>
            <h4 className="job-modal-heading">Test processing fee</h4>
            <dl className="order-summary">
              <div><dt>Test processing fee</dt><dd>{formatINR(fee)}</dd></div>
              <div className="is-off"><dt>Returned as wallet credit</dt><dd>+{fee} credits</dd></div>
              <div className="is-total"><dt>You pay</dt><dd>{formatINR(fee)}</dd></div>
            </dl>
            <ul className="check-list apply-rules">{processingFeePoints(terms).map((p) => <li key={p}>{p}</li>)}</ul>
          </>
        )}
        <AdultCheckbox checked={adult} onChange={(v) => { setAdult(v); setMsg({ kind: "", text: "" }); }} disabled={busy} />
        <label className="check-row">
          <input type="checkbox" checked={agreed} disabled={busy} onChange={(e) => { setAgreed(e.target.checked); setMsg({ kind: "", text: "" }); }} />
          <span>
            I have read and agree to the <a href="#rules" onClick={(e) => { e.preventDefault(); onClose(); setTimeout(() => document.getElementById("rules")?.scrollIntoView(), 0); }}>internship rules</a>,
            {" "}and the <a href="/terms-of-service" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>
            {fee > 0 ? <>, including the <a href="/terms-of-service#refunds" target="_blank" rel="noopener noreferrer">payment &amp; refund rules</a>,</> : ""} and{" "}
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          </span>
        </label>
        <button ref={submitBtn} className="btn btn-solid" style={{ width: "100%" }} disabled={busy || !agreed || !adult} onClick={submit}>
          {busy ? "Please wait..." : fee > 0 ? `Pay ${formatINR(fee)} & Apply` : "Send CV & Apply"}
        </button>
      </>
    );
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-box test-fee-modal" role="dialog" aria-modal="true" aria-labelledby="free-apply-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={close} aria-label="Close" disabled={busy}>✕</button>
        <span className="eyebrow">Apply · Free internship</span>
        <h3 id="free-apply-title" style={{ margin: "12px 0 12px" }}>{opening.title}</h3>
        {body}
        <Alert inline kind={msg.kind || "info"}>{msg.text}</Alert>
      </div>
    </div>
  );
}

/* ================= FREE INTERNSHIPS ================= */
export default function FreeInternships() {
  usePageMeta({
    title: "Free Internships | Crix Technology",
    description: "Free internships for students of every field at Crix Technology: apply with your CV, take the online aptitude test, and get your result within 7 days.",
  });
  useNoIndex(true);
  const { isLoggedIn, isAdmin, openAuthModal } = useContext(UserContext);
  const [openings, setOpenings] = useState([]);
  const [live, setLive] = useState(false);
  const [terms, setTerms] = useState(defaultFreeTerms);
  const [loading, setLoading] = useState(hasBackend);
  const [detail, setDetail] = useState(null);
  const [applying, setApplying] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    const cap = setTimeout(() => setLoading(false), LOADING_CAP_MS);
    const load = () => getFreeOpenings().then((res) => {
      if (!alive) return;
      if (res.ok) { setOpenings((res.openings || []).filter((o) => o && o.status !== "closed")); setLive(true); }
      if (res.ok && res.terms) setTerms({ ...defaultFreeTerms, ...res.terms });
      setLoading(false);
    });
    load();
    // Phones keep tabs in memory and bring them back without reloading, so a page
    // opened before roles were added kept saying "no open roles". Coming back to
    // the tab (or returning to it with Back) fetches the list again.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    const onPageShow = (e) => { if (e.persisted) load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      alive = false;
      clearTimeout(cap);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  // Sign up (or log in) first; the CV form opens right after.
  const apply = (opening) => {
    setDetail(null);
    setNotice("");
    if (isAdmin) { setNotice("You're signed in as an admin. Log in with a student account to apply."); return; }
    if (!isLoggedIn) { openAuthModal("login", () => setApplying(opening)); return; }
    setApplying(opening);
  };

  const hero = freeHero(terms.processingFee);
  const tel = `tel:${careersContact.phone.replace(/[^\d+]/g, "")}`;

  return (
    <>
      <header className="page-head careers-hero" style={{ position: "relative", overflow: "hidden" }}>
        <Aurora />
        <Reveal variant="reveal-top" style={{ position: "relative", zIndex: 2 }} className="wrap">
          <span className="eyebrow">{hero.eyebrow}</span>
          <h1 style={{ fontSize: "clamp(1.6rem,4vw + .6rem,3rem)", margin: "14px 0 18px" }}>{hero.title}</h1>
          <p>{hero.text}</p>
          <div className="hero-ctas">
            <a className="btn btn-solid" href="#openings" onClick={scrollToId("openings")}>View Openings</a>
            <a className="btn btn-ghost" href="#rules" onClick={scrollToId("rules")}>Read the Rules</a>
          </div>
        </Reveal>
      </header>
      <SectionIndex items={INDEX} />
      <Alert kind="info">{notice}</Alert>

      {/* Openings */}
      <section id="openings" className="section section--internships anchor-section" style={{ paddingTop: 20 }}>
        <div className="orb orb-1"></div>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Free Openings</Reveal>
          <Reveal as="h2" variant="reveal-l">Pick your role.</Reveal>
          {(loading || openings.length > 0) && (
            <Reveal as="p" variant="reveal-l" className="section-lede">
              Every role below is free. Sign up, send your CV for the role you want, and take the aptitude test.
            </Reveal>
          )}
          {loading ? (
            <div className="grid3 stagger" style={{ marginTop: 24 }}><SkeletonCards count={3} /></div>
          ) : openings.length ? (
            <div className="grid3 stagger" style={{ marginTop: 24 }}>
              {openings.map((o, i) => <FreeOpeningCard key={o.slug} opening={o} i={i} fee={terms.processingFee} onOpen={setDetail} onApply={apply} />)}
            </div>
          ) : (
            <div className="card no-openings" role="status" style={{ marginTop: 24 }}>
              <h3>{live ? "No open roles right now" : "We couldn't load the open roles"}</h3>
              <p>
                {live
                  ? <>New free internships are posted here first, so check back soon. Questions? Email <a href={`mailto:${careersContact.email}`}>{careersContact.email}</a>.</>
                  : <>Please refresh the page in a moment. If it keeps happening, email <a href={`mailto:${careersContact.email}`}>{careersContact.email}</a>.</>}
              </p>
            </div>
          )}

          <div className="vm-grid">
            <Reveal variant="reveal-l" className="vm-card">
              <span className="vm-label">Who can apply</span>
              <ul className="check-list">{freeEligibility.map((x) => <li key={x}>{x}</li>)}</ul>
            </Reveal>
            <Reveal variant="reveal-r" className="vm-card">
              <span className="vm-label">After the test</span>
              <p>
                Every candidate gets an email within <b>{RESULT_DAYS} days</b> of submitting the test — whether you're <b>selected</b> or
                {" "}<b>not selected</b>. Selected candidates also get their offer letter and joining details. Your result is shown in
                My Dashboard → My Applications too.
              </p>
            </Reveal>
          </div>
        </div>
      </section>
      <FreeOpeningModal opening={detail} fee={terms.processingFee} onClose={() => setDetail(null)} onApply={apply} />
      <FreeApplyModal opening={applying} terms={terms} onClose={() => setApplying(null)} />

      {/* How it works */}
      <section id="how" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">How It Works</Reveal>
          <Reveal as="h2" variant="reveal-l">{terms.processingFee > 0 ? "Four simple steps." : "Four steps, no fee."}</Reveal>
          <div className="process stagger">
            {freeSteps(terms.processingFee).map((s, i) => (
              <Reveal key={s.n} variant="reveal" className="step" style={{ "--i": i }}>
                <span className="step-num">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Rules */}
      <section id="rules" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap" style={{ maxWidth: 900 }}>
          <Reveal as="span" variant="reveal-l" className="eyebrow">Rules</Reveal>
          <Reveal as="h2" variant="reveal-l">Application &amp; test rules.</Reveal>
          <Reveal variant="reveal" className="vm-card" style={{ marginTop: 26 }}>
            <ul className="dash-list">{freeRules(terms).map((x) => <li key={x}>{x}</li>)}</ul>
          </Reveal>
          {/* The site's own Terms and Privacy Policy, as PDFs (same documents as /terms-of-service and /privacy-policy). */}
          <div className="legal-actions" style={{ marginTop: 18, justifyContent: "flex-start", flexWrap: "wrap", gap: 12 }}>
            {[["Terms of Service", legal.terms], ["Privacy Policy", legal.privacy]].map(([title, doc]) => (
              <DownloadPdfButton key={title} label={`Download ${title} (PDF)`}
                getDocument={() => ({ title, subtitle: legal.updated, intro: doc.intro, sections: doc.sections })} />
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="wrap">
          <Reveal variant="reveal-zoom" className="band">
            <div>
              <h2>Questions about free internships?</h2>
              <p>We're happy to help with your application or the test.</p>
              <div className="careers-contact">
                <div className="contact-line">
                  <a href={`mailto:${careersContact.email}`}>{careersContact.email}</a>
                  <CopyButton value={careersContact.email} label="support email address" />
                </div>
                <div className="contact-line">
                  <a href={tel}>{careersContact.phone}</a>
                  <a className="wa-pill" href={`https://wa.me/${careersContact.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </div>
              </div>
            </div>
            <div className="careers-cta-actions">
              <a className="btn btn-solid" href="#openings" onClick={scrollToId("openings")}>See Openings</a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
