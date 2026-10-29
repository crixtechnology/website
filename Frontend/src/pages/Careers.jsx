import { useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Reveal, TiltCard, BenefitIcon, Aurora, SkeletonCards, SectionIndex, CopyButton, Alert, TermsCheckbox, DownloadPdfButton, ProfileGate,
  useBodyScrollLock, useModalEscape, useModalFocus, burstConfetti, REDUCED,
} from "../components/ui.jsx";
import {
  checkoutTestFee, unlockFreeRole, isFreeRole, openApplicationFor, StatusPill, AdultCheckbox,
  useMyJobApplications, RoleApplyButton, isInReview, MY_APPLICATIONS,
} from "../components/CareersDashboard.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { usePageMeta, routeMeta, useJsonLd, canonicalUrl, SITE_URL } from "../hooks/usePageMeta.js";
import { getOpenings, getMyJobApplications, hasBackend } from "../services/api.js";
import { formatINR } from "../utils/tiers.js";
import { site } from "../data/content.js";
import {
  careersHero, careersContact, vision, mission, values, feeBoxPoints, defaultTerms, rememberRole, careersRulesDocument,
  isRoleFull, positionsLabel, positionsTag,
} from "../data/careers.js";

// Skeleton cards show while the live openings load — but never for longer than this.
const LOADING_CAP_MS = 4000;

const CAREERS_INDEX = [
  { id: "vision", label: "Vision & mission" },
  { id: "openings", label: "Current openings" },
];

const scrollToId = (id) => (e) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
};

// The facts every opening carries.
const openingFacts = (o) => [
  ["Positions", positionsLabel(o.positions)],
  ["Stipend", o.stipend],
  ["Experience", o.experience],
  ["Duration", o.duration],
  ["Mode", o.mode],
].filter(([, v]) => v);

// Whether this role asks for the aptitude-test registration fee — the only
// place on the page the fee is mentioned, role by role.
function FeeBadge({ opening, terms }) {
  return isFreeRole(opening)
    ? <span className="fee-pill fee-pill--free">Free to apply</span>
    : <span className="fee-pill">{formatINR(terms.testFee)} registration</span>;
}

/* ---------- one opening's card ---------- */
function OpeningCard({ opening, terms, i, mine, onOpen, onApply }) {
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
            {mine ? <StatusPill application={mine} /> : <FeeBadge opening={opening} terms={terms} />}
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
  const free = isFreeRole(opening);
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
          <FeeBadge opening={opening} terms={terms} />
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
          technical questions for this role{test.negativeMarks ? `, with ${test.negativeMarks} taken off for each wrong answer` : ""}.
        </p>

        <h4 className="job-modal-heading">Registration</h4>
        {free ? (
          <p className="form-note" style={{ marginTop: 0 }}>
            There's no registration fee for this role. You'll accept the Terms &amp; Conditions and confirm you're 18 or older before the test unlocks.
          </p>
        ) : (
          <>
            <p className="form-note" style={{ marginTop: 0 }}>
              This role has an aptitude-test registration fee of <b>{formatINR(terms.testFee)}</b>. You'll accept the Terms &amp; Conditions before paying.
            </p>
            <ul className="detail-points">
              {feeBoxPoints(terms).filter((p) => !/signup bonus/i.test(p)).map((p) => <li key={p}>{p}</li>)}
            </ul>
          </>
        )}

        {mine && <p className="form-note" style={{ margin: "16px 0 0" }}>You've applied for this role. Status: <StatusPill application={mine} /></p>}
        <RoleApplyButton opening={opening} mine={mine} onApply={onApply} style={{ width: "100%", marginTop: 16 }}
          label={free ? "Apply Now — Free" : "Apply Now"} fullLabel="All positions filled" />
        <div className="careers-rules-download">
          <DownloadPdfButton label="Download hiring & test rules (PDF)" getDocument={() => careersRulesDocument(free ? null : terms, { role: opening.title })} />
        </div>
      </div>
    </div>
  );
}

/* ---------- pay the registration (aptitude-test) fee, right here ----------
   Opened by Apply Now for a logged-in student. Shows what they pay and what
   comes back, the Terms & Conditions box, and the Pay button (Razorpay); once
   paid, the test can be started straight away. A free role has the same boxes
   and unlocks the test without payment. A role they've already applied for
   shows where that application stands instead. */
