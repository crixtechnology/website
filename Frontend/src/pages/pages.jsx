import { useContext, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  Reveal, InfoCard, BenefitIcon, Logo, BuyModal, InquiryModal, DetailModal, ServiceInquiryModal, UpgradeModal, PlanCards, Alert, Marquee, RotatingWord, Counter, Hero3D, Aurora, LiveDevice, SkeletonCards, SectionIndex, CopyButton, burstConfetti, REDUCED,
} from "../components/ui.jsx";
import {
  site, hero, internships, services, courses, process, benefits, stats, about, legal,
  techStack, clientProcess, engagementModels, expertise, whyCrix, company, programDeliverables, fallbackPrograms,
} from "../data/content.js";
import { submitContact, getCourses, getCourse, getServices, hasBackend } from "../services/api.js";

// Skeleton cards show while live lists load from the backend — but never for
// longer than this; after it the static fallback list shows instead.
const LOADING_CAP_MS = 4000;

// "On this page" dot rail (SectionIndex) entries for the two long pages.
const PROGRAMS_INDEX = [
  { id: "internships", label: "Internships" },
  { id: "courses", label: "Courses" },
  { id: "how-it-works", label: "How it works" },
  { id: "benefits", label: "Benefits" },
];
const ABOUT_INDEX = [
  { id: "overview", label: "Overview" },
  { id: "company-info", label: "Company info" },
  { id: "why-crix", label: "Why Crix" },
  { id: "partner", label: "Why partner with us" },
  { id: "tech-stack", label: "Technologies" },
];
import { UserContext } from "../context/UserContext.jsx";
import { usePageMeta } from "../hooks/usePageMeta.js";
import { useMyPlans } from "../hooks/useMyPlans.js";
import { useNoIndex } from "../hooks/useNoIndex.js";
import { isValidName, emailFormatError } from "../utils/validators.js";
import { phoneError } from "../utils/phone.js";
import PhoneInput from "../components/PhoneInput.jsx";
import { CourseFacts, CourseLists, CourseFaq, RelatedPrograms, EnrollBar, useCourseJsonLd } from "../components/CourseSections.jsx";
import { offeredTiers, isOpenForBuy, TIER_ORDER } from "../utils/tiers.js";

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
  const [liveInternships, setLiveInternships] = useState(internships);
  const [loadingInternships, setLoadingInternships] = useState(hasBackend);
  const [inquireItem, setInquireItem] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [serviceInquiryItem, setServiceInquiryItem] = useState(null);
  usePageMeta({
    title: "Crix Technology | Virtual Internships, IT Services & Online Courses — Ahmedabad",
    description: "Crix Technology — India's platform for virtual internships, cutting-edge IT services, and industry-ready online courses. Structured, hands-on programs in MERN stack and AI Agentic Systems. Based in Ahmedabad, serving all of India.",
  });
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
          <h1 className="hl" aria-label={`${hero.titleParts.join(" ")} ${hero.rotatingWords[0]} ${hero.titleEnd.join(" ")}`}>
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
            <Link className="btn btn-solid" to="/programs#internships">Explore internships</Link>
            <Link className="btn btn-ghost" to="/services">Our IT services</Link>
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

      <section className="section section--internships">
        <div className="orb orb-1"></div>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Internships</Reveal>
          <Reveal as="h2" variant="reveal-l">Real projects. Real experience. Real pay.</Reveal>
          <div className="grid3 stagger">
            {loadingInternships ? <SkeletonCards count={internships.length} /> : liveInternships.map((it, i) => (
              <InfoCard key={it.title || it._id} item={it} i={i} isProgram kind="internship" onInquire={setInquireItem} onDetail={setDetailData} />
            ))}
          </div>
          <div className="hero-ctas">
            <Link className="btn btn-ghost" to="/programs#internships">View internship details →</Link>
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

      <section className="section" style={{ paddingTop: 70 }}>
        <div className="orb orb-2"></div>
        <div className="wrap">
          <Reveal as="span" variant="reveal-r" className="eyebrow">IT Services</Reveal>
          <Reveal as="h2" variant="reveal-r">We don't just teach it. We build it.</Reveal>
          <div className="grid3 stagger">
            {services.slice(0, 3).map((it, i) => (
              <InfoCard key={it.title} item={it} i={i} onDetail={setDetailData} onServiceInquire={setServiceInquiryItem} />
            ))}
          </div>
          <div className="hero-ctas">
            <Link className="btn btn-ghost" to="/services">All services →</Link>
            <Link className="btn btn-ghost" to="/programs#courses">Browse courses →</Link>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

