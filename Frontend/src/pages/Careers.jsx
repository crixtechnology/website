import { useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Reveal, TiltCard, BenefitIcon, Aurora, SkeletonCards, SectionIndex, CopyButton, Alert, TermsCheckbox, DownloadPdfButton,
  useBodyScrollLock, useModalEscape, useModalFocus, burstConfetti, REDUCED,
} from "../components/ui.jsx";
import { checkoutTestFee, openApplicationFor, StatusPill, AdultCheckbox } from "../components/CareersDashboard.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { usePageMeta, routeMeta, useJsonLd, canonicalUrl, SITE_URL } from "../hooks/usePageMeta.js";
import { getOpenings, getMyJobApplications, hasBackend } from "../services/api.js";
import { formatINR } from "../utils/tiers.js";
import {
  careersHero, careersContact, vision, mission, values, whyJoin, hiringSteps, feeBoxPoints, careersFaq,
  defaultTerms, rememberRole, careersRulesDocument,
} from "../data/careers.js";

// Skeleton cards show while the live openings load — but never for longer than this.
const LOADING_CAP_MS = 4000;

const CAREERS_INDEX = [
  { id: "vision", label: "Vision & mission" },
  { id: "why-join", label: "Why join Crix" },
  { id: "openings", label: "Current openings" },
  { id: "hiring-process", label: "How hiring works" },
  { id: "test-fee", label: "Your test fee" },
  { id: "faq", label: "FAQ" },
];

const scrollToId = (id) => (e) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
};

// The four facts every opening carries.
const openingFacts = (o) => [
  ["Stipend", o.stipend],
  ["Experience", o.experience],
  ["Duration", o.duration],
  ["Mode", o.mode],
].filter(([, v]) => v);

/* ---------- one opening's card ---------- */
function OpeningCard({ opening, i, onOpen, onApply }) {
  return (
    <Reveal as="div" variant={i % 3 === 0 ? "reveal-l" : i % 3 === 2 ? "reveal-r" : "reveal-top"} style={{ "--i": i }}>
      <TiltCard className="card-type-internship job-card">
        {/* The whole card opens the details; the buttons below are the keyboard route. */}
        <div className="job-card-body" onClick={() => onOpen(opening)}>
          <div className="card-top">
            <div className="card-top-left">
              <span className="type-pill type-pill--internship">Internship</span>
              <span className="tag">Now hiring</span>
            </div>
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
          <button className="btn btn-solid buy-btn" onClick={() => onApply(opening)}>Apply Now</button>
          <button className="btn btn-ghost see-more-btn" onClick={() => onOpen(opening)} aria-haspopup="dialog">View details →</button>
        </div>
      </TiltCard>
    </Reveal>
  );
}

/* ---------- full details of one opening ---------- */
function OpeningModal({ opening, terms, onClose, onApply }) {
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
        <span className="eyebrow">Internship opening</span>
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
          The ₹{terms.testFee} test fee comes back as {terms.testFee} wallet credits.
        </p>

        <button className="btn btn-solid" style={{ width: "100%", marginTop: 16 }} onClick={() => onApply(opening)}>Apply Now</button>
      </div>
    </div>
  );
}

