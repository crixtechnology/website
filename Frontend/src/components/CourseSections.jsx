import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCourses } from "../services/api.js";
import { site } from "../data/content.js";
import { offeredTiers, planPrice, formatINR, isOpenForBuy } from "../utils/tiers.js";
import { useJsonLd, canonicalUrl, SITE_URL, programKeywords } from "../hooks/usePageMeta.js";

// The extra sections of a course / internship page (CourseDetail in pages/pages.jsx).
// Everything the admin types in (what you'll learn, who it's for, prerequisites, FAQs) is
// optional: a section with nothing in it is simply not rendered, so a course nobody has
// filled in yet looks exactly as it did before.

const kindLabel = (c) => (c.type === "internship" ? "Internship" : "Course");
const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);

/* ---------- key facts ---------- */
// Only facts the site can stand behind: what it is, that it's online (every program here is),
// how long it runs, or that a course has no expiry (no duration set = lifetime access — see
// Backend utils/enrollmentAccess.js), and what it costs when it's on sale.
export function CourseFacts({ course }) {
  const plans = offeredTiers(course);
  const facts = [["Type", kindLabel(course)], ["Format", "Online"]];
  if (course.durationDays) facts.push(["Duration", `${course.durationDays} days`]);
  else if (course.type !== "internship" && plans.length) facts.push(["Access", "Lifetime"]);
  if (plans.length && isOpenForBuy(course)) facts.push(["From", formatINR(Math.min(...plans.map(planPrice)))]);
  return (
    <dl className="course-facts">
      {facts.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

/* ---------- what you'll learn / who it's for / prerequisites ---------- */
export function CourseLists({ course }) {
  const learn = list(course.outcomes);
  const audience = list(course.audience);
  const before = list(course.prerequisites);
  if (!learn.length && !audience.length && !before.length) return null;
  return (
    <>
      {learn.length > 0 && (
        <section className="course-block">
          <h2>What you'll learn</h2>
          <ul className="check-list">{learn.map((x, i) => <li key={`${i}-${x}`}>{x}</li>)}</ul>
        </section>
      )}
      {(audience.length > 0 || before.length > 0) && (
        <div className="course-cols">
          {audience.length > 0 && (
            <section className="course-block">
              <h2>Who it's for</h2>
              <ul className="dash-list">{audience.map((x, i) => <li key={`${i}-${x}`}>{x}</li>)}</ul>
            </section>
          )}
          {before.length > 0 && (
            <section className="course-block">
              <h2>Before you start</h2>
              <ul className="dash-list">{before.map((x, i) => <li key={`${i}-${x}`}>{x}</li>)}</ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

/* ---------- FAQs ---------- */
// <details> gives keyboard support, screen-reader state and no-JS behaviour for free.
export function CourseFaq({ faqs }) {
  const rows = (Array.isArray(faqs) ? faqs : []).filter((f) => f && typeof f.q === "string" && f.q.trim() && typeof f.a === "string" && f.a.trim());
  if (!rows.length) return null;
  return (
    <section className="course-block">
      <h2>Questions</h2>
      <div className="faq-list">
        {rows.map((f, i) => (
          <details className="faq" key={`${i}-${f.q}`}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ---------- related programs ---------- */
// Up to three others: the same kind first, and ones that are open before closed. Loaded on its
// own, so a slow or failed request never holds up the page — it just doesn't appear.
export function RelatedPrograms({ course }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let alive = true;
    getCourses().then((res) => {
      if (!alive || !res || !res.ok) return;
      const rank = (c) => (c.type === course.type ? 0 : 2) + (c.status === "closed" ? 1 : 0);
      const others = (res.courses || [])
        .filter((c) => c.slug && c.slug !== course.slug)
        .map((c, i) => ({ c, i }))
        .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
        .map((x) => x.c);
      setItems(others.slice(0, 3));
    });
    return () => { alive = false; };
  }, [course.slug, course.type]);

  if (!items.length) return null;
  return (
    <section className="course-block">
      <h2>You might also like</h2>
      <div className="related-grid">
        {items.map((c) => (
          <Link className="related-card" to={`/programs/${c.slug}`} key={c.slug}>
            <span className={`type-pill type-pill--${c.type === "internship" ? "internship" : "course"}`}>{kindLabel(c)}</span>
            <h3>{c.title}</h3>
            <p>{c.desc}</p>
            <span className="related-more">See more →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ---------- sticky "enroll" bar (phones) ---------- */
// While the page's own button (the element with id `targetId`) is off-screen, a bar pinned to the
// bottom of a phone keeps the next step one tap away. It steps aside when that button is on screen,
// and when the footer is (so it never covers the footer's links). Hidden on wider screens (CSS).
export function EnrollBar({ course, onInquire, targetId = "course-cta" }) {
  const [ctaSeen, setCtaSeen] = useState(true); // until the observer says otherwise the bar stays hidden
  const [footerSeen, setFooterSeen] = useState(false);
  const plans = offeredTiers(course);
  const openForBuy = isOpenForBuy(course);
  const show = !ctaSeen && !footerSeen;

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return undefined;
    const cta = document.getElementById(targetId);
    const foot = document.querySelector("footer");
    const observers = [];
    if (cta) {
      const io = new IntersectionObserver(([e]) => setCtaSeen(e.isIntersecting), { threshold: 0.1 });
      io.observe(cta);
      observers.push(io);
    }
    if (foot) {
      const io = new IntersectionObserver(([e]) => setFooterSeen(e.isIntersecting), { threshold: 0.05 });
      io.observe(foot);
      observers.push(io);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [targetId, course.slug]);

  // The page's floating buttons (WhatsApp, back-to-top) move up out of the bar's way while it shows.
  useEffect(() => {
    document.body.classList.toggle("has-enroll-bar", show);
    return () => document.body.classList.remove("has-enroll-bar");
  }, [show]);

  const goToPlans = () => {
    const el = document.getElementById("plans");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const cheapest = plans.length ? Math.min(...plans.map(planPrice)) : null;
  const sub = openForBuy && cheapest !== null ? `From ${formatINR(cheapest)}`
    : course.status === "closed" ? "Currently closed"
    : course.type === "internship" ? "Apply to join" : "Ask about the next batch";

  return (
    <div className={`enroll-bar${show ? " show" : ""}`} aria-hidden={show ? undefined : true}>
      <div className="enroll-bar-text"><b>{course.title}</b><span>{sub}</span></div>
      {openForBuy ? (
        <button type="button" className="btn btn-solid" tabIndex={show ? 0 : -1} onClick={goToPlans}>Choose a plan</button>
      ) : (
        <button type="button" className="btn btn-solid" tabIndex={show ? 0 : -1} onClick={onInquire}>
          {course.type === "internship" ? "Request to apply" : "Request to enroll"}
        </button>
      )}
    </div>
  );
}

/* ---------- search-engine markup ---------- */
// schema.org "Course" for the page (what it's called, who provides it, that it runs online, how
// long, and what it teaches when the admin has said). Added while the page is on screen, removed after.
export function useCourseJsonLd(course) {
  const ok = !!(course && course.title);
  const learn = ok ? list(course.outcomes) : [];
  // Course: canonical address (no ?ref=/?buy= query), full provider details.
  useJsonLd("course-jsonld", ok ? {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.desc || course.title,
    url: canonicalUrl(),
    provider: { "@type": "Organization", name: "Crix Technology", url: SITE_URL, ...(site.email ? { email: site.email } : {}) },
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", ...(course.durationDays ? { courseWorkload: `P${course.durationDays}D` } : {}) },
    ...(learn.length ? { teaches: learn } : {}),
    keywords: programKeywords(course).join(", "),
  } : null);
  // The page's FAQs, as FAQPage markup (eligible for expandable Q&A in results).
  const faqs = ok ? (Array.isArray(course.faqs) ? course.faqs : []).filter((f) => f && typeof f.q === "string" && f.q.trim() && typeof f.a === "string" && f.a.trim()) : [];
  useJsonLd("faq-jsonld", faqs.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q.trim(), acceptedAnswer: { "@type": "Answer", text: f.a.trim() } })),
  } : null);
}