/* ================= PROGRAMS (Internships + Courses, one page) ================= */
export function Programs() {
  // Both come live from the backend, admin-managed, once it's connected
  // (REACT_APP_API_URL) — falls back to the static lists in content.js
  // until then, so the page never shows empty before the admin panel has
  // anything in it.
  const [liveInternships, setLiveInternships] = useState(internships);
  const [liveCourses, setLiveCourses] = useState(courses);
  const [loadingInternships, setLoadingInternships] = useState(hasBackend);
  const [loadingCourses, setLoadingCourses] = useState(hasBackend);
  const [buyItem, setBuyItem] = useState(null);
  const [buyTier, setBuyTier] = useState(null); // the plan BuyModal opens on, if one was already clicked
  const [inquire, setInquire] = useState(null); // { item, kind } | null
  const [detailData, setDetailData] = useState(null); // { item, kind, isProgram } | null
  const [params, setParams] = useSearchParams();
  const { user } = useContext(UserContext);
  usePageMeta({
    title: "Internships & Courses | Crix Technology",
    description: "Explore paid virtual internships and industry-ready online courses in MERN stack, AI Agentic Systems, Android development and more — delivered virtually, pan-India and globally.",
  });

  useEffect(() => {
    let alive = true;
    const cap = setTimeout(() => { setLoadingInternships(false); setLoadingCourses(false); }, LOADING_CAP_MS);
    getCourses("internship").then((res) => {
      if (!alive) return;
      if (res.ok && res.courses && res.courses.length) setLiveInternships(res.courses);
      setLoadingInternships(false);
    });
    getCourses("course").then((res) => {
      if (!alive) return;
      if (res.ok && res.courses && res.courses.length) setLiveCourses(res.courses);
      setLoadingCourses(false);
    });
    return () => { alive = false; clearTimeout(cap); };
  }, []);

  // Landed here as ?buy=<slug> — the user just finished their profile and is
  // being brought back to the purchase they started. Re-open the buy modal
  // for that item, then drop the param so a refresh doesn't reopen it.
  // Internships can be bought here too (Round 8 — some slots are priced),
  // so the match has to check both grids, not just courses: BuyModal's
  // goCompleteProfile() builds this ?buy= param from whichever item was
  // being purchased when the profile-completion redirect fired, and on
  // this page that's just as often an internship.
  useEffect(() => {
    const slug = params.get("buy");
    if (!slug) return;
    const match = liveCourses.find((c) => c.slug === slug) || liveInternships.find((c) => c.slug === slug);
    if (match) {
      setBuyItem(match);
      setBuyTier(tierFromParams(params));
      const nextParams = new URLSearchParams(params);
      nextParams.delete("buy");
      nextParams.delete("tier");
      setParams(nextParams, { replace: true });
    }
  }, [params, liveCourses, liveInternships, setParams]);

  // All / Internships / Courses filter. Any nav jump (#internships, #courses)
  // resets it to "all", so an anchor never points at a hidden section.
  const { hash } = useLocation();
  const [filter, setFilter] = useState("all");
  useEffect(() => { setFilter("all"); }, [hash]);
  const indexItems = PROGRAMS_INDEX.filter((s) => !(filter === "courses" && s.id === "internships") && !(filter === "internships" && s.id === "courses"));

  return (
    <>
      <PageHead eyebrow="Programs" title="Industry-ready courses, delivered pan-India and globally."
        text="Fully virtual — join from anywhere, pan-India or globally. Pick a track, pay securely, and start building; every course ships with mentor support and a certificate." />
      <SectionIndex items={indexItems} />
      <div className="wrap program-filter" role="group" aria-label="Show programs">
        {[["all", "All programs"], ["internships", "Internships"], ["courses", "Courses"]].map(([v, label]) => (
          <button key={v} type="button" className={filter === v ? "active" : ""} aria-pressed={filter === v} onClick={() => setFilter(v)}>{label}</button>
        ))}
      </div>
      <section id="internships" className="section section--internships anchor-section" style={{ paddingTop: 20 }} hidden={filter === "courses"}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Internships</Reveal>
          <Reveal as="h2" variant="reveal-l">Paid virtual internships.</Reveal>
          <Reveal as="p" variant="reveal-l" className="section-lede">
            A paid, mentor-led work experience: you get an offer letter on day one, then a completion
            certificate and Letter of Recommendation at the end — ready to submit for your college's
            final-year internship requirement.
          </Reveal>
          <div className="grid3 stagger" style={{ marginTop: 24 }} key={`i-${filter}`}>
            {loadingInternships ? <SkeletonCards count={internships.length} /> : liveInternships.map((it, i) => (
              <InfoCard key={it.title || it._id} item={it} i={i} isProgram kind="internship"
                onInquire={(item) => setInquire({ item, kind: "internship" })} onDetail={setDetailData} />
            ))}
          </div>
        </div>
      </section>
      <section id="courses" className="section section--courses anchor-section" style={{ paddingTop: 20 }} hidden={filter === "internships"}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Courses</Reveal>
          <Reveal as="h2" variant="reveal-l">Choose your track. Build real things.</Reveal>
          <Reveal as="p" variant="reveal-l" className="section-lede">
            Self-paced training with mentor support — you get a certificate of completion, and
            outstanding performers get considered for our paid internship program.
          </Reveal>
          <div className="grid3 stagger" style={{ marginTop: 24 }} key={`c-${filter}`}>
            {loadingCourses ? <SkeletonCards count={courses.length} /> : liveCourses.map((it, i) => (
              <InfoCard key={it.title || it._id} item={it} i={i} isProgram kind="course"
                onInquire={(item) => setInquire({ item, kind: "course" })} onDetail={setDetailData} />
            ))}
          </div>
        </div>
      </section>
      <BuyModal item={buyItem} initialTier={buyTier} user={user} onClose={() => setBuyItem(null)} />
      <InquiryModal item={inquire?.item} kind={inquire?.kind} onClose={() => setInquire(null)} />
      <DetailModal data={detailData} onClose={() => setDetailData(null)}
        onInquire={(item) => setInquire({ item, kind: detailData?.kind })} />
      <section id="how-it-works" className="section anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">How It Works</Reveal>
          <Reveal as="h2" variant="reveal-l">4 simple steps to get started.</Reveal>
          <div className="process stagger">
            {process.map((p, i) => (
              <Reveal key={p.n} variant="reveal" className="step" style={{ "--i": i }}>
                <span className="step-num">{p.n}</span>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
              </Reveal>
            ))}
          </div>
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
  const { ownedTier, reload: reloadPlans } = useMyPlans();
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

  // Came back from /profile via ?buy=<slug> — resume the purchase.
  useEffect(() => {
    if (course && params.get("buy")) {
      setBuyItem(course);
      setBuyTier(tierFromParams(params));
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
          <h2 style={{ margin: "14px 0 16px" }}>We couldn't find that course.</h2>
          <p style={{ color: "var(--muted)", marginBottom: 24 }}>It may have been removed or renamed.</p>
          <Link className="btn btn-solid" to="/programs">← Back to programs</Link>
        </div>
      </section>
    );
  }

  const plans = offeredTiers(course);
  const closed = course.status === "closed";
  const openForBuy = isOpenForBuy(course);

  return (
    <>
      <section className="section" style={{ paddingTop: 140 }}>
        <div className="wrap" style={{ maxWidth: openForBuy && plans.length > 1 ? 940 : 720 }}>
          <Reveal as={Link} variant="reveal" to={course.type ? `/programs#${course.type}s` : "/programs"} className="back-link">← All programs</Reveal>
          <Reveal variant="reveal" className={course.type ? `card-type-${course.type}` : undefined}>
            <div className="card-top" style={{ marginTop: 24 }}>
              <div className="card-top-left">
                {course.type && (
                  <span className={`type-pill type-pill--${course.type}`}>
                    {course.type === "internship" ? "Internship" : "Course"}
                  </span>
                )}
                <span className="tag">{course.tag}</span>
              </div>
              {closed && <span className="closed-badge">Currently closed</span>}
            </div>
            <h1 style={{ fontFamily: "'Unbounded',sans-serif", fontSize: "clamp(1.8rem,4vw,2.6rem)", lineHeight: 1.15, margin: "14px 0 16px" }}>
              {course.title}
            </h1>
            <p style={{ color: "var(--muted)", fontSize: "1.02rem", lineHeight: 1.7, maxWidth: "65ch" }}>{course.desc}</p>

            <CourseFacts course={course} />

            {programDeliverables[course.type]?.length ? (
              <div className="deliverable-row" style={{ marginTop: 20 }}>
                {programDeliverables[course.type].map((d) => <span key={d} className="deliverable-chip">{d}</span>)}
              </div>
            ) : null}

            <ul className="detail-points" style={{ maxWidth: "60ch" }}>
              {(course.points || []).map((p) => <li key={p}>{p}</li>)}
            </ul>

            <CourseLists course={course} />

            {/* The block the phone's sticky Enroll bar watches: while this is on screen, the bar steps aside. */}
            <div id="course-cta" style={{ marginTop: 8 }}>
            {isAdmin ? (
              // Admins see every course and internship without buying or
              // applying — straight to the content (backend: isAdminUser).
              <div style={{ maxWidth: 280, marginTop: 24 }}>
                <Link className="btn btn-solid buy-btn" to={`/learn/${course.slug}`}>
                  {course.type === "internship" ? "Open internship" : "Open course"} →
                </Link>
                <span style={{ display: "block", marginTop: 8, color: "var(--muted)", fontSize: ".82rem" }}>Admin access — no payment needed</span>
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
          <Link className="btn btn-ghost" to="/programs">Browse programs</Link>
          <Link className="btn btn-ghost" to="/contact">Contact us</Link>
        </div>
      </div>
    </section>
  );
}

/* ================= SERVICES ================= */
export function Services() {
  usePageMeta({
    title: "IT Services | Crix Technology",
    description: "Websites, web apps, AI assistants and automation — delivered virtual-first to clients pan-India and globally, by the same team that trains India's next engineers.",
  });
  // Admin-managed now (AdminServices.jsx, /api/services) — the static
  // `services` array from content.js stays only as the fallback for when
  // the backend isn't configured or the DB has nothing seeded yet.
  const [liveServices, setLiveServices] = useState(services);
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
  usePageMeta({ title: "About Us | Crix Technology", description: about.body });
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
              <p>Virtual internships, IT services, and online courses — everything we teach comes from what we build for real clients, and everything we build sharpens what we teach.</p>
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
                <h4>{t.group}</h4>
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
  usePageMeta({
    title: "Contact Us | Crix Technology",
    description: "Get in touch with Crix Technology for internships, online courses, or IT services — we reply within two working days.",
  });
  const [form, setForm] = useState({ name: "", email: "", phone: "", interest: "Internship", message: "" });
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState(""); // "error" | "success" | "info"

  const [sending, setSending] = useState(false);

  const onSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (sending) return; // already in flight — ignore a repeat click/Enter
    const formEl = e && e.currentTarget; // captured now: React clears currentTarget after the await below
    const phone = form.phone.trim();
    const problems = [
      !form.name.trim() ? "your name" : !isValidName(form.name) && "a valid name (letters only)",
      !form.email.trim() ? "your email" : emailFormatError(form.email),
      !form.message.trim() && "a message",
      phone && phoneError(phone),
    ].filter(Boolean);
    if (problems.length) {
      const list = problems.length === 1
        ? problems[0]
        : `${problems.slice(0, -1).join(", ")} and ${problems[problems.length - 1]}`;
      setKind("error");
      setStatus(`Please add ${list}.`);
      return;
    }
    setKind("info");
    setStatus("Sending...");
    setSending(true);
    const res = await submitContact({
      name: form.name, email: form.email, interest: form.interest, message: form.message,
      phone,
    });
    setSending(false);
    setKind(res.ok ? "success" : "error");
    setStatus(res.ok ? "Message sent. We'll reply within two working days." : res.error);
    if (res.ok) burstConfetti(formEl && formEl.querySelector ? formEl.querySelector("button[type=submit]") : null);
    // Clear everything that was sent (the "interested in" choice back to its default too),
    // so pressing the button again can't quietly post the same message twice.
    if (res.ok) setForm({ name: "", email: "", phone: "", interest: "Internship", message: "" });
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
              <input id="c-name" name="name" autoComplete="name" value={form.name} onChange={set("name")} placeholder="Full name" /></div>
            <div className="field"><label htmlFor="c-email">Email</label>
              <input id="c-email" name="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@example.com" /></div>
            <div className="field"><label htmlFor="c-phone">Phone (optional)</label>
              <PhoneInput id="c-phone" name="phone" value={form.phone} onChange={setPhone} /></div>
            <div className="field"><label htmlFor="c-interest">I'm interested in</label>
              <select id="c-interest" name="interest" value={form.interest} onChange={set("interest")}>
                <option>Internship</option><option>IT Services</option><option>Online Course</option><option>Other</option>
              </select></div>
            <div className="field"><label htmlFor="c-message">Message</label>
              <textarea id="c-message" name="message" rows="4" value={form.message} onChange={set("message")} placeholder="College & semester, or your project details..." /></div>
            <button className="btn btn-solid" type="submit" disabled={sending}>{sending ? "Sending…" : "Send message"}</button>
            <Alert kind={kind || "info"}>{status}</Alert>
          </Reveal>
          <Reveal variant="reveal-r">
            <div className="info-row"><span className="ic">✉</span><div><span className="info-label">Email</span>
              <div className="contact-line"><a href={`mailto:${site.email}`}>{site.email}</a><CopyButton value={site.email} label="email address" /></div></div></div>
            <div className="info-row"><span className="ic">✆</span><div><span className="info-label">Phone</span>
              <div className="contact-line"><a href={`tel:${site.phone.replace(/\s/g, "")}`}>{site.phone}</a>
                <CopyButton value={site.phone} label="phone number" />
                <a className="wa-pill" href={`https://wa.me/${site.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
              {site.phoneAlt && (
                <div className="contact-line"><a href={`tel:${site.phoneAlt.replace(/\s/g, "")}`}>{site.phoneAlt}</a>
                  <CopyButton value={site.phoneAlt} label="second phone number" />
                  <a className="wa-pill" href={`https://wa.me/${site.whatsappAlt || site.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
              )}
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
function LegalPage({ eyebrow, title, doc }) {
  usePageMeta({ title: `${title} | Crix Technology`, description: doc.intro });
  return (
    <>
      <PageHead eyebrow={eyebrow} title={title} text={legal.updated} />
      {/* Legal copy is text-heavy — skip the scroll-reveal animation and the
          section's top/bottom mask fade so every line stays fully legible. */}
      <section className="section section--plain" style={{ paddingTop: 44 }}>
        <div className="wrap" style={{ maxWidth: 780 }}>
          <p style={{
            color: "var(--text)", lineHeight: 1.8, marginBottom: 40, padding: "18px 22px",
            background: "rgba(var(--teal-rgb),.08)", borderLeft: "3px solid var(--teal)", borderRadius: 12,
          }}>{doc.intro}</p>
          {doc.sections.map((s) => (
            <div key={s.title} style={{ marginBottom: 32 }}>
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
  return <LegalPage eyebrow="Legal" title="Privacy Policy" doc={legal.privacy} />;
}

export function TermsOfService() {
  return <LegalPage eyebrow="Legal" title="Terms of Service" doc={legal.terms} />;
}

export function ClientTerms() {
  return <LegalPage eyebrow="Legal" title="Client Services Terms" doc={legal.clientTerms} />;
}
