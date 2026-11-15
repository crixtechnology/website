import { useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Reveal, TiltCard, BenefitIcon, Aurora, SkeletonCards, SectionIndex, CopyButton, Alert, TermsCheckbox, DownloadPdfButton,
  useBodyScrollLock, useModalEscape, useModalFocus, burstConfetti, REDUCED,
} from "../components/ui.jsx";
import {
  applyToRole, openApplicationFor, StatusPill, AdultCheckbox,
  useMyJobApplications, RoleApplyButton, isInReview, MY_APPLICATIONS,
} from "../components/CareersDashboard.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { usePageMeta, routeMeta, useJsonLd, canonicalUrl, SITE_URL } from "../hooks/usePageMeta.js";
import { getOpenings, getMyJobApplications, hasBackend } from "../services/api.js";
import { site } from "../data/content.js";
import {
  careersHero, careersContact, vision, mission, values, defaultTerms, rememberRole, careersRulesDocument,
  isRoleFull, positionsLabel, positionsTag,
} from "../data/careers.js";
import { programFacts } from "../utils/positions.js";

// Skeleton cards show until the live openings arrive; after this long a note
// says they're on their way (the backend may be waking up — getOpenings keeps
// trying for about a minute rather than showing "no roles" too early).
const SLOW_NOTE_MS = 4000;

const CAREERS_INDEX = [
  { id: "vision", label: "Vision & mission" },
  { id: "openings", label: "Current openings" },
];

const scrollToId = (id) => (e) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
};

// The facts every opening carries.
// The facts every program card shows, the same list for all three (utils/positions.js).
const openingFacts = programFacts;

// Every role is free to apply for, and so is its aptitude test.
const FreeBadge = () => <span className="fee-pill fee-pill--free">Free to apply</span>;