/* ---------- pay the registration (aptitude-test) fee, right here ----------
   Opened by Apply Now for a logged-in student. Shows what they pay and what
   comes back, the Terms & Conditions box, and the Pay button (Razorpay); once
   paid, the test can be started straight away. A role they've already paid
   for shows where that application stands instead. */
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

  const pay = async () => {
    if (busy || !agreed || !adult) return;
    setBusy(true);
    setMsg({ kind: "", text: "" });
    const r = await checkoutTestFee({
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
          Payment confirmed — {terms.testFee} credits are in your wallet and your aptitude test is unlocked.
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
        <p className="form-note">You've already paid for this role — your test is unlocked. <StatusPill application={application} /></p>
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
        <AdultCheckbox checked={adult} onChange={(v) => { setAdult(v); setMsg({ kind: "", text: "" }); }} disabled={busy} />
        <TermsCheckbox checked={agreed} onChange={(v) => { setAgreed(v); setMsg({ kind: "", text: "" }); }} disabled={busy} what="the aptitude test registration fee" />
        <button ref={payBtn} className="btn btn-solid" style={{ width: "100%" }} disabled={busy || !agreed || !adult} onClick={pay}>
          {busy ? "Please wait..." : `Pay ${formatINR(terms.testFee)} & Unlock Test`}
        </button>
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

  useJsonLd("jobs-jsonld", openings.length ? { "@context": "https://schema.org", "@graph": openings.map(jobPostingLd) } : null);
  const faqs = careersFaq(terms);
  useJsonLd("faq-jsonld", {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  });

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
    const go = opening ? () => setPaying(opening) : () => navigate("/dashboard?tab=apply");
    if (!isLoggedIn) {
      if (opening) rememberRole(opening.slug);
      openAuthModal("signup", go);
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
            <a className="btn btn-ghost" href="#hiring-process" onClick={scrollToId("hiring-process")}>How Hiring Works</a>
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

      {/* 3. Why Join Crix */}
      <section id="why-join" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-top" className="eyebrow">Why Join Crix</Reveal>
          <Reveal as="h2" variant="reveal-top">More than a line on your résumé.</Reveal>
          <div className="grid3 stagger" style={{ marginTop: 40 }}>
            {whyJoin.map((b, i) => (
              <Reveal key={b.title} variant="reveal" className="benefit" style={{ "--i": i }}>
                <span className="benefit-icon"><BenefitIcon name={b.icon} /></span>
                <h3>{b.title}</h3>
                <p>{b.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Current Openings */}
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
              {openings.map((o, i) => <OpeningCard key={o.slug} opening={o} i={i} onOpen={setDetail} onApply={apply} />)}
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
      <OpeningModal opening={detail} terms={terms} onClose={() => setDetail(null)} onApply={apply} />
      <TestFeeModal opening={paying} terms={terms} user={user} onClose={() => setPaying(null)} />

      {/* 5. Hiring Process */}
      <section id="hiring-process" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Hiring Process</Reveal>
          <Reveal as="h2" variant="reveal-l">Six steps from sign-up to offer letter.</Reveal>
          <ol className="timeline stagger">
            {hiringSteps(terms).map((s, i) => (
              <Reveal as="li" key={s.title} variant="reveal" className="timeline-step" style={{ "--i": i }}>
                <span className="step-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <span className="timeline-label">Step {i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </ol>
          <div className="careers-rules-download">
            <DownloadPdfButton label="Download hiring & test rules (PDF)" getDocument={() => careersRulesDocument(terms)} />
          </div>
        </div>
      </section>

      {/* 6. Where does my fee go? */}
      <section id="test-fee" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal variant="reveal-zoom" className="band fee-band">
            <div>
              <span className="eyebrow">Your test fee</span>
              <h2>Where does my ₹{terms.testFee} go?</h2>
              <p>Straight back to you. The test fee isn't a charge for applying — it returns to your wallet as credits you can spend on any Crix course.</p>
              <div className="fee-sum" aria-label={`${terms.testFee} credits from your test fee plus ${terms.signupBonus} signup bonus credits`}>
                <div><b>{terms.testFee}</b><span>credits from your test fee</span></div>
                <i aria-hidden="true">+</i>
                <div><b>{terms.signupBonus}</b><span>signup bonus credits</span></div>
              </div>
            </div>
            <ul className="check-list fee-points">
              {feeBoxPoints(terms).map((p) => <li key={p}>{p}</li>)}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* 7. FAQ */}
      <section id="faq" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap" style={{ maxWidth: 860 }}>
          <Reveal as="span" variant="reveal-top" className="eyebrow">FAQ</Reveal>
          <Reveal as="h2" variant="reveal-top">Questions, answered.</Reveal>
          <Reveal variant="reveal" className="faq-list" style={{ marginTop: 34 }}>
            {faqs.map((f) => (
              <details className="faq" key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </Reveal>
        </div>
      </section>

      {/* 8. Final CTA */}
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
                <div className="contact-line">
                  <a href={tel}>{careersContact.phone}</a>
                  <a className="wa-pill" href={`https://wa.me/${careersContact.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
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
