import { useState } from "react";
import {
  Reveal, TiltCard, Aurora, SectionIndex, CopyButton, DownloadPdfButton, DurationSwitch,
  useBodyScrollLock, useModalEscape, useModalFocus, REDUCED,
} from "../components/ui.jsx";
import { usePageMeta, routeMeta, useJsonLd, canonicalUrl, SITE_URL } from "../hooks/usePageMeta.js";
import { careersContact, isRoleFull, positionsTag } from "../data/careers.js";
import { programFacts } from "../utils/positions.js";
import { groupVariants } from "../utils/variants.js";
import { legal } from "../data/content.js";
import {
  FREE_PATH, FREE_APPLY_FORM_URL, freeHero, freeSteps, freeEligibility, freeRules, freeOpenings,
} from "../data/freeInternships.js";

// The free internships page, open to students of every field (the menu's
// Internships → Free Internship). A static page: the roles are written in
// data/freeInternships.js (freeOpenings) — nothing is loaded from the backend.
// Roles are free, and are applied for through our Google Form (FreeApplyButton).

// One card per role; roles sharing a group are its durations, picked with the switch.
const OPENING_GROUPS = groupVariants(freeOpenings);

// schema.org JobPosting for each role, so search engines can list them as
// internships (scripts/prerender-meta.js builds the same for the prebuilt page).
// Unpaid, so no baseSalary; applied for through our Google Form, so not directApply.
function freeJobPostingLd(o) {
  const lines = (title, items) => (items && items.length ? `<p><strong>${title}</strong></p><ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "");
  return {
    "@type": "JobPosting",
    title: o.title,
    description: `<p>${o.summary}</p>${lines("Responsibilities", o.responsibilities)}${lines("Eligibility", o.eligibility)}${lines("Skills", o.skills)}`
      + `<p>Free internship: no fee to apply, no stipend. Duration: ${o.duration}. Mode: ${o.mode}. Expected start: ${o.startsOn}.</p>`,
    datePosted: o.datePosted,
    employmentType: "INTERN",
    hiringOrganization: { "@type": "Organization", name: "Crix Technology", sameAs: SITE_URL, logo: `${SITE_URL}/crix-logo.png` },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Ahmedabad", addressRegion: "Gujarat", addressCountry: "IN" } },
    jobLocationType: "TELECOMMUTE",
    applicantLocationRequirements: { "@type": "Country", name: "India" },
    experienceRequirements: o.experience || undefined,
    skills: (o.skills || []).join(", ") || undefined,
    directApply: false,
    url: canonicalUrl(FREE_PATH),
  };
}
const OPEN_ROLES = freeOpenings.filter((o) => !isRoleFull(o));
const JOBS_LD = OPEN_ROLES.length ? { "@context": "https://schema.org", "@graph": OPEN_ROLES.map(freeJobPostingLd) } : null;

const INDEX = [
  { id: "openings", label: "Openings" },
  { id: "how", label: "How it works" },
  { id: "rules", label: "Rules" },
];

const scrollToId = (id) => (e) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
};

// The facts every program card shows, the same list for all three (utils/positions.js).
const openingFacts = programFacts;

// The badge on a role: applying, the test and the internship are all free.
const FreeBadge = () => <span className="fee-pill fee-pill--free">Free</span>;

/* ---------- a role's Apply button ----------
   Opens our Google Form (FREE_APPLY_FORM_URL) in a new tab. A full role stays off. */
function FreeApplyButton({ opening, label, fullLabel, className = "btn btn-solid", style }) {
  if (isRoleFull(opening)) return <button className={className} style={style} disabled>{fullLabel}</button>;
  return <a className={className} style={style} href={FREE_APPLY_FORM_URL} target="_blank" rel="noopener noreferrer">{label}</a>;
}

/* ---------- one opening's card ---------- */
// switcher: the duration switch when this role is offered in several durations
// (FreeOpeningGroupCard) — the same switch Training + Internship cards have.
function FreeOpeningCard({ opening, i, onOpen, switcher = null }) {
  return (
    <Reveal as="div" variant={i % 3 === 0 ? "reveal-l" : i % 3 === 2 ? "reveal-r" : "reveal-top"} style={{ "--i": i }}>
      <TiltCard className="card-type-internship job-card">
        <div className="job-card-body" onClick={() => onOpen(opening)}>
          <div className="card-top">
            <div className="card-top-left">
              <span className="type-pill type-pill--internship">Internship</span>
              <span className={`tag${isRoleFull(opening) ? " tag--full" : ""}`}>{positionsTag(opening.positions, "Open")}</span>
            </div>
            <FreeBadge />
          </div>
          <h3>{opening.title}</h3>
          {switcher && <div onClick={(e) => e.stopPropagation()}>{switcher}</div>}
          <dl className="job-facts">
            {openingFacts(opening).map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </div>
        <div className="card-btn-row">
          <FreeApplyButton opening={opening} className="btn btn-solid buy-btn" label="Apply Now" fullLabel="Positions filled" />
          <button className="btn btn-ghost see-more-btn" onClick={() => onOpen(opening)} aria-haspopup="dialog">View details →</button>
        </div>
      </TiltCard>
    </Reveal>
  );
}

/* ---------- one role offered in several durations ----------
   Roles the admin put in the same group: one card, the selected duration's
   role filling it — its details follow the switch. */
function FreeOpeningGroupCard({ variants, ...cardProps }) {
  const [active, setActive] = useState(0);
  const opening = variants[Math.min(active, variants.length - 1)];
  if (variants.length < 2) return <FreeOpeningCard {...cardProps} opening={opening} />;
  return (
    <FreeOpeningCard {...cardProps} opening={opening}
      switcher={<DurationSwitch variants={variants} active={active} onPick={setActive} label={`${opening.title}: choose a duration`} />} />
  );
}

/* ---------- full details of one opening ---------- */
function FreeOpeningModal({ opening, onClose }) {
  useBodyScrollLock(!!opening);
  useModalFocus(!!opening);
  useModalEscape(!!opening, onClose);
  if (!opening) return null;
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
          <FreeBadge />
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
        {opening.skills && opening.skills.length > 0 && (
          <>
            <h4 className="job-modal-heading">Skills</h4>
            <div className="deliverable-row">{opening.skills.map((s) => <span key={s} className="deliverable-chip">{s}</span>)}</div>
          </>
        )}
        <h4 className="job-modal-heading">How to apply</h4>
        <p className="form-note" style={{ marginTop: 0 }}>
          Press Apply Now and fill in our application form with your CV. Our team then emails you how and when to take the aptitude
          test, and candidates who do well are invited to an interview.
        </p>
        <FreeApplyButton opening={opening} style={{ width: "100%", marginTop: 16 }}
          label="Apply Now — Free" fullLabel="All positions filled" />
      </div>
    </div>
  );
}

/* ================= FREE INTERNSHIPS ================= */
export default function FreeInternships() {
  usePageMeta(routeMeta(FREE_PATH));
  // Same id as scripts/prerender-meta.js uses on the prebuilt page, so it's replaced, not doubled.
  useJsonLd("free-jobs-jsonld", JOBS_LD);
  const [detail, setDetail] = useState(null);

  const hero = freeHero;
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

      {/* Openings */}
      <section id="openings" className="section section--internships anchor-section" style={{ paddingTop: 20 }}>
        <div className="orb orb-1"></div>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Free Openings</Reveal>
          <Reveal as="h2" variant="reveal-l">Pick your role.</Reveal>
          {OPENING_GROUPS.length ? (
            <>
              <Reveal as="p" variant="reveal-l" className="section-lede">
                Every role below is free. Press Apply Now on the role you want and fill in the form with your CV — we'll contact you for the aptitude test and interview.
              </Reveal>
              <div className="grid3 stagger" style={{ marginTop: 24 }}>
                {OPENING_GROUPS.map((g, i) => (
                  <FreeOpeningGroupCard key={g.key} variants={g.variants} i={i} onOpen={setDetail} />
                ))}
              </div>
            </>
          ) : (
            <div className="card no-openings" role="status" style={{ marginTop: 24 }}>
              <h3>No open roles right now</h3>
              <p>
                New free internships are posted here first, so check back soon. Questions? Email <a href={`mailto:${careersContact.email}`}>{careersContact.email}</a>.
              </p>
            </div>
          )}

          <div className="vm-grid">
            <Reveal variant="reveal-l" className="vm-card">
              <span className="vm-label">Who can apply</span>
              <ul className="check-list">{freeEligibility.map((x) => <li key={x}>{x}</li>)}</ul>
            </Reveal>
            <Reveal variant="reveal-r" className="vm-card">
              <span className="vm-label">After you apply</span>
              <p>
                Our team reviews your form and CV, then emails you about the <b>aptitude test</b>. Candidates who do well are invited to
                an <b>interview</b>, and selected candidates get their offer letter and joining details.
              </p>
            </Reveal>
          </div>
        </div>
      </section>
      <FreeOpeningModal opening={detail} onClose={() => setDetail(null)} />

      {/* How it works */}
      <section id="how" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">How It Works</Reveal>
          <Reveal as="h2" variant="reveal-l">Four steps, no fee.</Reveal>
          <div className="process stagger">
            {freeSteps.map((s, i) => (
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
          <Reveal as="h2" variant="reveal-l">Application rules.</Reveal>
          <Reveal variant="reveal" className="vm-card" style={{ marginTop: 26 }}>
            <ul className="dash-list">{freeRules.map((x) => <li key={x}>{x}</li>)}</ul>
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
