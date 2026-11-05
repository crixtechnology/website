import { useContext, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Reveal, InfoCard, BenefitIcon, Logo, BuyModal, InquiryModal, DetailModal, ServiceInquiryModal, UpgradeModal, PlanCards, Alert, Marquee, RotatingWord, Counter, Hero3D, Aurora, LiveDevice, SkeletonCards, SectionIndex, CopyButton, burstConfetti, REDUCED,
  DownloadPdfButton, TrainingContact, ProgramGroupCard, DurationSwitch,
} from "../components/ui.jsx";
import { groupVariants, siblingsOf } from "../utils/variants.js";
import {
  site, hero, internships, services, process, benefits, trainingStages, selectionCriteria, stats, about, legal,
  techStack, clientProcess, engagementModels, expertise, whyCrix, company, programDeliverables, fallbackPrograms,
} from "../data/content.js";
import { submitContact, getCourses, getCourse, getServices, hasBackend } from "../services/api.js";

// Skeleton cards show while live lists load from the backend — but never for
// longer than this; after it the static fallback list shows instead.
const LOADING_CAP_MS = 4000;

// "On this page" dot rail (SectionIndex) entries for the long About page.
const ABOUT_INDEX = [
  { id: "overview", label: "Overview" },
  { id: "company-info", label: "Company info" },
  { id: "why-crix", label: "Why Crix" },
  { id: "partner", label: "Why partner with us" },
  { id: "tech-stack", label: "Technologies" },
];
import { UserContext } from "../context/UserContext.jsx";
import { usePageMeta, routeMeta, useJsonLd, canonicalUrl, SITE_URL, programKeywords } from "../hooks/usePageMeta.js";
import { useMyPlans } from "../hooks/useMyPlans.js";
import { useNoIndex } from "../hooks/useNoIndex.js";
import { emailError, nameError } from "../utils/validators.js";
import { phoneFieldError } from "../utils/phone.js";
import { FieldError, EmailFieldNote, emailFieldProblem } from "../components/FormFields.jsx";
import { useEmailCheck } from "../hooks/useEmailCheck.js";
import { useTouched, focusFirstError } from "../hooks/useTouched.js";
import PhoneInput from "../components/PhoneInput.jsx";
import { CourseFacts, CourseLists, CourseFaq, RelatedPrograms, EnrollBar, useCourseJsonLd } from "../components/CourseSections.jsx";
import { offeredTiers, isOpenForBuy, isFreeProgram, TIER_ORDER } from "../utils/tiers.js";
import { isFull, placeWord, positionsTag } from "../utils/positions.js";

// The ?tier= a purchase link carries, if it names a real plan.
const tierFromParams = (params) => {
  const tier = params.get("tier");
  return TIER_ORDER.includes(tier) ? tier : null;
};

/* ================= HOME ================= */
// Upward-trending sparkline shapes under the home stats (purely decorative).
const SPARKS = [
  "M0 20 L14 17 L28 18 L42 12 L56 14 L70 8 L84 9 L100 3",
  "M0 21 L12 19 L26 14 L40 16 L54 10 L68 11 L82 5 L100 4",
  "M0 18 L16 19 L30 13 L44 14 L58 9 L72 10 L86 6 L100 2",
  "M0 22 L14 18 L28 19 L42 15 L56 11 L70 12 L84 7 L100 5",
];