/* ---------- one opening's card ---------- */
function OpeningCard({ opening, i, mine, onOpen, onApply }) {
  return (
    <Reveal as="div" variant={i % 3 === 0 ? "reveal-l" : i % 3 === 2 ? "reveal-r" : "reveal-top"} style={{ "--i": i }}>
      <TiltCard className="card-type-internship job-card">
        {/* The whole card opens the details; the buttons below are the keyboard route. */}
        <div className="job-card-body" onClick={() => onOpen(opening)}>
          <div className="card-top">
            <div className="card-top-left">
              <span className="type-pill type-pill--internship">Internship</span>
              <span className={`tag${isRoleFull(opening) ? " tag--full" : ""}`}>{positionsTag(opening.positions, "Now hiring")}</span>
            </div>
            {mine ? <StatusPill application={mine} /> : <FreeBadge />}
          </div>
          <h3>{opening.title}</h3>
          <dl className="job-facts">
            {openingFacts(opening).map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </div>
        <div className="card-btn-row">
          <RoleApplyButton opening={opening} mine={mine} onApply={onApply} className="btn btn-solid buy-btn" label="Apply Now" fullLabel="Positions filled" />
          <button className="btn btn-ghost see-more-btn" onClick={() => onOpen(opening)} aria-haspopup="dialog">View details →</button>
        </div>
      </TiltCard>
    </Reveal>
  );
}

/* ---------- full details of one opening ---------- */
function OpeningModal({ opening, terms, mine, onClose, onApply }) {
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
      <div className="modal-box detail-modal-box" role="dialog" aria-modal="true" aria-labelledby="opening-modal-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="detail-modal-top">
          <span className="eyebrow">Internship opening</span>
          <FreeBadge />
        </div>
        <h3 id="opening-modal-title" style={{ margin: "12px 0 8px" }}>{opening.title}</h3>
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

        {opening.skills && opening.skills.length > 0 && (
          <>
            <h4 className="job-modal-heading">Skills</h4>
            <div className="deliverable-row">{opening.skills.map((s) => <span key={s} className="deliverable-chip">{s}</span>)}</div>
          </>
        )}

        <h4 className="job-modal-heading">Aptitude test</h4>
        <p className="form-note" style={{ marginTop: 0 }}>
          {test.questions ? `${test.questions} multiple-choice questions` : "A multiple-choice test"}
          {test.durationMinutes ? ` in ${test.durationMinutes} minutes` : ""} — quantitative, logical reasoning, verbal ability and
          technical questions for this role.
        </p>

        <h4 className="job-modal-heading">Registration</h4>
        <p className="form-note" style={{ marginTop: 0 }}>
          Applying and the aptitude test are free. You'll accept the Terms &amp; Conditions and confirm you're 18 or older when you apply; our team then gives you access to the test and emails you when it's ready.
        </p>

        {mine && <p className="form-note" style={{ margin: "16px 0 0" }}>You've applied for this role. Status: <StatusPill application={mine} /></p>}
        <RoleApplyButton opening={opening} mine={mine} onApply={onApply} style={{ width: "100%", marginTop: 16 }}
          label="Apply Now — Free" fullLabel="All positions filled" />
        <div className="careers-rules-download">
          <DownloadPdfButton label="Download hiring & test rules (PDF)" getDocument={() => careersRulesDocument(terms, { role: opening.title })} />
        </div>
      </div>
    </div>
  );
}

/* ---------- apply for a role, right here ----------
   Opened by Apply Now for a logged-in student. Shows the 18+ and Terms &
   Conditions boxes; applying is free, and our team then gives access to the
   aptitude test (the student hears by email and in their notifications). A
   role they've already applied for shows where that application stands. */
function ApplyModal({ opening, onClose }) {
  const [application, setApplication] = useState(undefined); // undefined = checking
  const [agreed, setAgreed] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [justApplied, setJustApplied] = useState(false);
  const applyBtn = useRef(null);
  const alive = useRef(true);
  useBodyScrollLock(!!opening);
  useModalFocus(!!opening);
  // Closing mid-request would hide the result, so Esc / the backdrop wait for it.
  const close = () => { if (!busy) onClose(); };
  useModalEscape(!!opening, close);

  useEffect(() => {
    alive.current = true;
    if (!opening) return undefined;
    setApplication(undefined);
    setAgreed(false);
    setAdult(false);
    setBusy(false);
    setMsg({ kind: "", text: "" });
    setJustApplied(false);
    getMyJobApplications().then((res) => {
      if (alive.current) setApplication(res && res.ok ? openApplicationFor(res.applications || [], opening) || null : null);
    });
    return () => { alive.current = false; };
  }, [opening]);

  if (!opening) return null;
  const test = opening.test || {};
  const status = application ? application.status : "none";

  const apply = async () => {
    if (busy || !agreed || !adult) return;
    setBusy(true);
    setMsg({ kind: "", text: "" });
    const r = await applyToRole({ opening });
    if (!alive.current) return;
    setBusy(false);
    if (r.ok) {
      setApplication(r.application);
      setJustApplied(r.application.status === "awaiting_access");
      if (r.application.status === "awaiting_access") burstConfetti(applyBtn.current);
    } else {
      setMsg({ kind: "error", text: r.error });
    }
  };

  let body;
  if (application === undefined) {
    body = <p className="form-note">Checking your applications…</p>;
  } else if (status === "awaiting_access") {
    body = (
      <>
        {justApplied
          ? <Alert inline kind="success">You've applied for this role.</Alert>
          : <p className="form-note">You've already applied for this role. <StatusPill application={application} /></p>}
        <p className="form-note">
          Our team will give you access to the aptitude test — we'll email you and let you know in your dashboard as soon as it's ready.
        </p>
        <Link className="btn btn-ghost" style={{ width: "100%" }} to="/dashboard?tab=applications">See My Applications →</Link>
      </>
    );
  } else if (status === "test_pending") {
    body = (
      <>
        <p className="form-note">Your aptitude test for this role is ready. <StatusPill application={application} /></p>
        <p className="form-note">
          You have {test.durationMinutes || "the set"} minutes for {test.questions || "the"} questions, and one attempt. Find a quiet
          place with a steady connection and a working webcam before you start.
        </p>
        <Link className="btn btn-solid" style={{ width: "100%" }} to={`/test/${application._id}`}>
          {application.attempt ? "Resume test →" : "Start test →"}
        </Link>
      </>
    );
  } else if (status !== "none") {
    body = (
      <>
        <p className="form-note">You've taken the test for this role. Current status: <StatusPill application={application} /></p>
        <Link className="btn btn-ghost" style={{ width: "100%" }} to="/dashboard?tab=applications">See My Applications →</Link>
      </>
    );
  } else {
    body = (
      <>
        <p className="form-note" style={{ marginTop: 0 }}>
          Applying and the aptitude test are free. Once you've applied, our team gives you access to the test
          {test.questions ? ` (${test.questions} questions` : ""}{test.questions && test.durationMinutes ? ` in ${test.durationMinutes} minutes)` : test.questions ? ")" : ""} and
          emails you when it's ready.
        </p>
        <AdultCheckbox checked={adult} onChange={(v) => { setAdult(v); setMsg({ kind: "", text: "" }); }} disabled={busy} />
        <TermsCheckbox checked={agreed} onChange={(v) => { setAgreed(v); setMsg({ kind: "", text: "" }); }} disabled={busy} what="the aptitude test" />
        <button ref={applyBtn} className="btn btn-solid" style={{ width: "100%" }} disabled={busy || !agreed || !adult} onClick={apply}>
          {busy ? "Please wait..." : "Apply — Free"}
        </button>
      </>
    );
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-box apply-modal" role="dialog" aria-modal="true" aria-labelledby="apply-modal-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={close} aria-label="Close" disabled={busy}>✕</button>
        <span className="eyebrow">Apply · Aptitude test</span>
        <h3 id="apply-modal-title" style={{ margin: "12px 0 12px" }}>{opening.title}</h3>
        {body}
        <Alert inline kind={msg.kind || "info"}>{msg.text}</Alert>
      </div>
    </div>
  );
}

// schema.org JobPosting for each opening (scripts/prerender-meta.js builds the same for the prebuilt page).
function jobPostingLd(o) {
  const lines = (title, items) => (items && items.length ? `<p><strong>${title}</strong></p><ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "");
  return {
    "@type": "JobPosting",
    title: o.title,
    description: `<p>${o.summary}</p>${lines("Responsibilities", o.responsibilities)}${lines("Eligibility", o.eligibility)}${lines("Skills", o.skills)}`,
    datePosted: String(o.createdAt || "").slice(0, 10) || undefined,
    employmentType: "INTERN",
    hiringOrganization: { "@type": "Organization", name: "Crix Technology", sameAs: SITE_URL, logo: `${SITE_URL}/crix-logo.png` },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Ahmedabad", addressRegion: "Gujarat", addressCountry: "IN" } },
    jobLocationType: "TELECOMMUTE",
    applicantLocationRequirements: { "@type": "Country", name: "India" },
    baseSalary: { "@type": "MonetaryAmount", currency: "INR", value: { "@type": "QuantitativeValue", minValue: 0, maxValue: 6000, unitText: "MONTH" } },
    experienceRequirements: o.experience || undefined,
    skills: (o.skills || []).join(", ") || undefined,
    directApply: true,
    url: canonicalUrl("/careers"),
  };
}

/* ================= CAREERS ================= */
export default function Careers() {
  usePageMeta(routeMeta("/careers"));
  const navigate = useNavigate();
  const { isLoggedIn, isAdmin, openAuthModal } = useContext(UserContext);
  // Only the roles the server says are open — a closed role is never shown.
  const [openings, setOpenings] = useState([]);
  // False until the server has answered (or when it couldn't be reached).
  const [live, setLive] = useState(false);
  const [terms, setTerms] = useState(defaultTerms);
  const [loading, setLoading] = useState(hasBackend);
  const [slow, setSlow] = useState(false);
  const [detail, setDetail] = useState(null);
  const [notice, setNotice] = useState("");
  // The role being applied for in <ApplyModal>.
  const [applying, setApplying] = useState(null);
  // Roles already applied for show "View my application" / "Continue application".
  const { applications, reload: reloadApplications } = useMyJobApplications(isLoggedIn && !isAdmin);

  useEffect(() => {
    let alive = true;
    const cap = setTimeout(() => setSlow(true), SLOW_NOTE_MS);
    getOpenings().then((res) => {
      if (!alive) return;
      // An empty list means every role is closed: say so, rather than showing old ones.
      if (res.ok) { setOpenings((res.openings || []).filter((o) => o && o.status !== "closed")); setLive(true); }
      if (res.ok && res.terms) setTerms({ ...defaultTerms, ...res.terms });
      setLoading(false);
      clearTimeout(cap);
    });
    return () => { alive = false; clearTimeout(cap); };
  }, []);

  // Every role is free to apply for, so every one is marked up for search
  // engines' job listings (scripts/prerender-meta.js does the same).
  const listedJobs = openings;
  useJsonLd("jobs-jsonld", listedJobs.length ? { "@context": "https://schema.org", "@graph": listedJobs.map(jobPostingLd) } : null);

  // Apply Now on a role: the registration popup opens right here on the
  // Careers page — after signing up or logging in first, if needed (the role is
  // remembered meanwhile, so the dashboard can still open on it after a redirect).
  // The bottom "Apply Now", which has no role, goes to the dashboard's Apply section.
  const apply = (opening) => {
    setDetail(null);
    setNotice("");
    if (isAdmin) { setNotice("You're signed in as an admin. Log in with a student account to apply."); return; }
    if (!live) {
      setNotice(`Online applications aren't open right now. Email ${careersContact.email} or message us on WhatsApp and we'll help you apply.`);
      return;
    }
    // Already applied and the test is done: straight to My Applications to follow it.
    const go = opening
      ? async () => {
        const res = await getMyJobApplications();
        const mine = res && res.ok ? openApplicationFor(res.applications || [], opening) : null;
        if (isInReview(mine)) navigate(MY_APPLICATIONS); else setApplying(opening);
      }
      : () => navigate("/dashboard?tab=apply");
    if (!isLoggedIn) {
      if (opening) rememberRole(opening.slug);
      openAuthModal("login", go);
      return;
    }
    go();
  };

  const tel = `tel:${careersContact.phone.replace(/[^\d+]/g, "")}`;

  return (
    <>
      {/* 1. Hero */}
      <header className="page-head careers-hero" style={{ position: "relative", overflow: "hidden" }}>
        <Aurora />
        <Reveal variant="reveal-top" style={{ position: "relative", zIndex: 2 }} className="wrap">
          <span className="eyebrow">{careersHero.eyebrow}</span>
          <h1 style={{ fontSize: "clamp(1.6rem,4vw + .6rem,3rem)", margin: "14px 0 18px" }}>{careersHero.title}</h1>
          <p>{careersHero.text}</p>
          <div className="hero-ctas">
            <a className="btn btn-solid" href="#openings" onClick={scrollToId("openings")}>View Openings</a>
            <a className="btn btn-ghost" href="#vision" onClick={scrollToId("vision")}>Our Vision</a>
          </div>
        </Reveal>
      </header>
      <SectionIndex items={CAREERS_INDEX} />
      <Alert kind="info">{notice}</Alert>

      {/* 2. Vision & Mission */}
      <section id="vision" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Vision &amp; Mission</Reveal>
          <Reveal as="h2" variant="reveal-l">Why we do this.</Reveal>
          <div className="vm-grid">
            <Reveal variant="reveal-l" className="vm-card">
              <span className="vm-label">Our vision</span>
              <p>{vision}</p>
            </Reveal>
            <Reveal variant="reveal-r" className="vm-card">
              <span className="vm-label">Our mission</span>
              <p>{mission}</p>
            </Reveal>
          </div>
          <div className="grid4 stagger" style={{ marginTop: 26 }}>
            {values.map((v, i) => (
              <Reveal key={v.title} variant="reveal" className="benefit" style={{ "--i": i }}>
                <span className="benefit-icon"><BenefitIcon name={v.icon} /></span>
                <h3>{v.title}</h3>
                <p>{v.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Current Openings */}
      <section id="openings" className="section section--internships anchor-section" style={{ paddingTop: 20 }}>
        <div className="orb orb-1"></div>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Current Openings</Reveal>
          <Reveal as="h2" variant="reveal-l">Find your role.</Reveal>
          {(loading || openings.length > 0) && (
            <Reveal as="p" variant="reveal-l" className="section-lede">
              Freshers are welcome for every role below. Pick one, take the aptitude test, and we'll take it from there.
            </Reveal>
          )}
          {loading ? (
            <>
              {slow && <p className="form-note" role="status" style={{ marginTop: 16 }}>Loading the open roles — this can take a few seconds the first time.</p>}
              <div className="grid3 stagger" style={{ marginTop: 24 }}><SkeletonCards count={3} /></div>
            </>
          ) : openings.length ? (
            <div className="grid3 stagger" style={{ marginTop: 24 }}>
              {openings.map((o, i) => <OpeningCard key={o.slug} opening={o} i={i} mine={openApplicationFor(applications, o)} onOpen={setDetail} onApply={apply} />)}
            </div>
          ) : (
            <div className="card no-openings" role="status" style={{ marginTop: 24 }}>
              <h3>{live ? "No open roles right now" : "We couldn't load the open roles"}</h3>
              <p>
                {live
                  ? <>We're not hiring for any role at the moment. New openings are posted here first, so check back soon. Questions? Email <a href={`mailto:${careersContact.email}`}>{careersContact.email}</a>.</>
                  : <>Please refresh the page in a moment. If it keeps happening, email <a href={`mailto:${careersContact.email}`}>{careersContact.email}</a>.</>}
              </p>
            </div>
          )}
        </div>
      </section>
      <OpeningModal opening={detail} terms={terms} mine={detail ? openApplicationFor(applications, detail) : null} onClose={() => setDetail(null)} onApply={apply} />
      <ApplyModal opening={applying} onClose={() => { setApplying(null); reloadApplications(); }} />

      {/* 4. Final CTA */}
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="wrap">
          <Reveal variant="reveal-zoom" className="band">
            <div>
              <h2>Ready to start your journey?</h2>
              <p>Pick a role, take the test, and show us what you can do.</p>
              <div className="careers-contact">
                <div className="contact-line">
                  <a href={`mailto:${careersContact.email}`}>{careersContact.email}</a>
                  <CopyButton value={careersContact.email} label="support email address" />
                </div>
                <div className="dept-block dept--programs">
                  <span className="dept-tag">{site.phoneAltLabel}</span>
                  <span className="dept-hint">{site.phoneAltHint}</span>
                  <div className="contact-line">
                    <a href={tel}>{careersContact.phone}</a>
                    <a className="wa-pill" href={`https://wa.me/${careersContact.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                  </div>
                </div>
              </div>
            </div>
            <div className="careers-cta-actions">
              <button className="btn btn-solid" onClick={() => apply(null)}>Apply Now</button>
              <Link className="btn btn-ghost" to="/contact">Ask a question</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
