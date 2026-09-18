import { useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Reveal, InfoCard, BenefitIcon, BuyModal, InquiryModal, DetailModal, ServiceInquiryModal, Alert, Marquee, RotatingWord, Counter, Hero3D, Aurora, LiveDevice, REDUCED,
} from "../components/ui.jsx";
import {
  site, hero, internships, services, courses, process, benefits, stats, about, legal,
  techStack, clientProcess, engagementModels, expertise, whyCrix, company, programDeliverables,
} from "../data/content.js";
import { submitContact, getCourses, getCourse, getServices } from "../services/api.js";
import { UserContext } from "../context/UserContext.jsx";
import { usePageMeta } from "../hooks/usePageMeta.js";
import { isValidEmail, phoneLengthError, COUNTRY_CODES } from "../utils/validators.js";

/* ================= HOME ================= */
export function Home() {
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const [liveInternships, setLiveInternships] = useState(internships);
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
    getCourses("internship").then((res) => {
      if (alive && res.ok && res.courses && res.courses.length) setLiveInternships(res.courses);
    });
    return () => { alive = false; };
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
          <p>{hero.subtitle}</p>
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
            {liveInternships.map((it, i) => (
              <InfoCard key={it.title || it._id} item={it} i={i} isProgram kind="internship" onInquire={setInquireItem} onDetail={setDetailData}
                // Home has no login/BuyModal plumbing of its own (unlike
                // Programs/CourseDetail) — an internship priced+open enough
                // to show "Buy now" here (from the card or from the "See
                // more" popup below) sends the click to its full detail
                // page instead, where the real purchase flow lives. ?buy=
                // is CourseDetail's own existing "resume purchase" query
                // param (also used by the post-profile-completion redirect
                // below) — it opens BuyModal there immediately on arrival
                // instead of landing the visitor on the page and making
                // them find and click "Buy now" a second time.
                onBuy={(item) => navigate(`/programs/${item.slug}?buy=${encodeURIComponent(item.slug)}`)} />
            ))}
          </div>
          <div className="hero-ctas">
            <Link className="btn btn-ghost" to="/programs#internships">View internship details →</Link>
          </div>
        </div>
      </section>
      <InquiryModal item={inquireItem} kind="internship" onClose={() => setInquireItem(null)} />
      <DetailModal data={detailData} onClose={() => setDetailData(null)} onInquire={setInquireItem} onServiceInquire={setServiceInquiryItem}
        onBuy={(item) => navigate(`/programs/${item.slug}?buy=${encodeURIComponent(item.slug)}`)} />
      <ServiceInquiryModal item={serviceInquiryItem} onClose={() => setServiceInquiryItem(null)} />

      <section className="section" style={{ paddingTop: 0, paddingBottom: 20 }}>
        <div className="wrap">
          <Reveal variant="reveal-zoom" className="stats">
            {stats.map((s) => (
              <div className="stat" key={s.label}>
                <Counter value={s.value} suffix={s.suffix} />
                <span>{s.label}</span>
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
  const [buyItem, setBuyItem] = useState(null);
  const [inquire, setInquire] = useState(null); // { item, kind } | null
  const [detailData, setDetailData] = useState(null); // { item, kind, isProgram } | null
  const [params, setParams] = useSearchParams();
  const { isLoggedIn, user, openAuthModal } = useContext(UserContext);
  usePageMeta({
    title: "Internships & Courses | Crix Technology",
    description: "Explore paid virtual internships and industry-ready online courses in MERN stack, AI Agentic Systems, Android development and more — delivered virtually, pan-India and globally.",
  });

  useEffect(() => {
    let alive = true;
    getCourses("internship").then((res) => {
      if (alive && res.ok && res.courses && res.courses.length) setLiveInternships(res.courses);
    });
    getCourses("course").then((res) => {
      if (alive && res.ok && res.courses && res.courses.length) setLiveCourses(res.courses);
    });
    return () => { alive = false; };
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
      const nextParams = new URLSearchParams(params);
      nextParams.delete("buy");
      setParams(nextParams, { replace: true });
    }
  }, [params, liveCourses, liveInternships, setParams]);

  // Buying requires an account — browsing/prices stay open to everyone.
  // Not logged in: pop the login/signup modal, then open the buy modal the
  // moment it succeeds, right where the user already was.
  const handleBuy = (item) => {
    if (!isLoggedIn) { openAuthModal("login", () => setBuyItem(item)); return; }
    setBuyItem(item);
  };

  return (
    <>
      <PageHead eyebrow="Programs" title="Industry-ready courses, delivered pan-India and globally."
        text="Fully virtual — join from anywhere, pan-India or globally. Pick a track, pay securely, and start building; every course ships with mentor support and a certificate." />
      <section id="internships" className="section section--internships anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Internships</Reveal>
          <Reveal as="h2" variant="reveal-l">Paid virtual internships.</Reveal>
          <Reveal as="p" variant="reveal-l" className="section-lede">
            A paid, mentor-led work experience: you get an offer letter on day one, then a completion
            certificate and Letter of Recommendation at the end — ready to submit for your college's
            final-year internship requirement.
          </Reveal>
          <div className="grid3 stagger" style={{ marginTop: 24 }}>
            {liveInternships.map((it, i) => (
              <InfoCard key={it.title || it._id} item={it} i={i} onBuy={handleBuy} isProgram kind="internship"
                onInquire={(item) => setInquire({ item, kind: "internship" })} onDetail={setDetailData} />
            ))}
          </div>
        </div>
      </section>
      <section id="courses" className="section section--courses anchor-section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-l" className="eyebrow">Courses</Reveal>
          <Reveal as="h2" variant="reveal-l">Choose your track. Build real things.</Reveal>
          <Reveal as="p" variant="reveal-l" className="section-lede">
            Self-paced training with mentor support — you get a certificate of completion, and
            outstanding performers get considered for our paid internship program.
          </Reveal>
          <div className="grid3 stagger" style={{ marginTop: 24 }}>
            {liveCourses.map((it, i) => (
              <InfoCard key={it.title || it._id} item={it} i={i} onBuy={handleBuy} isProgram kind="course"
                onInquire={(item) => setInquire({ item, kind: "course" })} onDetail={setDetailData} />
            ))}
          </div>
        </div>
      </section>
      <BuyModal item={buyItem} user={user} onClose={() => setBuyItem(null)} />
      <InquiryModal item={inquire?.item} kind={inquire?.kind} onClose={() => setInquire(null)} />
      <DetailModal data={detailData} onClose={() => setDetailData(null)} onBuy={handleBuy}
        onInquire={(item) => setInquire({ item, kind: detailData?.kind })} />
      <section className="section" style={{ paddingTop: 20 }}>
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
      <section className="section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <Reveal as="span" variant="reveal-top" className="eyebrow">What You Get</Reveal>
          <Reveal as="h2" variant="reveal-top">Benefits of joining Crix.</Reveal>
          <div className="grid4 stagger">
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
  const [inquireOpen, setInquireOpen] = useState(false);
  const { isLoggedIn, user, openAuthModal } = useContext(UserContext);

  const handleBuy = () => {
    if (!isLoggedIn) { openAuthModal("login", () => setBuyItem(course)); return; }
    setBuyItem(course);
  };

  usePageMeta({
    title: course ? `${course.title} | Crix Technology` : "Programs | Crix Technology",
    description: course ? course.desc : undefined,
  });

  useEffect(() => {
    let alive = true;
    setCourse(undefined);
    getCourse(slug).then((res) => { if (alive) setCourse(res.ok ? res.course : null); });
    return () => { alive = false; };
  }, [slug]);

  // Came back from /profile via ?buy=<slug> — resume the purchase.
  useEffect(() => {
    if (course && params.get("buy")) {
      setBuyItem(course);
      const nextParams = new URLSearchParams(params);
      nextParams.delete("buy");
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

  const hasPrice = course.price != null;
  const discounted = hasPrice ? Math.round(course.price * (1 - (course.discountPercent || 0) / 100)) : null;
  const closed = course.status === "closed";
  const openForBuy = hasPrice && !closed;

  return (
    <>
      <section className="section" style={{ paddingTop: 140 }}>
        <div className="wrap" style={{ maxWidth: 720 }}>
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

            {course.durationDays ? (
              <div className="detail-fact" style={{ maxWidth: 260, marginTop: 24 }}>
                <span>Duration</span><b>{course.durationDays} days</b>
              </div>
            ) : null}

            {programDeliverables[course.type]?.length ? (
              <div className="deliverable-row" style={{ marginTop: 20 }}>
                {programDeliverables[course.type].map((d) => <span key={d} className="deliverable-chip">{d}</span>)}
              </div>
            ) : null}

            <ul className="detail-points" style={{ maxWidth: "60ch" }}>
              {(course.points || []).map((p) => <li key={p}>{p}</li>)}
            </ul>

            {openForBuy && (
              <div className="price-row" style={{ marginTop: 30 }}>
                {course.discountPercent > 0 && <span className="price-old">₹{course.price.toLocaleString("en-IN")}</span>}
                <span className="price-now">₹{discounted.toLocaleString("en-IN")}</span>
                {course.discountPercent > 0 && <span className="price-off">{course.discountPercent}% off</span>}
              </div>
            )}

            <div style={{ maxWidth: 280, marginTop: 24 }}>
              {openForBuy ? (
                <button className="btn btn-solid buy-btn" onClick={handleBuy}>Buy now</button>
              ) : course.type === "internship" ? (
                <button className="btn btn-solid buy-btn" onClick={() => setInquireOpen(true)} title="Request to apply for this internship — no account needed">
                  Request to apply
                </button>
              ) : (
                <button className="btn btn-solid buy-btn" onClick={() => setInquireOpen(true)} title="Request to enroll in this course — no account needed">
                  Request to enroll
                </button>
              )}
            </div>
          </Reveal>
        </div>
      </section>
      <BuyModal item={buyItem} user={user} onClose={() => setBuyItem(null)} />
      <InquiryModal item={inquireOpen ? course : null} kind={course.type} onClose={() => setInquireOpen(false)} />
    </>
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
  const [detailData, setDetailData] = useState(null);
  const [serviceInquiryItem, setServiceInquiryItem] = useState(null);
  useEffect(() => {
    let alive = true;
    getServices().then((res) => {
      if (alive && res.ok && res.services && res.services.length) setLiveServices(res.services);
    });
    return () => { alive = false; };
  }, []);
  return (
    <>
      <PageHead eyebrow="IT Services" title="Technology for growing businesses."
        text="Websites, web apps, AI assistants and automation — delivered virtual-first to clients pan-India and globally, by the same team that trains India's next engineers." />
      <section className="section" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="grid3 stagger" style={{ marginTop: 0 }}>
            {liveServices.map((it, i) => (
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

      <section className="section" style={{ paddingTop: 20 }}>
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

      <section className="section" style={{ paddingTop: 20 }}>
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
            ].filter(([, v]) => v).map(([k, v], i) => (
              <Reveal key={k} variant="reveal" className="ci-row" style={{ "--i": i }}>
                <dt>{k}</dt>
                <dd className={/CIN|Udyam/.test(k) ? "mono" : undefined}>{v}</dd>
              </Reveal>
            ))}
          </dl>
          {company.note && (
            <Reveal variant="reveal" className="form-note" style={{ marginTop: 16 }}>{company.note}</Reveal>
          )}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 20 }}>
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

      <section className="section" style={{ paddingTop: 20 }}>
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

      <section className="section" style={{ paddingTop: 20 }}>
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
  const [form, setForm] = useState({ name: "", email: "", countryCode: "+91", phone: "", interest: "Internship", message: "" });
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState(""); // "error" | "success" | "info"

  const [sending, setSending] = useState(false);

  const onSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (sending) return; // already in flight — ignore a repeat click/Enter
    const phoneDigits = form.phone.trim();
    const problems = [
      !form.name.trim() && "your name",
      !form.email.trim() ? "your email" : !isValidEmail(form.email) && "a valid email address",
      !form.message.trim() && "a message",
      phoneDigits && phoneLengthError(form.countryCode, phoneDigits),
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
      phone: phoneDigits ? `${form.countryCode} ${phoneDigits}` : "",
    });
    setSending(false);
    setKind(res.ok ? "success" : "error");
    setStatus(res.ok ? "Message sent. We'll reply within two working days." : res.error);
  };

  const set = (k) => (e) => {
    const value = k === "phone" ? e.target.value.replace(/\D/g, "") : e.target.value;
    setForm({ ...form, [k]: value });
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
              <div className="phone-row">
                <select aria-label="Country code" value={form.countryCode} onChange={set("countryCode")}>
                  {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
                <input id="c-phone" name="phone" autoComplete="tel" inputMode="numeric" value={form.phone} onChange={set("phone")} placeholder="98765 43210" />
              </div></div>
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
            <div className="info-row"><span className="ic">✉</span><div><span className="info-label">Email</span><a href={`mailto:${site.email}`}>{site.email}</a></div></div>
            <div className="info-row"><span className="ic">✆</span><div><span className="info-label">Phone</span>
              <div className="contact-line"><a href={`tel:${site.phone.replace(/\s/g, "")}`}>{site.phone}</a>
                <a className="wa-pill" href={`https://wa.me/${site.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
              {site.phoneAlt && (
                <div className="contact-line"><a href={`tel:${site.phoneAlt.replace(/\s/g, "")}`}>{site.phoneAlt}</a>
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
function PageHead({ eyebrow, title, text }) {
  return (
    <header className="page-head" style={{ position: "relative", overflow: "hidden" }}>
      <Aurora />
      <Reveal variant="reveal-top" style={{ position: "relative", zIndex: 2 }} className="wrap">
        <span className="eyebrow">{eyebrow}</span>
        <h2 style={{ fontSize: "clamp(1.9rem,4vw,3rem)" }}>{title}</h2>
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
              <h3 style={{ fontSize: "1.1rem", margin: "0 0 10px" }}>{s.title}</h3>
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