export function Home() {
  const heroRef = useRef(null);
  const [liveInternships, setLiveInternships] = useState(fallbackPrograms);
  const [loadingInternships, setLoadingInternships] = useState(hasBackend);
  const [inquireItem, setInquireItem] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [serviceInquiryItem, setServiceInquiryItem] = useState(null);
  const { hasAccess } = useMyPlans();
  usePageMeta(routeMeta("/"));
  useEffect(() => {
    const onScroll = () => {
      if (REDUCED || !heroRef.current) return;
      const y = window.scrollY, h = window.innerHeight;
      if (y < h) {
        heroRef.current.style.transform = `translateY(${y * 0.28}px)`;
        heroRef.current.style.opacity = String(Math.max(1 - y / (h * 0.75), 0));
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    let alive = true;
    const cap = setTimeout(() => setLoadingInternships(false), LOADING_CAP_MS);
    getCourses("internship").then((res) => {
      if (!alive) return;
      if (res.ok && res.courses && res.courses.length) setLiveInternships(res.courses);
      setLoadingInternships(false);
    });
    return () => { alive = false; clearTimeout(cap); };
  }, []);

  return (
    <>
      <header className="hero">
        <Aurora />
        <Hero3D />
        <div className="wrap hero-in" ref={heroRef}>
          <span className="eyebrow">{site.eyebrow}</span>
          <h1 className="hl" aria-label={hero.titleLabel || `${hero.titleParts.join(" ")} ${hero.rotatingWords[0]} ${hero.titleEnd.join(" ")}`}>
            <span className="hl-inner" aria-hidden="true">
              {hero.titleParts.map((w) => <span className="w" key={w}>{w}</span>)}
              <em className="w"><RotatingWord words={hero.rotatingWords} /></em>
              {hero.titleEnd.map((w) => <span className="w" key={w}>{w}</span>)}
            </span>
          </h1>
          {/* Words brighten one after another (upgrade.css .hw); screen readers get the plain sentence. */}
          <p className="hero-sub">
            <span className="sr-only">{hero.subtitle}</span>
            <span aria-hidden="true">
              {hero.subtitle.split(" ").map((w, i) => <span className="hw" key={i} style={{ "--w": i }}>{w} </span>)}
            </span>
          </p>
          <div className="hero-ctas">
            <Link className="btn btn-solid" to="/services">Our IT services</Link>
            <Link className="btn btn-ghost" to="/training-internship">Training + Internship</Link>
          </div>
          <div className="hero-meta">
            {hero.meta.map((m) => <div key={m.big}><b>{m.big}</b>{m.small}</div>)}
          </div>
        </div>
        <div className="scroll-hint"><div className="wheel"></div>SCROLL</div>
      </header>

      <Marquee />
      <TrustStrip />

      <section className="section" style={{ paddingBottom: 30 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-top" className="eyebrow">Live infrastructure</Reveal>
          <Reveal as="h2" variant="reveal-top">Everything we teach, running in production.</Reveal>
          <Reveal variant="reveal-r">
            <LiveDevice />
          </Reveal>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 70 }}>
        <div className="orb orb-2"></div>
        <div className="wrap">
          <Reveal as="span" variant="reveal-r" className="eyebrow">IT Services</Reveal>
          <Reveal as="h2" variant="reveal-r">Technology that grows your business.</Reveal>
          <div className="grid3 stagger">
            {services.slice(0, 3).map((it, i) => (
              <InfoCard key={it.title} item={it} i={i} onDetail={setDetailData} onServiceInquire={setServiceInquiryItem} />
            ))}
          </div>
          <div className="hero-ctas">
            <Link className="btn btn-ghost" to="/services">All services →</Link>
            <Link className="btn btn-ghost" to="/contact">Start a project →</Link>
          </div>
        </div>
      </section>

      <section className="section section--internships">
        <div className="orb orb-1"></div>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Training + Internship</Reveal>
          <Reveal as="h2" variant="reveal-l">Get trained. Perform. Earn a stipend.</Reveal>
          <div className="grid3 stagger">
            {/* One card per domain: tracks sharing a group get a duration switch. */}
            {loadingInternships ? <SkeletonCards count={internships.length} /> : groupVariants(liveInternships).map((g, i) => (
              <ProgramGroupCard key={g.key} variants={g.variants} i={i} isProgram kind="internship" ownedOf={hasAccess} onInquire={setInquireItem} onDetail={setDetailData} />
            ))}
          </div>
          <div className="hero-ctas">
            <Link className="btn btn-ghost" to="/training-internship">How Training + Internship works →</Link>
          </div>
        </div>
      </section>
      <InquiryModal item={inquireItem} kind="internship" onClose={() => setInquireItem(null)} />
      <DetailModal data={detailData} onClose={() => setDetailData(null)} onInquire={setInquireItem} onServiceInquire={setServiceInquiryItem} />
      <ServiceInquiryModal item={serviceInquiryItem} onClose={() => setServiceInquiryItem(null)} />

      <section className="section" style={{ paddingTop: 0, paddingBottom: 20 }}>
        <div className="wrap">
          <Reveal variant="reveal-zoom" className="stats">
            {stats.map((s, i) => (
              <div className="stat" key={s.label}>
                <Counter value={s.value} suffix={s.suffix} />
                <span>{s.label}</span>
                {/* Decorative trend line; draws itself in when the panel reveals. */}
                <svg className="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                  <path pathLength="1" d={SPARKS[i % SPARKS.length]} />
                </svg>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

/* ================= TRAINING + INTERNSHIP ================= */
// Every student is trained first; the best performers are then selected for a
// stipend-based internship. Only internship-type programs are sold here — the
// old Courses + Internship page is gone, and free roles live on Careers.
const TRAINING_INDEX = [
  { id: "how-it-works", label: "How it works" },
  { id: "programs", label: "Training tracks" },
  { id: "selection", label: "Selection" },
  { id: "benefits", label: "Benefits" },
];

export function TrainingInternship() {
  // Comes live from the backend, admin-managed, once it's connected
  // (REACT_APP_API_URL) — falls back to the static list in content.js
  // until then, so the page never shows empty.
  const [liveInternships, setLiveInternships] = useState(fallbackPrograms);
  const [loading, setLoading] = useState(hasBackend);
  // Training isn't bought online here: every card opens the Request to apply
  // form (or the student calls), and the team sends a payment request.
  const [inquireItem, setInquireItem] = useState(null);
  const [detailData, setDetailData] = useState(null); // { item, kind, isProgram } | null
  const [params, setParams] = useSearchParams();
  // What they already have: those cards say "View in My Dashboard" instead of offering plans again.
  const { hasAccess } = useMyPlans();
  usePageMeta(routeMeta("/training-internship"));

  useEffect(() => {
    let alive = true;
    const cap = setTimeout(() => setLoading(false), LOADING_CAP_MS);
    getCourses("internship").then((res) => {
      if (!alive) return;
      if (res.ok && res.courses && res.courses.length) setLiveInternships(res.courses);
      setLoading(false);
    });
    return () => { alive = false; clearTimeout(cap); };
  }, []);

  // An older ?buy=<slug> link (from when training was bought online) opens
  // that track's Request to apply form instead, then drops the param so a
  // refresh doesn't reopen it.
  useEffect(() => {
    const slug = params.get("buy");
    if (!slug) return;
    const match = liveInternships.find((c) => c.slug === slug);
    if (match) {
      setInquireItem(match);
      const nextParams = new URLSearchParams(params);
      nextParams.delete("buy");
      nextParams.delete("tier");
      setParams(nextParams, { replace: true });
    }
  }, [params, liveInternships, setParams]);

  // Paid programs only. Anything priced at ₹0 on every plan is a free opportunity, which belongs on Careers.
  const programs = liveInternships.filter((item) => !isFreeProgram(item));

  // Search engines: the programs on this page as an ItemList pointing at each
  // one's own page (only live entries have a slug/page to point at).
  const listed = programs.filter((p) => p.slug && p.title);
  useJsonLd("programs-jsonld", listed.length ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Crix Technology Training + Internship programs",
    itemListElement: listed.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: canonicalUrl(`/programs/${p.slug}`), name: p.title })),
  } : null);

  return (
    <>
      <PageHead eyebrow="Training + Internship" title="Get trained. Perform. Earn a stipend."
        text="Fully virtual — join from anywhere in India. Every student first goes through paid, mentored training on real projects (training is paid, not free); the top performers are then selected for a stipend-based internship with an offer letter and a Letter of Recommendation." />
      <SectionIndex items={TRAINING_INDEX} />

      <section id="how-it-works" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">How It Works</Reveal>
          <Reveal as="h2" variant="reveal-l">Train first. Then intern — and get paid.</Reveal>
          <div className="process stagger">
            {process.map((p, i) => (
              <Reveal key={p.n} variant="reveal" className="step" style={{ "--i": i }}>
                <span className="step-num">{p.n}</span>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
              </Reveal>
            ))}
          </div>
          <div className="stage-grid stagger">
            {trainingStages.map((s, i) => (
              <Reveal key={s.title} variant="reveal" className={`card stage-card${i ? " stage-card--earn" : ""}`} style={{ "--i": i }}>
                <span className="tag">{s.tag}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
                <ul>{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* The old #internships / #courses anchors still land on the tracks. */}
      <span id="internships" className="anchor-section" aria-hidden="true" />
      <span id="courses" className="anchor-section" aria-hidden="true" />
      <section id="programs" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Training Tracks</Reveal>
          <Reveal as="h2" variant="reveal-l">Choose your track. Build real things.</Reveal>
          <Reveal as="p" variant="reveal-l" className="section-lede">
            Training is paid, not free — each track shows its training fee. Your fee covers the training only; the stipend-based internship that follows is
            offered on performance. Looking for a free one? See <Link to="/free-internships">Free Internships</Link>.
          </Reveal>
          <Reveal variant="reveal-l"><TrainingContact /></Reveal>
          <div className="grid3 stagger" style={{ marginTop: 24 }}>
            {/* One card per domain: tracks the admin put in the same group are
                its durations, picked with the switch on the card. */}
            {loading ? <SkeletonCards count={3} /> : groupVariants(programs).map((g, i) => (
              <ProgramGroupCard key={g.key} variants={g.variants} i={i} isProgram kind="internship" ownedOf={hasAccess}
                onInquire={setInquireItem} onDetail={setDetailData} />
            ))}
          </div>
        </div>
      </section>
      <InquiryModal item={inquireItem} kind="internship" onClose={() => setInquireItem(null)} />
      <DetailModal data={detailData} onClose={() => setDetailData(null)} onInquire={setInquireItem} />

      <section id="selection" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-r" className="eyebrow">Selection</Reveal>
          <Reveal as="h2" variant="reveal-r">How we pick our stipend interns.</Reveal>
          <Reveal as="p" variant="reveal-r" className="section-lede">
            Throughout the training, your mentor tracks how you do. At the end of each batch, the strongest performers are
            offered the stipend-based internship.
          </Reveal>
          <div className="grid4 bento stagger">
            {selectionCriteria.map((c, i) => (
              <Reveal key={c.title} variant="reveal" className="benefit" style={{ "--i": i }}>
                <span className="benefit-icon"><BenefitIcon name={["tasks", "briefcase", "mentor", "star"][i % 4]} /></span>
                <h3>{c.title}</h3>
                <p>{c.desc}</p>
              </Reveal>
            ))}
          </div>
          <Reveal as="p" variant="reveal-r" className="form-note">
            Selection is merit-based and not guaranteed with enrollment. The stipend amount, internship duration and number of
            places are set for each batch and shared in the offer letter. See our <Link to="/terms-of-service">Terms of Service</Link>.
          </Reveal>
        </div>
      </section>

      <section id="benefits" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-top" className="eyebrow">What You Get</Reveal>
          <Reveal as="h2" variant="reveal-top">Benefits of joining Crix.</Reveal>
          <div className="grid4 bento stagger">
            {benefits.map((b, i) => (
              <Reveal key={b.title} variant="reveal" className="benefit" style={{ "--i": i }}>
                <span className="benefit-icon"><BenefitIcon name={b.icon} /></span>
                <h3>{b.title}</h3>
                <p>{b.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}

/* ================= COURSE DETAIL ================= */
export function CourseDetail() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [course, setCourse] = useState(undefined); // undefined = loading, null = not found
  const [buyItem, setBuyItem] = useState(null);
  const [buyTier, setBuyTier] = useState(null); // the plan BuyModal opens on
  const [inquireOpen, setInquireOpen] = useState(false);
  const [upgrade, setUpgrade] = useState(null); // { item, tier } | null — the plan-upgrade dialog
  // The other durations of this track's domain (same Admin group), shortest first.
  const [siblings, setSiblings] = useState([]);
  const { ownedTier, hasAccess, reload: reloadPlans } = useMyPlans();
  const { isLoggedIn, isAdmin, user, openAuthModal } = useContext(UserContext);
  useNoIndex(course === null); // a course that doesn't exist is a "not found" screen: keep it out of search results
  useCourseJsonLd(course); // schema.org "Course" markup while a real course is showing

  const handleBuy = (tier) => {
    const open = () => { setBuyItem(course); setBuyTier(tier || null); };
    if (!isLoggedIn) { openAuthModal("login", open); return; }
    open();
  };

  usePageMeta({
    title: course ? `${course.title} | Crix Technology` : "Programs | Crix Technology",
    description: course ? course.desc : undefined,
    crumbs: course ? [{ name: "Home", path: "/" }, { name: "Training + Internship", path: "/training-internship" }, { name: course.title, path: `/programs/${slug}` }] : null,
    keywords: course ? programKeywords(course) : null,
  });

  useEffect(() => {
    let alive = true;
    setCourse(undefined);
    // Live data first; if the API has no such course (or isn't reachable),
    // the static list the cards fall back to supplies the page instead, so a
    // card that opened this route never lands on "not found".
    getCourse(slug).then((res) => {
      if (!alive) return;
      setCourse(res.ok ? res.course : fallbackPrograms.find((p) => p.slug === slug) || null);
    });
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    let alive = true;
    setSiblings([]);
    if (!course || !String(course.group || "").trim()) return undefined;
    getCourses(course.type).then((res) => {
      if (alive && res.ok) setSiblings(siblingsOf(course, (res.courses || []).filter((c) => !isFreeProgram(c))));
    });
    return () => { alive = false; };
  }, [course]);

  // Came back from /profile via ?buy=<slug> — resume the purchase (for a
  // Training + Internship track, which isn't bought online, open its form).
  useEffect(() => {
    if (course && params.get("buy")) {
      if (course.type === "internship") setInquireOpen(true);
      else { setBuyItem(course); setBuyTier(tierFromParams(params)); }
      const nextParams = new URLSearchParams(params);
      nextParams.delete("buy");
      nextParams.delete("tier");
      setParams(nextParams, { replace: true });
    }
  }, [course, params, setParams]);

  if (course === undefined) {
    return (
      <section className="section" style={{ paddingTop: 140 }}>
        <div className="wrap"><p style={{ color: "var(--muted)" }}>Loading...</p></div>
      </section>
    );
  }

  if (course === null) {
    return (
      <section className="section" style={{ paddingTop: 140 }}>
        <div className="wrap">
          <span className="eyebrow">Not found</span>
          <h2 style={{ margin: "14px 0 16px" }}>We couldn't find that training track.</h2>
          <p style={{ color: "var(--muted)", marginBottom: 24 }}>It may have been removed or renamed.</p>
          <Link className="btn btn-solid" to="/training-internship">← Back to Training + Internship</Link>
        </div>
      </section>
    );
  }

  const plans = offeredTiers(course);
  // Training + Internship: no online checkout — apply or call, and the team sends a payment request.
  const byInquiry = course.type === "internship";
  // Admin's Open/Closed switch: a closed track takes no applications.
  const closed = course.status === "closed";
  const openForBuy = !byInquiry && isOpenForBuy(course);

  return (
    <>
      <section className="section" style={{ paddingTop: 140 }}>
        <div className="wrap" style={{ maxWidth: openForBuy && plans.length > 1 ? 940 : 720 }}>
          <Reveal as={Link} variant="reveal" to="/training-internship#programs" className="back-link">← All training tracks</Reveal>
          <Reveal variant="reveal" className={course.type ? `card-type-${course.type}` : undefined}>
            <div className="card-top" style={{ marginTop: 24 }}>
              <div className="card-top-left">
                {course.type && (
                  <span className={`type-pill type-pill--${course.type}`}>
                    {course.type === "internship" ? "Training + Internship" : "Course"}
                  </span>
                )}
                {!closed && <span className={`tag${isFull(course) ? " tag--full" : ""}`}>{positionsTag(course.positions, "Open")}</span>}
              </div>
              {closed ? <span className="closed-badge">Currently closed</span> : <span className="fee-pill">Paid training</span>}
            </div>
            <h1 style={{ fontFamily: "'Unbounded',sans-serif", fontSize: "clamp(1.8rem,4vw,2.6rem)", lineHeight: 1.15, margin: "14px 0 16px" }}>
              {course.title}
            </h1>
            <DurationSwitch variants={siblings} active={siblings.findIndex((v) => v.slug === course.slug)}
              hrefOf={(v) => `/programs/${v.slug}`} label="Other durations of this track" />
            <p style={{ color: "var(--muted)", fontSize: "1.02rem", lineHeight: 1.7, maxWidth: "65ch" }}>{course.desc}</p>

            <CourseFacts course={course} />

            {programDeliverables[course.type]?.length ? (
              <div className="deliverable-row" style={{ marginTop: 20 }}>
                {programDeliverables[course.type].map((d) => <span key={d} className="deliverable-chip">{d}</span>)}
              </div>
            ) : null}

            <CourseLists course={course} />

            {/* The block the phone's sticky Enroll bar watches: while this is on screen, the bar steps aside. */}
            <div id="course-cta" style={{ marginTop: 8 }}>
            {!isAdmin && hasAccess(course) && (
              <p className="form-note owned-note">
                You're enrolled in this {course.type === "internship" ? "internship" : "course"}.{" "}
                <Link to="/dashboard">View it in My Dashboard →</Link>
              </p>
            )}
            {isAdmin ? (
              // Admins see every course and internship without buying or
              // applying — straight to the content (backend: isAdminUser).
              <div style={{ maxWidth: 280, marginTop: 24 }}>
                <Link className="btn btn-solid buy-btn" to={`/learn/${course.slug}`}>
                  {course.type === "internship" ? "Open internship" : "Open course"} →
                </Link>
                <span style={{ display: "block", marginTop: 8, color: "var(--muted)", fontSize: ".82rem" }}>Admin access — no payment needed</span>
              </div>
            ) : byInquiry ? (
              <>
                {plans.length > 0 && !closed && (
                  <div className="plans-block" id="plans">
                    <h4 className="plans-heading" aria-level={2}>{ownedTier(course) ? "Your plan" : plans.length > 1 ? "Training fee by plan" : "Training fee"}</h4>
                    <PlanCards plans={plans} ownedTier={ownedTier(course)} readOnly />
                  </div>
                )}
                {closed && !hasAccess(course) ? (
                  // Closed in Admin: no applications until it reopens.
                  <div style={{ maxWidth: 420, marginTop: 24 }}>
                    <p className="form-note" style={{ marginTop: 0 }}>This track isn't taking applications right now. Check back soon, or see the other tracks below.</p>
                    <button className="btn btn-solid buy-btn" disabled>Applications closed</button>
                  </div>
                ) : null}
                {isFull(course) && !closed && !hasAccess(course) && (
                  <p className="form-note">
                    All {course.positions.total} {placeWord(course)}{course.positions.total === 1 ? " is" : "s are"} filled right now —
                    apply anyway and we'll tell you when the next batch opens.
                  </p>
                )}
                {!hasAccess(course) && !closed && <TrainingContact onApply={() => setInquireOpen(true)} />}
              </>
            ) : openForBuy && isFull(course) && !ownedTier(course) && !hasAccess(course) ? (
              // Every place is taken: nothing to buy, but they can ask about the next batch.
              <div style={{ maxWidth: 420, marginTop: 24 }}>
                <p className="form-note" style={{ marginTop: 0 }}>
                  All {course.positions.total} {placeWord(course)}{course.positions.total === 1 ? " is" : "s are"} filled right now.
                  Send a request and we'll tell you when the next batch opens.
                </p>
                <button className="btn btn-solid buy-btn" onClick={() => setInquireOpen(true)}>
                  {course.type === "internship" ? "Request to apply" : "Request to enroll"}
                </button>
              </div>
            ) : openForBuy ? (
              <div className="plans-block" id="plans">
                <h4 className="plans-heading" aria-level={2}>{ownedTier(course) ? "Your plan" : plans.length > 1 ? "Choose a plan" : "Enroll"}</h4>
                <PlanCards plans={plans} onChoose={handleBuy} ownedTier={ownedTier(course)} onUpgrade={(tier) => setUpgrade({ item: course, tier })} />
              </div>
            ) : (
              <div style={{ maxWidth: 280, marginTop: 24 }}>
                {course.type === "internship" ? (
                  <button className="btn btn-solid buy-btn" onClick={() => setInquireOpen(true)} title="Request to apply for this internship — no account needed">
                    Request to apply
                  </button>
                ) : (
                  <button className="btn btn-solid buy-btn" onClick={() => setInquireOpen(true)} title="Request to enroll in this course — no account needed">
                    Request to enroll
                  </button>
                )}
              </div>
            )}
            </div>

            <CourseFaq faqs={course.faqs} />
            <RelatedPrograms course={course} />
          </Reveal>
        </div>
      </section>
      {!isAdmin && <EnrollBar course={course} onInquire={() => setInquireOpen(true)} />}
      <BuyModal item={buyItem} initialTier={buyTier} user={user} onClose={() => setBuyItem(null)} />
      <UpgradeModal data={upgrade} onClose={() => setUpgrade(null)} onDone={reloadPlans} />
      <InquiryModal item={inquireOpen ? course : null} kind={course.type} onClose={() => setInquireOpen(false)} />
    </>
  );
}

/* ================= NOT FOUND ================= */
// Shown for any address the site doesn't have (App.jsx's catch-all route).
export function NotFound() {
  usePageMeta({ title: "Page not found | Crix Technology", description: "The page you were looking for doesn't exist on Crix Technology." });
  useNoIndex(true);
  return (
    <section className="section notfound" style={{ paddingTop: 140, minHeight: "60vh" }}>
      <div className="wrap" style={{ maxWidth: 640 }}>
        <div className="notfound-logo"><Link to="/" aria-label="Crix Technology — home"><Logo /></Link></div>
        <div className="notfound-code" aria-hidden="true" data-text="404">404</div>
        <span className="eyebrow">Error 404</span>
        <h1 className="title-lg" style={{ margin: "14px 0 16px" }}>We can't find that page.</h1>
        <p style={{ color: "var(--muted)", marginBottom: 28, lineHeight: 1.7 }}>
          The link may be old or mistyped, but Crix Technology is still here to help. Here's where to go next:
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <Link className="btn btn-solid" to="/">Go to the home page</Link>
          <Link className="btn btn-ghost" to="/training-internship">Training + Internship</Link>
          <Link className="btn btn-ghost" to="/contact">Contact us</Link>
        </div>
      </div>
    </section>
  );
}

/* ================= SERVICES ================= */
export function Services() {
  usePageMeta(routeMeta("/services"));
  // Admin-managed now (AdminServices.jsx, /api/services) — the static
  // `services` array from content.js stays only as the fallback for when
  // the backend isn't configured or the DB has nothing seeded yet.
  const [liveServices, setLiveServices] = useState(services);
  // Search engines: each service offered, provided by the Organization
  // described in public/index.html.
  useJsonLd("services-jsonld", {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "IT services by Crix Technology",
    itemListElement: liveServices.filter((s) => s.title).map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Service",
        name: s.title,
        ...(s.desc ? { description: s.desc } : {}),
        serviceType: s.title,
        areaServed: "IN",
        provider: { "@id": `${SITE_URL}/#organization` },
      },
    })),
  });
  const [loadingServices, setLoadingServices] = useState(hasBackend);
  const [detailData, setDetailData] = useState(null);
  const [serviceInquiryItem, setServiceInquiryItem] = useState(null);
  useEffect(() => {
    let alive = true;
    const cap = setTimeout(() => setLoadingServices(false), LOADING_CAP_MS);
    getServices().then((res) => {
      if (!alive) return;
      if (res.ok && res.services && res.services.length) setLiveServices(res.services);
      setLoadingServices(false);
    });
    return () => { alive = false; clearTimeout(cap); };
  }, []);
  return (
    <>
      <PageHead eyebrow="IT Services" title="Technology for growing businesses."
        text="Websites, web apps, AI assistants and automation — delivered virtual-first to clients pan-India and globally, by the same team that trains India's next engineers." />
      <section className="section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <h2 className="sr-only">Our services</h2>
          <div className="grid3 stagger" style={{ marginTop: 0 }}>
            {loadingServices ? <SkeletonCards count={services.length} /> : liveServices.map((it, i) => (
              <InfoCard key={it.title} item={it} i={i} onDetail={setDetailData} onServiceInquire={setServiceInquiryItem} />
            ))}
          </div>
        </div>
      </section>
      <DetailModal data={detailData} onClose={() => setDetailData(null)} onServiceInquire={setServiceInquiryItem} />
      <ServiceInquiryModal item={serviceInquiryItem} onClose={() => setServiceInquiryItem(null)} />

      <section className="section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Our Process</Reveal>
          <Reveal as="h2" variant="reveal-l">How we work.</Reveal>
          <div className="process stagger">
            {clientProcess.map((p, i) => (
              <Reveal key={p.n} variant="reveal" className="step" style={{ "--i": i }}>
                <span className="step-num">{p.n}</span>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-r" className="eyebrow">Areas of Expertise</Reveal>
          <Reveal as="h2" variant="reveal-r">Where we add the most value.</Reveal>
          <div className="grid4 stagger">
            {expertise.map((e, i) => (
              <Reveal key={e.title} variant="reveal" className="benefit" style={{ "--i": i }}>
                <h3>{e.title}</h3>
                <p>{e.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">How You Can Work With Us</Reveal>
          <Reveal as="h2" variant="reveal-l">Engagement models.</Reveal>
          <div className="grid3 stagger">
            {engagementModels.map((m, i) => (
              <Reveal key={m.title} variant="reveal" className="benefit" style={{ "--i": i }}>
                <h3>{m.title}</h3>
                <p>{m.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title="Have a project in mind?" text="Tell us what you're building — we'll reply within two working days." btn="Get a quote" />
    </>
  );
}

/* ================= ABOUT ================= */
export function About() {
  usePageMeta(routeMeta("/about"));
  return (
    <>
      <PageHead eyebrow="About Crix" title={about.heading} text={about.body} />
      <SectionIndex items={ABOUT_INDEX} />

      <section id="overview" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap" style={{ maxWidth: 820 }}>
          <Reveal as="span" variant="reveal-top" className="eyebrow">Who We Are</Reveal>
          <Reveal as="h2" variant="reveal-top">Overview of the company.</Reveal>
          <Reveal variant="reveal" style={{ color: "var(--muted)", lineHeight: 1.85, marginBottom: 18 }}>
            {about.overview}
          </Reveal>
          <Reveal variant="reveal" style={{ color: "var(--muted)", lineHeight: 1.85 }}>
            {about.history}
          </Reveal>
        </div>
      </section>

      <section id="company-info" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap" style={{ maxWidth: 820 }}>
          <Reveal as="span" variant="reveal-l" className="eyebrow">Company Information</Reveal>
          <Reveal as="h2" variant="reveal-l">Legal &amp; registration details.</Reveal>
          <dl className="company-info">
            {[
              ["Legal name", company.legalName],
              ["Entity type", company.entityType],
              ["Registering authority", company.authority],
              ["Incorporated", company.incorporated],
              ["CIN", company.cin],
              ["Udyam (MSME) registration", company.udyam],
              ["Registered office", company.registeredOffice],
              ["Jurisdiction", company.jurisdiction],
            ].filter(([, v]) => v).map(([k, v], i) => {
              const isId = /CIN|Udyam/.test(k);
              const copyable = isId || k === "Registered office";
              return (
                <Reveal key={k} variant="reveal" className="ci-row" style={{ "--i": i }}>
                  <dt>{k}</dt>
                  <dd className={isId ? "mono" : undefined}>
                    {/* Registration numbers type themselves out as they reveal. */}
                    <span data-typewriter={isId ? "" : undefined}>{v}</span>
                    {copyable && <CopyButton value={v} label={k} />}
                  </dd>
                </Reveal>
              );
            })}
          </dl>
          {company.note && (
            <Reveal variant="reveal" className="form-note" style={{ marginTop: 16 }}>{company.note}</Reveal>
          )}
        </div>
      </section>

      <section id="why-crix" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal variant="reveal-zoom" className="band">
            <div>
              <span className="eyebrow">Why Crix</span>
              <h2>Three pillars. One team.</h2>
              <p>IT services and our Training + Internship program — everything we teach comes from what we build for real clients, and everything we build sharpens what we teach.</p>
            </div>
            <div className="facts">
              {about.facts.map((f) => (
                <div className="fact" key={f.title}><b>{f.title}</b><span>{f.desc}</span></div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section id="partner" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-r" className="eyebrow">Why Partner With Us</Reveal>
          <Reveal as="h2" variant="reveal-r">What sets our client work apart.</Reveal>
          <div className="grid4 stagger">
            {whyCrix.map((w, i) => (
              <Reveal key={w.title} variant="reveal" className="benefit" style={{ "--i": i }}>
                <h3>{w.title}</h3>
                <p>{w.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="tech-stack" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">What We Build With</Reveal>
          <Reveal as="h2" variant="reveal-l">Technologies we work with.</Reveal>
          <div className="tech-stack stagger">
            {techStack.map((t, i) => (
              <Reveal key={t.group} variant="reveal" className="tech-row" style={{ "--i": i }}>
                <h4 aria-level={3}>{t.group}</h4>
                <div className="tech-tags">
                  {t.items.map((it) => <span key={it}>{it}</span>)}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

/* ================= CONTACT ================= */
export function Contact() {
  usePageMeta(routeMeta("/contact"));
  const { user } = useContext(UserContext);
  // A logged-in visitor starts with their saved name, email and phone.
  const startForm = () => ({
    name: user && !user.profilePending ? user.name || "" : "",
    email: (user && user.email) || "",
    phone: (user && user.phone) || "",
    interest: "Training + Internship",
    message: "",
  });
  const [form, setForm] = useState(startForm);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState(""); // "error" | "success" | "info"

  const [sending, setSending] = useState(false);
  const emailCheck = useEmailCheck(form.email);
  const fields = useTouched();

  // Every field's error, live — shown under each field once it's been left
  // or a submit was tried (hooks/useTouched.js). Keyed by input id.
  const errors = {
    "c-name": nameError(form.name),
    "c-email": emailError(form.email),
    "c-phone": phoneFieldError(form.phone, { required: false }),
    "c-message": form.message.trim() ? "" : "Write a short message.",
  };
  const invalid = (id) => (fields.show(id) && !!errors[id]) || undefined;
  const emailProblem = emailFieldProblem(errors["c-email"], emailCheck, fields.show("c-email"));

  const onSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (sending) return; // already in flight — ignore a repeat click/Enter
    const formEl = e && e.currentTarget; // captured now: React clears currentTarget after the await below
    const phone = form.phone.trim();
    fields.markSubmitted();
    if (Object.values(errors).some(Boolean)) {
      setKind("error");
      setStatus("Please fix the highlighted fields.");
      focusFirstError(errors, Object.keys(errors));
      return;
    }
    setKind("info");
    setStatus("Sending...");
    setSending(true);
    // The live domain check may still be waiting out its typing pause.
    const domain = await emailCheck.verify();
    if (domain && !domain.valid) {
      setSending(false);
      setKind("error");
      setStatus(domain.error);
      focusFirstError({ "c-email": true }, ["c-email"]);
      return;
    }
    const res = await submitContact({
      name: form.name, email: form.email, interest: form.interest, message: form.message,
      phone,
    });
    setSending(false);
    setKind(res.ok ? "success" : "error");
    setStatus(res.ok ? "Message sent. We'll reply within two working days." : res.error);
    if (res.ok) burstConfetti(formEl && formEl.querySelector ? formEl.querySelector("button[type=submit]") : null);
    // Clear what was sent (the "interested in" choice back to its default too; a
    // logged-in visitor keeps their own details), so pressing the button again
    // can't quietly post the same message twice.
    if (res.ok) { setForm(startForm()); fields.reset(); }
  };

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setStatus(""); setKind("");
  };
  const setPhone = (phone) => {
    setForm((f) => ({ ...f, phone }));
    setStatus(""); setKind("");
  };

  return (
    <>
      <PageHead eyebrow="Contact" title="Ready to build with us?"
        text="Students: tell us your college, semester and track. Businesses: tell us about your project. We reply within two working days." />
      <section className="section" style={{ paddingTop: 20 }}>
        <div className="wrap contact-grid">
          <Reveal as="form" variant="reveal-l" onSubmit={onSubmit} noValidate>
            <div className="field"><label htmlFor="c-name">Your name</label>
              <input id="c-name" name="name" autoComplete="name" value={form.name} onChange={set("name")} placeholder="Full name"
                onBlur={fields.touch("c-name")} aria-invalid={invalid("c-name")} aria-describedby="c-name-err" />
              <FieldError id="c-name-err">{invalid("c-name") && errors["c-name"]}</FieldError></div>
            <div className="field"><label htmlFor="c-email">Email</label>
              <input id="c-email" name="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@example.com"
                onBlur={fields.touch("c-email")} aria-invalid={!!emailProblem || undefined} aria-describedby="c-email-err" />
              <EmailFieldNote id="c-email-err" localError={errors["c-email"]} check={emailCheck} show={fields.show("c-email")}
                onUseSuggestion={(email) => setForm((f) => ({ ...f, email }))} /></div>
            <div className="field"><label htmlFor="c-phone">Phone (optional)</label>
              <PhoneInput id="c-phone" name="phone" value={form.phone} onChange={setPhone} onBlur={fields.touch("c-phone")}
                invalid={!!invalid("c-phone")} describedBy="c-phone-err" />
              <FieldError id="c-phone-err">{invalid("c-phone") && errors["c-phone"]}</FieldError></div>
            <div className="field"><label htmlFor="c-interest">I'm interested in</label>
              <select id="c-interest" name="interest" value={form.interest} onChange={set("interest")}>
                <option>Training + Internship</option><option>Free Internship</option><option>IT Services</option><option>Other</option>
              </select></div>
            <div className="field"><label htmlFor="c-message">Message</label>
              <textarea id="c-message" name="message" rows="4" value={form.message} onChange={set("message")} placeholder="College & semester, or your project details..."
                onBlur={fields.touch("c-message")} aria-invalid={invalid("c-message")} aria-describedby="c-message-err" />
              <FieldError id="c-message-err">{invalid("c-message") && errors["c-message"]}</FieldError></div>
            <button className="btn btn-solid" type="submit" disabled={sending}>{sending ? "Sending…" : "Send message"}</button>
            <Alert kind={kind || "info"}>{status}</Alert>
          </Reveal>
          <Reveal variant="reveal-r">
            <div className="info-row"><span className="ic">✉</span><div><span className="info-label">Email</span>
              <div className="contact-line"><a href={`mailto:${site.email}`}>{site.email}</a><CopyButton value={site.email} label="email address" /></div></div></div>
            <div className="info-row"><span className="ic">✆</span><div><span className="info-label">Phone — two separate teams</span>
              {site.phoneAlt && (
                <div className="dept-block dept--programs">
                  <span className="dept-tag">{site.phoneAltLabel}</span>
                  <span className="dept-hint">{site.phoneAltHint}</span>
                  <div className="contact-line"><a href={`tel:${site.phoneAlt.replace(/\s/g, "")}`}>{site.phoneAlt}</a>
                    <CopyButton value={site.phoneAlt} label="Training + Internship phone number" />
                    <a className="wa-pill" href={`https://wa.me/${site.whatsappAlt || site.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
                </div>
              )}
              <div className="dept-block dept--it">
                <span className="dept-tag">{site.phoneLabel}</span>
                <span className="dept-hint">{site.phoneHint}</span>
                <div className="contact-line"><a href={`tel:${site.phone.replace(/\s/g, "")}`}>{site.phone}</a>
                  <CopyButton value={site.phone} label="IT services phone number" />
                  <a className="wa-pill" href={`https://wa.me/${site.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
              </div>
            </div></div>
            {site.hours && <div className="info-row"><span className="ic">◔</span><div><span className="info-label">Working hours</span>{site.hours}</div></div>}
            <div className="info-row"><span className="ic">◎</span><div><span className="info-label">Location</span>{site.city}</div></div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/* ================= shared page pieces ================= */
// Credentials strip under the home hero — only facts already published on
// the About page's company information (content.js `company`).
const TRUST_ICONS = {
  shield: <path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6z M9 12l2 2 4-4" />,
  badge: <path d="M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M9 12.5 8 21l4-2 4 2-1-8.5" />,
  pin: <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z M12 8.5a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z" />,
  globe: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />,
};
function TrustStrip() {
  const items = [
    { icon: "shield", label: "Registered Pvt. Ltd. company", sub: `CIN ${company.cin}` },
    { icon: "badge", label: "MSME (Udyam) registered", sub: company.udyam },
    { icon: "pin", label: "Headquartered in Ahmedabad", sub: "Gujarat, India" },
    { icon: "globe", label: "Serving pan-India & globally", sub: "Virtual-first delivery" },
  ];
  return (
    <section className="trust-strip" aria-label="Company credentials">
      <div className="wrap trust-in">
        {items.map((t, i) => (
          <Reveal key={t.label} variant="reveal" className="trust-item" style={{ "--i": i }}>
            <span className="trust-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{TRUST_ICONS[t.icon]}</svg>
            </span>
            <span><b>{t.label}</b><small>{t.sub}</small></span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
function PageHead({ eyebrow, title, text }) {
  return (
    <header className="page-head" style={{ position: "relative", overflow: "hidden" }}>
      <Aurora />
      <Reveal variant="reveal-top" style={{ position: "relative", zIndex: 2 }} className="wrap">
        <span className="eyebrow">{eyebrow}</span>
        <h1 style={{ fontSize: "clamp(1.6rem,4vw + .6rem,3rem)", margin: "14px 0 18px" }}>{title}</h1>
        <p>{text}</p>
      </Reveal>
    </header>
  );
}

function CtaBand({ title = "Ready to build your first AI-powered product?",
  text = "Applications for the next cohort are open — we reply within two working days.",
  btn = "Apply now" }) {
  return (
    <section className="section" style={{ paddingTop: 40 }}>
      <div className="wrap">
        <Reveal variant="reveal-zoom" className="band">
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
          <div>
            <Link className="btn btn-solid" to="/contact">{btn}</Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ================= LEGAL (Privacy Policy / Terms of Service) ================= */
function LegalPage({ eyebrow, title, doc, path }) {
  usePageMeta(routeMeta(path));
  return (
    <>
      <PageHead eyebrow={eyebrow} title={title} text={legal.updated} />
      {/* Legal copy is text-heavy — skip the scroll-reveal animation and the
          section's top/bottom mask fade so every line stays fully legible. */}
      <section className="section section--plain" style={{ paddingTop: 44 }}>
        <div className="wrap" style={{ maxWidth: 780 }}>
          {/* The whole document as a PDF, to keep or print. */}
          <div className="legal-actions">
            <DownloadPdfButton label={`Download ${title} (PDF)`}
              getDocument={() => ({ title, subtitle: legal.updated, intro: doc.intro, sections: doc.sections })} />
          </div>
          <p style={{
            color: "var(--text)", lineHeight: 1.8, marginBottom: 40, padding: "18px 22px",
            background: "rgba(var(--teal-rgb),.08)", borderLeft: "3px solid var(--teal)", borderRadius: 12,
          }}>{doc.intro}</p>
          {doc.sections.map((s) => (
            <div key={s.title} id={s.id} style={{ marginBottom: 32, scrollMarginTop: 96 }}>
              <h3 aria-level={2} style={{ fontSize: "1.1rem", margin: "0 0 10px" }}>{s.title}</h3>
              <p style={{ color: "var(--muted)", lineHeight: 1.85, whiteSpace: "pre-line" }}>{s.content}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function PrivacyPolicy() {
  return <LegalPage eyebrow="Legal" title="Privacy Policy" doc={legal.privacy} path="/privacy-policy" />;
}

export function TermsOfService() {
  return <LegalPage eyebrow="Legal" title="Terms of Service" doc={legal.terms} path="/terms-of-service" />;
}

export function ClientTerms() {
  return <LegalPage eyebrow="Legal" title="Client Services Terms" doc={legal.clientTerms} path="/client-terms" />;
}