function TestFeeModal({ opening, terms, user, onClose }) {
  const [application, setApplication] = useState(undefined); // undefined = checking
  const [agreed, setAgreed] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [paidId, setPaidId] = useState(""); // the application just paid for
  const payBtn = useRef(null);
  const alive = useRef(true);
  useBodyScrollLock(!!opening);
  useModalFocus(!!opening);
  // Closing mid-payment would hide the result, so Esc / the backdrop wait for it.
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
    setPaidId("");
    getMyJobApplications().then((res) => {
      if (alive.current) setApplication(res && res.ok ? openApplicationFor(res.applications || [], opening) || null : null);
    });
    return () => { alive.current = false; };
  }, [opening]);

  if (!opening) return null;
  const test = opening.test || {};
  const status = application ? application.status : "none";
  const free = isFreeRole(opening);

  const pay = async () => {
    if (busy || !agreed || !adult) return;
    setBusy(true);
    setMsg({ kind: "", text: "" });
    const r = free
      ? await unlockFreeRole({ opening })
      : await checkoutTestFee({
        opening,
        user,
        onConfirming: () => { if (alive.current) setMsg({ kind: "info", text: "Confirming your payment..." }); },
      });
    if (!alive.current) return;
    setBusy(false);
    if (r.ok) {
      setMsg({ kind: "", text: "" });
      setPaidId(r.applicationId);
      burstConfetti(payBtn.current);
    } else if (!r.dismissed) {
      setMsg({ kind: "error", text: r.error });
    }
  };

  let body;
  if (paidId) {
    body = (
      <>
        <Alert inline kind="success">
          {free ? "You're registered — your aptitude test is unlocked." : `Payment confirmed — ${terms.testFee} credits are in your wallet and your aptitude test is unlocked.`}
        </Alert>
        <p className="form-note">
          You have {test.durationMinutes || "the set"} minutes for {test.questions || "the"} questions, and one attempt. Find a quiet
          place with a steady connection and a working webcam before you start.
        </p>
        <Link className="btn btn-solid" style={{ width: "100%" }} to={`/test/${paidId}`}>Start test now →</Link>
        <Link className="btn btn-ghost" style={{ width: "100%", marginTop: 10 }} to="/dashboard?tab=applications">Take it later from My Dashboard</Link>
      </>
    );
  } else if (application === undefined) {
    body = <p className="form-note">Checking your applications…</p>;
  } else if (status === "test_pending") {
    body = (
      <>
        <p className="form-note">You've already {free ? "registered" : "paid"} for this role — your test is unlocked. <StatusPill application={application} /></p>
        <Link className="btn btn-solid" style={{ width: "100%" }} to={`/test/${application._id}`}>
          {application.attempt ? "Resume test →" : "Start test →"}
        </Link>
      </>
    );
  } else if (status !== "none" && status !== "payment_pending") {
    body = (
      <>
        <p className="form-note">You've taken the test for this role. Current status: <StatusPill application={application} /></p>
        <Link className="btn btn-ghost" style={{ width: "100%" }} to="/dashboard?tab=applications">See My Applications →</Link>
      </>
    );
  } else if (free) {
    body = (
      <>
        <p className="form-note" style={{ marginTop: 0 }}>
          There's no registration fee for this role. Accept the terms to unlock your aptitude test
          {test.questions ? ` — ${test.questions} questions` : ""}{test.durationMinutes ? ` in ${test.durationMinutes} minutes` : ""}. You can take it straight away.
        </p>
        <AdultCheckbox checked={adult} onChange={(v) => { setAdult(v); setMsg({ kind: "", text: "" }); }} disabled={busy} />
        <TermsCheckbox checked={agreed} onChange={(v) => { setAgreed(v); setMsg({ kind: "", text: "" }); }} disabled={busy} what="the aptitude test" />
        <button ref={payBtn} className="btn btn-solid" style={{ width: "100%" }} disabled={busy || !agreed || !adult} onClick={pay}>
          {busy ? "Please wait..." : "Unlock Free Test"}
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="form-note" style={{ marginTop: 0 }}>
          Pay the registration fee to unlock your aptitude test{test.questions ? ` — ${test.questions} questions` : ""}
          {test.durationMinutes ? ` in ${test.durationMinutes} minutes` : ""}. You can take it straight away, and the whole fee comes back as wallet credit.
        </p>
        <dl className="order-summary">
          <div><dt>Aptitude test registration fee</dt><dd>{formatINR(terms.testFee)}</dd></div>
          <div className="is-off"><dt>Returned as wallet credit</dt><dd>+{terms.testFee} credits</dd></div>
          <div className="is-total"><dt>You pay</dt><dd>{formatINR(terms.testFee)}</dd></div>
        </dl>
        <ul className="check-list apply-rules">
          {feeBoxPoints(terms).filter((p) => !/signup bonus/i.test(p)).map((p) => <li key={p}>{p}</li>)}
        </ul>
        <ProfileGate onLeave={onClose}>
          <AdultCheckbox checked={adult} onChange={(v) => { setAdult(v); setMsg({ kind: "", text: "" }); }} disabled={busy} />
          <TermsCheckbox checked={agreed} onChange={(v) => { setAgreed(v); setMsg({ kind: "", text: "" }); }} disabled={busy} what="the aptitude test registration fee" />
          <button ref={payBtn} className="btn btn-solid" style={{ width: "100%" }} disabled={busy || !agreed || !adult} onClick={pay}>
            {busy ? "Please wait..." : `Pay ${formatINR(terms.testFee)} & Unlock Test`}
          </button>
        </ProfileGate>
      </>
    );
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-box test-fee-modal" role="dialog" aria-modal="true" aria-labelledby="test-fee-modal-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={close} aria-label="Close" disabled={busy}>✕</button>
        <span className="eyebrow">Apply · Aptitude test</span>
        <h3 id="test-fee-modal-title" style={{ margin: "12px 0 12px" }}>{opening.title}</h3>
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
  const { user, isLoggedIn, isAdmin, openAuthModal } = useContext(UserContext);
  // Only the roles the server says are open — a closed role is never shown.
  const [openings, setOpenings] = useState([]);
  // False until the server has answered (or when it couldn't be reached).
  const [live, setLive] = useState(false);
  const [terms, setTerms] = useState(defaultTerms);
  const [loading, setLoading] = useState(hasBackend);
  const [detail, setDetail] = useState(null);
  const [notice, setNotice] = useState("");
  // The role whose registration fee is being paid in <TestFeeModal>.
  const [paying, setPaying] = useState(null);
  // Roles already applied for show "View my application" / "Continue application".
  const { applications, reload: reloadApplications } = useMyJobApplications(isLoggedIn && !isAdmin);

  useEffect(() => {
    let alive = true;
    const cap = setTimeout(() => setLoading(false), LOADING_CAP_MS);
    getOpenings().then((res) => {
      if (!alive) return;
      // An empty list means every role is closed: say so, rather than showing old ones.
      if (res.ok) { setOpenings((res.openings || []).filter((o) => o && o.status !== "closed")); setLive(true); }
      if (res.ok && res.terms) setTerms({ ...defaultTerms, ...res.terms });
      setLoading(false);
    });
    return () => { alive = false; clearTimeout(cap); };
  }, []);

  // Search engines' job listings don't allow roles that charge applicants a
  // fee, so only free roles are marked up (scripts/prerender-meta.js does the same).
  const listedJobs = openings.filter(isFreeRole);
  useJsonLd("jobs-jsonld", listedJobs.length ? { "@context": "https://schema.org", "@graph": listedJobs.map(jobPostingLd) } : null);

  // Apply Now on a role: the registration-fee popup opens right here on the
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
        if (isInReview(mine)) navigate(MY_APPLICATIONS); else setPaying(opening);
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
            <div className="grid3 stagger" style={{ marginTop: 24 }}><SkeletonCards count={3} /></div>
          ) : openings.length ? (
            <div className="grid3 stagger" style={{ marginTop: 24 }}>
              {openings.map((o, i) => <OpeningCard key={o.slug} opening={o} terms={terms} i={i} mine={openApplicationFor(applications, o)} onOpen={setDetail} onApply={apply} />)}
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
      <TestFeeModal opening={paying} terms={terms} user={user} onClose={() => { setPaying(null); reloadApplications(); }} />

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
