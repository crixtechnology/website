import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import * as THREE from "three";
import { site, marquee, programDeliverables } from "../data/content.js";
import { submitApplication, createRazorpayOrder, verifyPayment, submitContact } from "../services/api.js";
import { UserContext, isProfileComplete } from "../context/UserContext.jsx";

export const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Locks the page from scrolling behind a modal while it's open (used by
// BuyModal and AuthModal) — restores whatever overflow value was there
// before, so nesting/closing never leaves the page stuck unscrollable.
function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}

/* ---------- Reveal (scroll-in animation wrapper) ---------- */
// Content that's already in the viewport the moment this mounts (almost
// always true for above-the-fold sections right after a page navigation —
// ScrollToTop in App.jsx resets scroll to 0 on every route change) never
// gets a meaningful "scroll into view" moment: animating it in from
// opacity:0/blur(8px) over .9s is just a flash of blurred text, not a
// reveal. That flash was real enough that legal pages were special-cased
// with .section--plain to skip the effect entirely (see global.css)
// instead of fixing it here. useLayoutEffect (synchronous, before the
// browser paints) plus an immediate in-viewport check means already-visible
// content gets the "in" class before its first paint — the browser never
// draws the blurred frame, so no transition is visible — while content
// that's genuinely below the fold still animates in on scroll as before.
export function Reveal({ as: Tag = "div", variant = "reveal", className = "", children, style, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`${variant} ${className}`} style={style} {...rest}>{children}</Tag>;
}

/* ---------- TiltCard ---------- */
export function TiltCard({ children, style, className }) {
  const ref = useRef(null);
  const onMove = (e) => {
    if (REDUCED) return;
    const card = ref.current, r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    card.style.transform = `perspective(900px) rotateY(${(x - 0.5) * 10}deg) rotateX(${(0.5 - y) * 10}deg)`;
    card.style.setProperty("--mx", x * 100 + "%");
    card.style.setProperty("--my", y * 100 + "%");
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = "perspective(900px)"; };
  return (
    <article ref={ref} className={`card${className ? ` ${className}` : ""}`} style={style} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </article>
  );
}

// A course/internship not yet open for buying (no price set yet, or the
// admin closed it) gets an "Inquire" button straight to WhatsApp instead of
// a dead end — same number the site's floating WhatsApp button uses.
// `verb` lets the message (and the button copy that builds it) say "apply
// for" vs "enroll in" so the CTA itself signals internship vs course.
export function whatsappInquiryLink(title, verb = "learning more about") {
  const text = encodeURIComponent(`Hi Crix Technology! I'm interested in ${verb} "${title}". Could you share more details?`);
  return `https://wa.me/${site.whatsapp}?text=${text}`;
}

/* ---------- InfoCard (program/service/course) ---------- */
// Alternates entrance direction per column (left / top / right) so a 3-up grid
// visibly converges from different sides as it scrolls into view.
// isProgram: true for course/internship cards (they always get a Buy now or
// Inquire button) — false/omitted for plain content cards like Services,
// which only ever show "See more".
// kind: "internship" | "course" — drives the type pill, the card's accent
// color, and the CTA verb, so the category reads even out of context (not
// just from the section heading above the grid). Omit for Services cards.
export function InfoCard({ item, i, onDetail, onBuy, onInquire, onServiceInquire, isProgram, kind }) {
  const variant = i % 3 === 0 ? "reveal-l" : i % 3 === 2 ? "reveal-r" : "reveal-top";
  const hasPrice = item.price != null;
  const discounted = hasPrice ? Math.round(item.price * (1 - (item.discountPercent || 0) / 100)) : null;
  const closed = item.status === "closed";
  const openForBuy = hasPrice && !closed;
  const kindLabel = kind === "internship" ? "Internship" : kind === "course" ? "Course" : null;
  // Derived from `kind`, not `item.deliverables` — every internship/course
  // issues the same fixed set of documents for its type (see content.js's
  // programDeliverables), so this works whether `item` came from the static
  // fallback or the live API (whose Course schema has no such field).
  const deliverables = kind ? programDeliverables[kind] : null;
  return (
    <Reveal as="div" variant={variant} style={{ "--i": i }}>
      <TiltCard className={kind ? `card-type-${kind}` : undefined}>
        <div className="card-top">
          <div className="card-top-left">
            {kindLabel && <span className={`type-pill type-pill--${kind}`}>{kindLabel}</span>}
            <span className="tag">{item.tag}</span>
          </div>
          {closed && <span className="closed-badge">Currently closed</span>}
        </div>
        <h3>{item.title}</h3>
        <p className="card-benefit">{item.desc}</p>
        {item.durationDays ? <span className="duration-chip">{item.durationDays} days</span> : null}
        {deliverables?.length ? (
          <div className="deliverable-row">
            {deliverables.map((d) => <span key={d} className="deliverable-chip">{d}</span>)}
          </div>
        ) : null}
        {openForBuy && (
          <div className="price-row">
            {item.discountPercent > 0 && <span className="price-old">₹{item.price.toLocaleString("en-IN")}</span>}
            <span className="price-now">₹{discounted.toLocaleString("en-IN")}</span>
            {item.discountPercent > 0 && <span className="price-off">{item.discountPercent}% off</span>}
          </div>
        )}
        <div className="card-btn-row">
          {isProgram && (
            openForBuy ? (
              <button className="btn btn-solid buy-btn" onClick={() => onBuy && onBuy(item)}>Buy now</button>
            ) : kind === "internship" ? (
              <button className="btn btn-solid buy-btn" onClick={() => onInquire && onInquire(item)} title="Request to apply for this internship — no account needed">
                Request to apply
              </button>
            ) : (
              <button className="btn btn-solid buy-btn" onClick={() => onInquire && onInquire(item)} title="Request to enroll in this course — no account needed">
                Request to enroll
              </button>
            )
          )}
          {!isProgram && onServiceInquire && (
            <button className="btn btn-solid buy-btn" onClick={() => onServiceInquire(item)} title="Send an inquiry about this service — no account needed">
              Inquiry
            </button>
          )}
          {item.slug ? (
            // A real anchor to /programs/:slug (CourseDetail still exists as a
            // route) so ctrl/cmd-click "open in new tab", right-click "copy
            // link address", and crawler discovery all keep working — a plain
            // click still opens the popup, same as the button-only path below.
            <a className="btn btn-ghost see-more-btn" href={`/programs/${item.slug}`}
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                onDetail && onDetail({ item, kind, isProgram });
              }}>
              See more →
            </a>
          ) : (
            <button className="btn btn-ghost see-more-btn" onClick={() => onDetail && onDetail({ item, kind, isProgram })}>
              See more →
            </button>
          )}
        </div>
      </TiltCard>
    </Reveal>
  );
}

/* ---------- BenefitIcon: small outline icons for the "Benefits of joining" grid ---------- */
export function BenefitIcon({ name }) {
  const p = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "gift":
      return (<svg {...p}><rect x="3" y="9" width="18" height="12" rx="1.5" /><path d="M3 9h18v4H3z" /><path d="M12 9v12" /><path d="M12 9C9.5 9 8 7.4 8 5.7 8 4.4 9 3.4 10.2 3.4 11.8 3.4 12 6.5 12 9z" /><path d="M12 9c2.5 0 4-1.6 4-3.3 0-1.3-1-2.3-2.2-2.3C12.2 3.4 12 6.5 12 9z" /></svg>);
    case "award":
      return (<svg {...p}><circle cx="12" cy="8" r="5.4" /><path d="M8.4 12.7 7 21l5-2.6L17 21l-1.4-8.3" /></svg>);
    case "home":
      return (<svg {...p}><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-6h4v6" /></svg>);
    case "document":
      return (<svg {...p}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M9.5 12.5h5M9.5 15.5h5M9.5 18h3" /></svg>);
    case "linkedin":
      return (<svg {...p}><circle cx="7" cy="7" r="2" /><path d="M7 11v9" /><path d="M12 20v-5.5c0-2 1.3-3.2 3-3.2s3 1.2 3 3.2V20" /><path d="M12 11v9" /></svg>);
    case "briefcase":
      return (<svg {...p}><rect x="3" y="8" width="18" height="12" rx="1.5" /><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></svg>);
    case "mentor":
      return (<svg {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 21c0-3.9 3.1-7 7-7 1 0 2 .2 2.8.6" /><path d="m15.5 17.5 1.5 1.5 3-3" /></svg>);
    case "tasks":
      return (<svg {...p}><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M9 3.5h6v2H9z" /><path d="m8.5 12 1.5 1.5L13 10" /><path d="M8.5 17h7" /></svg>);
    case "star":
      return (<svg {...p}><path d="m12 3 2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 3.1 1.4-6.3-4.8-4.3 6.4-.6z" /></svg>);
    default:
      return null;
  }
}

/* ---------- Alert: the one shared success/error/info banner every form on
   the site renders its post-submit message through (Contact, BuyModal,
   InquiryModal, ServiceInquiryModal, AuthModal) — a colored, iconed box
   instead of each form's own plain, easy-to-miss line of text. ---------- */
export function Alert({ kind = "info", children }) {
  if (!children) return null;
  const icon = kind === "error" ? "!" : kind === "success" ? "✓" : "ⓘ";
  // Portaled straight to <body> rather than rendered in place: `.alert`'s
  // CSS is `position:fixed` so it floats top-center over the whole page,
  // but nearly every form on the site lives inside a Reveal-animated
  // wrapper (transform + will-change:transform for the slide-in effect) —
  // and a `transform` on ANY ancestor turns `position:fixed` into
  // "fixed relative to that ancestor" instead of the viewport, per the
  // CSS spec. Portaling is the standard fix every toast library uses for
  // exactly this reason, so the floating position holds regardless of how
  // deep in the DOM (a modal, a Reveal, both at once) the call site is.
  return createPortal(
    <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"} aria-live="polite">
      <span className="alert-icon" aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </div>,
    document.body
  );
}

/* ---------- BuyModal: confirms the logged-in account then opens Razorpay Checkout ----------
   Buying is gated behind login (see pages.jsx) — `user` is the account the
   purchase will be made under. Falls back to a guest form if it's ever
   opened without one. */
export function BuyModal({ item, user, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  // status.kind: "" (hidden) | "info" (progress) | "error"
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [loading, setLoading] = useState(false);
  useBodyScrollLock(!!item);

  const setInfo = (text) => setStatus({ text, kind: "info" });
  const setError = (text) => setStatus({ text, kind: "error" });
  const clearStatus = () => setStatus({ text: "", kind: "" });

  useEffect(() => {
    if (item) {
      setForm(user ? { name: user.name || "", email: user.email || "", phone: user.phone || "" } : { name: "", email: "", phone: "" });
      setStatus({ text: "", kind: "" });
      setLoading(false);
    }
  }, [item, user]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); clearStatus(); };

  // A logged-in account whose profile is missing name / email / phone is
  // sent to /profile to fill them in (and comes straight back to this
  // purchase via ?buy=<slug>) rather than re-typing them into every modal.
  // The bare guest form only shows when there's somehow no account.
  const needsProfile = !!user && !isProfileComplete(user);
  const goCompleteProfile = () => {
    const back = `${location.pathname}?buy=${encodeURIComponent(item.slug || "")}`;
    onClose();
    navigate(`/profile?reason=complete&next=${encodeURIComponent(back)}`);
  };

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // already in flight — avoid double-submitting a payment order
    const missing = [
      !form.name.trim() && "name",
      !form.email.trim() && "email",
      !form.phone.trim() && "phone number",
    ].filter(Boolean);
    if (missing.length) {
      const list = missing.length === 1
        ? missing[0]
        : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
      setError(`Please add your ${list}.`);
      return;
    }
    setLoading(true);
    setInfo("Setting up your enrollment...");

    const appRes = await submitApplication({
      // item.type is always real here — Buy is only reachable for a live,
      // API-sourced item (openForBuy requires a real price/status, which
      // the static content.js fallback never has) — so it's never
      // undefined in practice; "course" is just a defensive fallback.
      type: item.type === "internship" ? "internship" : "course", refTitle: item.title, courseSlug: item.slug,
      name: form.name, email: form.email, phone: form.phone,
    });
    if (!appRes.ok || !appRes.application) {
      setLoading(false);
      setError(appRes.error || "Could not start right now. Please try again.");
      return;
    }

    const orderRes = await createRazorpayOrder(appRes.application._id, item.slug);
    if (!orderRes.ok) {
      setLoading(false);
      setError(orderRes.error || "Could not start payment right now.");
      return;
    }

    const scriptOk = await loadRazorpayScript();
    setLoading(false);
    if (!scriptOk || !window.Razorpay) {
      setError("Could not load the payment gateway. Check your connection and try again.");
      return;
    }

    const rzp = new window.Razorpay({
      key: orderRes.keyId,
      order_id: orderRes.orderId,
      amount: orderRes.amount,
      currency: orderRes.currency,
      name: "Crix Technology",
      description: item.title,
      prefill: { name: form.name, email: form.email, contact: form.phone },
      theme: { color: "#14C9C9" },
      handler: async (resp) => {
        setInfo("Confirming your payment...");
        const v = await verifyPayment(resp);
        if (v.ok && v.enrolled) {
          setInfo("Payment confirmed — opening your course...");
          setTimeout(() => {
            onClose();
            navigate(v.courseSlug ? `/learn/${v.courseSlug}` : "/dashboard");
          }, 900);
        } else if (v.ok) {
          setInfo("Payment confirmed — check 'My Courses' for access.");
          setTimeout(() => { onClose(); navigate("/dashboard"); }, 1200);
        } else {
          setError(
            (v.error || "We received your payment") +
            " — if your course doesn't unlock shortly, contact us and we'll sort it out."
          );
        }
      },
      modal: { ondismiss: () => clearStatus() },
    });
    rzp.open();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="buy-modal-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <span className="eyebrow">Enroll</span>
        <h3 id="buy-modal-title" style={{ margin: "12px 0 4px" }}>{item.title}</h3>

        {needsProfile ? (
          <>
            <p style={{ color: "var(--muted)", fontSize: ".85rem", marginBottom: 20 }}>
              Purchasing as <b style={{ color: "var(--text)" }}>{user.name || user.email}</b>. We need a
              phone number on your profile before you can enrol.
            </p>
            <button className="btn btn-solid" onClick={goCompleteProfile} style={{ width: "100%" }}>
              Complete your profile →
            </button>
          </>
        ) : (
          <>
            {user ? (
              <p style={{ color: "var(--muted)", fontSize: ".85rem", marginBottom: 20 }}>
                Purchasing as <b style={{ color: "var(--text)" }}>{user.name}</b> ({user.email}).
              </p>
            ) : (
              <p style={{ color: "var(--muted)", fontSize: ".85rem", marginBottom: 20 }}>
                Fill your details to continue to payment.
              </p>
            )}
            <form onSubmit={onSubmit}>
              {!user && (
                <>
                  <div className="field"><label htmlFor="buy-name">Full name</label>
                    <input id="buy-name" autoComplete="name" value={form.name} onChange={set("name")} placeholder="Your name" /></div>
                  <div className="field"><label htmlFor="buy-email">Email</label>
                    <input id="buy-email" type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@example.com" /></div>
                  <div className="field"><label htmlFor="buy-phone">Phone</label>
                    <input id="buy-phone" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="98765 43210" /></div>
                </>
              )}
              <button className="btn btn-solid" type="submit" disabled={loading} style={{ width: "100%" }}>
                {loading ? "Please wait..." : "Continue to payment"}
              </button>
              <Alert kind={status.kind}>{status.text}</Alert>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// InquiryModal: collects name/email/phone/college and creates an Application
// (routes/applications.js) — this is what "Request to apply" (internships)
// and "Request to enroll" (unpriced/closed courses) open now, replacing the
// old wa.me/phone redirect so a submission is actually captured (and visible at
// /admin/applications) instead of depending on the visitor having WhatsApp
// and the admin catching the message there. No account needed either way.
// `item` doubles as the "is this open" flag, same pattern as BuyModal.
export function InquiryModal({ item, kind, onClose }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", college: "" });
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  useBodyScrollLock(!!item);

  useEffect(() => {
    if (item) {
      setForm({ name: "", email: "", phone: "", college: "" });
      setStatus({ text: "", kind: "" });
      setLoading(false);
      setDone(false);
    }
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setStatus({ text: "", kind: "" }); };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // already in flight — avoid a duplicate Application record
    const missing = [
      !form.name.trim() && "name",
      !form.email.trim() && "email",
      !form.phone.trim() && "phone number",
    ].filter(Boolean);
    if (missing.length) {
      const list = missing.length === 1
        ? missing[0]
        : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
      setStatus({ text: `Please add your ${list}.`, kind: "error" });
      return;
    }
    setLoading(true);
    setStatus({ text: "", kind: "" });
    const res = await submitApplication({
      type: kind, refTitle: item.title, courseSlug: item.slug,
      name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), college: form.college.trim(),
    });
    setLoading(false);
    if (!res.ok) {
      setStatus({ text: res.error || "Could not submit right now. Please try again, or email us at " + site.email, kind: "error" });
      return;
    }
    setDone(true);
  };

  const verb = kind === "internship" ? "apply for" : "enrol in";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="inquiry-modal-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <span className="eyebrow">{kind === "internship" ? "Apply" : "Request"}</span>
        <h3 id="inquiry-modal-title" style={{ margin: "12px 0 4px" }}>{item.title}</h3>

        {done ? (
          <>
            <Alert kind="success">
              Thanks{form.name ? `, ${form.name.split(" ")[0]}` : ""} — we've got your details for
              "{item.title}" and will reach out on {form.email} or {form.phone} within 2 working days.
            </Alert>
            <button className="btn btn-solid" onClick={onClose} style={{ width: "100%", marginTop: 16 }}>Done</button>
          </>
        ) : (
          <>
            <p style={{ color: "var(--muted)", fontSize: ".85rem", marginBottom: 20 }}>
              Share your details and we'll help you {verb} "{item.title}" — no account needed.
            </p>
            <form onSubmit={onSubmit}>
              <div className="field"><label htmlFor="inquiry-name">Full name</label>
                <input id="inquiry-name" autoComplete="name" value={form.name} onChange={set("name")} placeholder="Your name" /></div>
              <div className="field"><label htmlFor="inquiry-email">Email</label>
                <input id="inquiry-email" type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@example.com" /></div>
              <div className="field"><label htmlFor="inquiry-phone">Phone</label>
                <input id="inquiry-phone" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="98765 43210" /></div>
              <div className="field"><label htmlFor="inquiry-college">College / University (optional)</label>
                <input id="inquiry-college" autoComplete="organization" value={form.college} onChange={set("college")}
                  placeholder={kind === "internship" ? "For your placement records" : "e.g. ABC Institute of Technology"} /></div>
              <button className="btn btn-solid" type="submit" disabled={loading} style={{ width: "100%" }}>
                {loading ? "Sending..." : kind === "internship" ? "Submit application" : "Send request"}
              </button>
              <Alert kind={status.kind}>{status.text}</Alert>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// DetailModal: the "See more" popup for any InfoCard (internship, course, or
// service) — a quick-look at full description + points, without leaving the
// current page/scroll position, replacing what used to be a Link to the
// standalone /programs/:slug page for cards that had a slug (that route and
// CourseDetail itself still exist and still work — just no longer linked
// from a card's "See more").
// `data` is `{ item, kind, isProgram }` or null. `kind` drives the type
// pill + deliverable chips (services pass neither); `isProgram` decides
// whether a Buy/Apply/Request-to-enroll action shows at the bottom, versus
// opening ServiceInquiryModal for services (which are quoted, not sold
// online). Closing this and opening onBuy/onInquire/onServiceInquire happens
// in the same click handler so React batches both state updates into one
// re-render — no flash of both modals at once.
export function DetailModal({ data, onClose, onBuy, onInquire, onServiceInquire }) {
  useBodyScrollLock(!!data);

  useEffect(() => {
    if (!data) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [data, onClose]);

  if (!data) return null;
  const { item, kind, isProgram } = data;

  const hasPrice = item.price != null;
  const discounted = hasPrice ? Math.round(item.price * (1 - (item.discountPercent || 0) / 100)) : null;
  const closed = item.status === "closed";
  const openForBuy = hasPrice && !closed;
  const deliverables = kind ? programDeliverables[kind] : null;
  const kindLabel = kind === "internship" ? "Internship" : kind === "course" ? "Course" : null;

  const act = (fn) => () => { onClose(); fn && fn(item); };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box detail-modal-box" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="card-top">
          <div className="card-top-left">
            {kindLabel && <span className={`type-pill type-pill--${kind}`}>{kindLabel}</span>}
            <span className="tag">{item.tag}</span>
          </div>
          {closed && <span className="closed-badge">Currently closed</span>}
        </div>
        <h3 id="detail-modal-title" style={{ margin: "12px 0 10px" }}>{item.title}</h3>
        <p style={{ color: "var(--muted)", fontSize: ".92rem", lineHeight: 1.7 }}>{item.desc}</p>

        {item.durationDays ? (
          <div className="detail-fact" style={{ maxWidth: 220 }}>
            <span>Duration</span><b>{item.durationDays} days</b>
          </div>
        ) : null}

        {deliverables?.length ? (
          <div className="deliverable-row" style={{ marginTop: item.durationDays ? 0 : 16 }}>
            {deliverables.map((d) => <span key={d} className="deliverable-chip">{d}</span>)}
          </div>
        ) : null}

        {item.points?.length ? (
          <ul className="detail-points">
            {item.points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        ) : null}

        {openForBuy && (
          <div className="price-row" style={{ marginTop: 20 }}>
            {item.discountPercent > 0 && <span className="price-old">₹{item.price.toLocaleString("en-IN")}</span>}
            <span className="price-now">₹{discounted.toLocaleString("en-IN")}</span>
            {item.discountPercent > 0 && <span className="price-off">{item.discountPercent}% off</span>}
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          {isProgram ? (
            openForBuy ? (
              <button className="btn btn-solid buy-btn" onClick={act(onBuy)}>Buy now</button>
            ) : kind === "internship" ? (
              <button className="btn btn-solid buy-btn" onClick={act(onInquire)}>Request to apply</button>
            ) : (
              <button className="btn btn-solid buy-btn" onClick={act(onInquire)}>Request to enroll</button>
            )
          ) : onServiceInquire ? (
            <button className="btn btn-solid buy-btn" onClick={act(onServiceInquire)}>Inquiry</button>
          ) : (
            <a className="btn btn-solid buy-btn" href={whatsappInquiryLink(item.title, "learning more about")} target="_blank" rel="noopener noreferrer">
              Get in touch
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ServiceInquiryModal: the IT Services card's "Inquiry" button (and its
// DetailModal "See more" popup's own Inquiry action) — a lead-capture form
// posted through the existing /contact pipeline (submitContact ->
// routes/contact.js -> Contact model, visible in AdminMessages.jsx)
// alongside the plain Contact Us page, rather than a new endpoint/model/
// admin page for what's fundamentally the same "someone wants to talk to
// us" record. `interest` is set to the specific service's title so the
// admin can tell which service a lead came in for.
export function ServiceInquiryModal({ item, onClose }) {
  const [form, setForm] = useState({ company: "", name: "", phone: "", email: "", message: "" });
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  useBodyScrollLock(!!item);

  useEffect(() => {
    if (item) {
      setForm({ company: "", name: "", phone: "", email: "", message: "" });
      setStatus({ text: "", kind: "" });
      setLoading(false);
      setDone(false);
    }
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setStatus({ text: "", kind: "" }); };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // already in flight — same guard Contact() uses for this exact race
    const missing = [
      !form.company.trim() && "business/company name",
      !form.name.trim() && "your name",
      !form.phone.trim() && "a contact number",
    ].filter(Boolean);
    if (missing.length) {
      const list = missing.length === 1
        ? missing[0]
        : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
      setStatus({ text: `Please add ${list}.`, kind: "error" });
      return;
    }
    setLoading(true);
    setStatus({ text: "", kind: "" });
    const res = await submitContact({
      name: form.name.trim(), company: form.company.trim(), phone: form.phone.trim(),
      email: form.email.trim(), interest: item.title, message: form.message.trim(),
    });
    setLoading(false);
    if (!res.ok) {
      setStatus({ text: res.error || "Could not submit right now. Please try again, or email us at " + site.email, kind: "error" });
      return;
    }
    setDone(true);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="service-inquiry-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <span className="eyebrow">Inquiry</span>
        <h3 id="service-inquiry-title" style={{ margin: "12px 0 4px" }}>{item.title}</h3>

        {done ? (
          <>
            <Alert kind="success">
              Thanks{form.name ? `, ${form.name.split(" ")[0]}` : ""} — we've got your details for
              "{item.title}" and will get back to you within two working days.
            </Alert>
            <button className="btn btn-solid" onClick={onClose} style={{ width: "100%", marginTop: 16 }}>Done</button>
          </>
        ) : (
          <>
            <p style={{ color: "var(--muted)", fontSize: ".85rem", marginBottom: 20 }}>
              Tell us about your business and we'll get back to you about "{item.title}" within two
              working days.
            </p>
            <form onSubmit={onSubmit}>
              <div className="field"><label htmlFor="svc-company">Business / Company name</label>
                <input id="svc-company" autoComplete="organization" value={form.company} onChange={set("company")} placeholder="Your company" /></div>
              <div className="field"><label htmlFor="svc-name">Your name</label>
                <input id="svc-name" autoComplete="name" value={form.name} onChange={set("name")} placeholder="Full name" /></div>
              <div className="field"><label htmlFor="svc-phone">Contact number</label>
                <input id="svc-phone" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="98765 43210" /></div>
              <div className="field"><label htmlFor="svc-email">Email (optional)</label>
                <input id="svc-email" type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@example.com" /></div>
              <div className="field"><label htmlFor="svc-message">Details about your business (optional)</label>
                <textarea id="svc-message" rows="3" value={form.message} onChange={set("message")} placeholder="What are you looking to build or fix?" /></div>
              <button className="btn btn-solid" type="submit" disabled={loading} style={{ width: "100%" }}>
                {loading ? "Sending..." : "Send inquiry"}
              </button>
              <Alert kind={status.kind}>{status.text}</Alert>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// Google Identity Services — loaded once, lazily, only when the modal
// actually needs it (skipped entirely if REACT_APP_GOOGLE_CLIENT_ID isn't set).
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";
let googleScriptPromise = null;
function loadGoogleScript() {
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve) => {
    if (window.google?.accounts?.id) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return googleScriptPromise;
}

/* ---------- AuthModal: login/signup as a popup, not a page ----------
   Rendered once (see App.jsx), driven by UserContext's authModal state —
   call openAuthModal("login" | "signup", onSuccess) from anywhere to open
   it; onSuccess(user) fires right after a successful login/signup, before
   the modal closes, so callers (e.g. "Buy now") can pick up where they
   left off without a page redirect. */
export function AuthModal() {
  const { authModal, closeAuthModal, login, signup, loginWithGoogle, sessionExpired } = useContext(UserContext);
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef(null);
  useBodyScrollLock(!!authModal);

  useEffect(() => {
    if (authModal) {
      setMode(authModal.mode || "login");
      setForm({ name: "", email: "", phone: "", password: "" });
      setStatus("");
      setLoading(false);
    }
  }, [authModal]);

  useEffect(() => {
    if (!authModal) return;
    const onKey = (e) => { if (e.key === "Escape") closeAuthModal(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [authModal, closeAuthModal]);

  // Switching between "Log in" / "Create an account" shouldn't carry a
  // stale error from the other form along with it.
  const switchMode = (m) => { setMode(m); setStatus(""); };

  const finishAuth = (res, fallbackError) => {
    if (res.ok) {
      const onSuccess = authModal?.onSuccess;
      closeAuthModal();
      if (onSuccess) onSuccess(res.user);
    } else {
      setStatus(res.error || fallbackError);
    }
  };

  // Render the "Continue with Google" button into googleBtnRef whenever the
  // modal opens (or mode toggles, so the label switches between
  // signin_with/signup_with) — skipped entirely if no client ID is set.
  useEffect(() => {
    if (!authModal || !GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGoogleScript().then((ok) => {
      if (cancelled || !ok || !window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          setLoading(true);
          setStatus("");
          const res = await loginWithGoogle(response.credential);
          setLoading(false);
          finishAuth(res, "Could not sign in with Google.");
        },
      });
      googleBtnRef.current.innerHTML = "";
      // GIS needs a fixed pixel width — size it to the modal so the 320px
      // default can't overflow (and add an inner scrollbar) on narrow phones.
      const avail = googleBtnRef.current.getBoundingClientRect().width;
      const btnWidth = Math.max(220, Math.min(320, Math.round(avail || 320)));
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "filled_black", size: "large", width: btnWidth, shape: "pill", logo_alignment: "center",
        text: mode === "signup" ? "signup_with" : "signin_with",
      });
    });
    return () => { cancelled = true; };
  }, [authModal, mode]);

  if (!authModal) return null;

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setStatus(""); };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // already in flight — avoid a duplicate login/signup request
    if (mode === "login") {
      if (!form.email.trim() || !form.password.trim()) { setStatus("Enter your email and password."); return; }
    } else {
      if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.password.trim()) {
        setStatus("Please fill in every field."); return;
      }
      if (form.password.length < 8) { setStatus("Password must be at least 8 characters."); return; }
    }
    setLoading(true);
    setStatus("");
    const res = mode === "login" ? await login(form.email.trim(), form.password) : await signup(form);
    setLoading(false);
    finishAuth(res, mode === "login" ? "Login failed." : "Could not create your account.");
  };

  return (
    <div className="modal-backdrop" onClick={closeAuthModal}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={closeAuthModal} aria-label="Close">✕</button>
        <span className="eyebrow">{mode === "login" ? "Welcome back" : "Get started"}</span>
        <h3 id="auth-modal-title" style={{ margin: "10px 0 14px" }}>{mode === "login" ? "Log in to your account" : "Create your account"}</h3>
        {sessionExpired && (
          <Alert kind="info">You were signed out after 15 minutes of inactivity. Please log in again.</Alert>
        )}
        {GOOGLE_CLIENT_ID && (
          <>
            <div ref={googleBtnRef} className="google-btn-wrap" />
            <div className="auth-divider"><span>or</span></div>
          </>
        )}
        <form onSubmit={onSubmit}>
          {mode === "signup" && (
            <div className="field"><label htmlFor="auth-name">Full name</label>
              <input id="auth-name" value={form.name} onChange={set("name")} placeholder="Your name" autoComplete="name" disabled={loading} /></div>
          )}
          <div className="field"><label htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" autoComplete="username" disabled={loading} /></div>
          {mode === "signup" && (
            <div className="field"><label htmlFor="auth-phone">Phone</label>
              <input id="auth-phone" value={form.phone} onChange={set("phone")} placeholder="98765 43210" autoComplete="tel" disabled={loading} /></div>
          )}
          <div className="field"><label htmlFor="auth-password">Password</label>
            <input id="auth-password" type="password" value={form.password} onChange={set("password")}
              placeholder={mode === "login" ? "••••••••" : "At least 8 characters"}
              autoComplete={mode === "login" ? "current-password" : "new-password"} disabled={loading} /></div>
          <Alert kind="error">{status}</Alert>
          <button className="btn btn-solid" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
        <p className="form-note" style={{ marginTop: 14 }}>
          {mode === "login" ? (
            <>New here? <button type="button" className="link-btn" onClick={() => switchMode("signup")}>Create an account</button></>
          ) : (
            <>Already have an account? <button type="button" className="link-btn" onClick={() => switchMode("login")}>Log in</button></>
          )}
        </p>
      </div>
    </div>
  );
}

/* ---------- Logo (brand mark + stacked wordmark, matching the real logo) ---------- */
export function Logo({ className = "" }) {
  return (
    <span className={`logo ${className}`}>
      <img src="/logo-icon.png" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      <span className="logo-text">
        <span className="logo-top">CRIX</span>
        <span className="logo-bottom">TECHNOLOGY</span>
      </span>
    </span>
  );
}

/* ---------- Navbar ---------- */
export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, isAdmin, logout, openAuthModal } = useContext(UserContext);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile drawer on navigation, and on any tap outside it —
  // right now it only closed when a nav link itself was clicked.
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = [
    ["/programs#internships", "Internships"],
    ["/programs#courses", "Courses"],
    ["/services", "IT Services"],
    ["/about", "About"],
    ["/contact", "Contact"],
  ];
  return (
    <nav ref={navRef} className={`topbar ${scrolled ? "scrolled" : ""}`}>
      <div className="wrap nav-in">
        <Link to="/" onClick={() => setOpen(false)}><Logo /></Link>
        <ul id="primary-nav" className={`nav-links ${open ? "open" : ""}`}>
          {links.map(([to, label]) => {
            // NavLink's own isActive matches on pathname only, so it can't
            // tell "/programs#internships" and "/programs#courses" apart —
            // both would light up together any time the pathname is
            // "/programs", which is exactly the "can't tell them apart" bug
            // this session has been fixing everywhere else. Compare the
            // hash ourselves for a link that has one. Passing a *function*
            // to className (rather than a string) is required here — with a
            // string, NavLink always re-appends its own pathname-only
            // "active" regardless of what string you give it, silently
            // undoing this override.
            const [toPath, toHash] = to.split("#");
            const isActive = toHash
              ? location.pathname === toPath && location.hash === `#${toHash}`
              : location.pathname === toPath;
            return (
              <li key={to}>
                <NavLink to={to} onClick={() => setOpen(false)} className={() => (isActive ? "active" : "")}>{label}</NavLink>
              </li>
            );
          })}
          {/* .nav-cta/.nav-account (below) are desktop-only (hidden under the
              mobile breakpoint) — duplicate the same account links here so
              logging in/out and reaching My Courses is still reachable from
              the mobile menu, not just on desktop. */}
          <li className="nav-links-mobile-account">
            {isLoggedIn ? (
              <>
                {!isAdmin && (
                  <NavLink to="/profile" onClick={() => setOpen(false)}>Profile</NavLink>
                )}
                <NavLink to={isAdmin ? "/admin" : "/dashboard"} onClick={() => setOpen(false)}>
                  {isAdmin ? "Admin" : "My Courses"}
                </NavLink>
                <button className="btn btn-ghost nav-logout" onClick={() => { logout(); setOpen(false); navigate("/"); }}>Log out</button>
              </>
            ) : (
              // Same .nav-cta pill the desktop nav already uses for Log in —
              // was a plain underlined text link here, which read as a third,
              // unrelated button style sitting next to the hero's pill CTAs
              // (still visible beneath this dropdown, since it pushes content
              // down rather than covering it).
              <button className="nav-cta" onClick={() => { setOpen(false); openAuthModal("login"); }}>Log in</button>
            )}
          </li>
        </ul>
        {isLoggedIn ? (
          <span className="nav-account">
            {!isAdmin && (
              <NavLink className="nav-account-link" to="/profile" onClick={() => setOpen(false)}>Profile</NavLink>
            )}
            <Link className="nav-cta" to={isAdmin ? "/admin" : "/dashboard"} onClick={() => setOpen(false)}>
              {isAdmin ? "Admin" : "My Courses"}
            </Link>
            <button className="btn btn-ghost nav-logout" onClick={() => { logout(); setOpen(false); navigate("/"); }}>
              Log out
            </button>
          </span>
        ) : (
          <button className="nav-cta" onClick={() => { setOpen(false); openAuthModal("login"); }}>Log in</button>
        )}
        <button className="burger" aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open} aria-controls="primary-nav"
          onClick={() => setOpen(!open)}>{open ? "✕" : "☰"}</button>
      </div>
    </nav>
  );
}

/* ---------- Footer ---------- */
const FOOT_COLS = [
  {
    heading: "For Businesses",
    links: [
      ["Web & App Development", "/services"],
      ["AI & Automation", "/services"],
      ["Digital Marketing", "/services"],
      ["IT Consulting", "/services"],
    ],
  },
  {
    heading: "For Students",
    links: [
      ["Virtual Internships", "/programs#internships"],
      ["Web Development Track", "/programs#courses"],
      ["Android Development", "/programs#internships"],
      ["Online Courses", "/programs#courses"],
    ],
  },
  {
    heading: "Company",
    links: [
      ["About Us", "/about"],
      ["Contact", "/contact"],
      ["Privacy Policy", "/privacy-policy"],
      ["Terms of Service", "/terms-of-service"],
      ["Client Services Terms", "/client-terms"],
    ],
  },
];

export function Footer() {
  const tel = (n) => `tel:${n.replace(/[^\d+]/g, "")}`;
  return (
    <footer>
      <div className="wrap foot">
        <div className="foot-brand">
          <Logo className="foot-logo" />
          <p className="foot-desc">
            Your one-stop solution for IT services, virtual internships, and future-ready
            skills training. Based in Ahmedabad — serving clients pan-India and globally.
          </p>
          <div className="foot-contact">
            <span><a href={tel(site.phone)}>{site.phone}</a>
              <a className="wa-pill" href={`https://wa.me/${site.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></span>
            {site.phoneAlt && (
              <span><a href={tel(site.phoneAlt)}>{site.phoneAlt}</a>
                <a className="wa-pill" href={`https://wa.me/${site.whatsappAlt || site.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></span>
            )}
            <a href={`mailto:${site.email}`}>{site.email}</a>
            {site.hours && <span className="foot-hours">{site.hours}</span>}
          </div>
        </div>
        <div className="foot-cols">
          {FOOT_COLS.map((col) => (
            <div key={col.heading}>
              <h4>{col.heading}</h4>
              <ul className="foot-links">
                {col.links.map(([label, to]) => (
                  <li key={label}><Link to={to}>{label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="wrap foot-base">
        <span>© {site.year} {site.legalName || "Crix Technology Private Limited"} · {site.city}</span>
        <span className="mono">CIN: {site.cin}{site.udyam ? ` · Udyam: ${site.udyam}` : ""}</span>
      </div>
    </footer>
  );
}

/* ---------- Chrome: loader, progress bar, back-to-top, WhatsApp ---------- */
export function Chrome() {
  const [loaded, setLoaded] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const progressRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), REDUCED ? 0 : 550);
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) progressRef.current.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
      setShowTop(y > 600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { clearTimeout(t); window.removeEventListener("scroll", onScroll); };
  }, []);

  return (
    <>
      <div id="loader" className={loaded ? "done" : ""}>
        <div className="ld"><Logo /></div>
      </div>
      <div id="progress" ref={progressRef}></div>
      <a id="wa" href={`https://wa.me/${site.whatsapp}`} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C9.4 3 4 8.3 4 14.9c0 2.6.9 5 2.3 7L4 29l7.3-2.2c1.9 1 3.6 1.5 5.7 1.5 6.6 0 12-5.3 12-11.9S22.6 3 16 3zm6.6 16.9c-.3.8-1.6 1.5-2.3 1.6-.6.1-1.3.2-2.2-.1-.5-.2-1.1-.4-1.9-.7-3.4-1.5-5.6-4.9-5.8-5.1-.2-.2-1.4-1.8-1.4-3.5s.9-2.5 1.2-2.8c.3-.3.7-.4.9-.4h.7c.2 0 .5-.1.8.6.3.8 1 2.6 1.1 2.8.1.2.2.4 0 .7-.1.3-.2.4-.4.7-.2.2-.4.5-.6.7-.2.2-.4.4-.2.8s1 1.7 2.2 2.7c1.5 1.3 2.8 1.7 3.2 1.9.4.2.6.2.8-.1.2-.2.9-1.1 1.2-1.5.2-.4.5-.3.8-.2.3.1 2.1 1 2.4 1.2.4.2.6.3.7.4.1.3.1.9-.2 1.7z"/></svg>
      </a>
      <button id="toTop" className={showTop ? "show" : ""} aria-label="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" })}>↑</button>
    </>
  );
}

/* ---------- Marquee ---------- */
export function Marquee() {
  const items = [...marquee, ...marquee];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="track">
        {items.map((t, i) => <span key={i}><i>◆</i>{t}</span>)}
      </div>
    </div>
  );
}

/* ---------- RotatingWord ---------- */
export function RotatingWord({ words }) {
  const [i, setI] = useState(0);
  const [swap, setSwap] = useState(false);
  useEffect(() => {
    if (REDUCED) return;
    const t = setInterval(() => {
      setSwap(true);
      setTimeout(() => { setI((v) => (v + 1) % words.length); setSwap(false); }, 360);
    }, 3400);
    return () => clearInterval(t);
  }, [words]);
  return <span className={`rotator ${swap ? "swap" : ""}`}>{words[i]}</span>;
}

/* ---------- Counter ---------- */
export function Counter({ value, suffix = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(el);
        if (REDUCED) { el.textContent = value + suffix; return; }
        const t0 = performance.now(), dur = 1400;
        const tick = (t) => {
          const k = Math.min((t - t0) / dur, 1);
          el.textContent = Math.round(value * (1 - Math.pow(1 - k, 3))) + suffix;
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [value, suffix]);
  return <b ref={ref}>0</b>;
}

/* ---------- Hero3D: neural constellation background ---------- */
export function Hero3D() {
  const mountRef = useRef(null);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.z = 14;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const N = 420;
    const positions = new Float32Array(N * 3);
    const speeds = [];
    for (let i = 0; i < N; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14;
      speeds.push(0.0016 + Math.random() * 0.003);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x7fe8e0, size: 0.07, transparent: true, opacity: 0.85 })));

    const MAXL = 260;
    const linePos = new Float32Array(MAXL * 6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    scene.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x14c9c9, transparent: true, opacity: 0.16 })));

    const cluster = new THREE.Group();
    const mats = [
      new THREE.MeshBasicMaterial({ color: 0x14c9c9, wireframe: true, transparent: true, opacity: 0.35 }),
      new THREE.MeshBasicMaterial({ color: 0x7fe8e0, wireframe: true, transparent: true, opacity: 0.18 }),
      new THREE.MeshBasicMaterial({ color: 0xf2b44c, wireframe: true, transparent: true, opacity: 0.2 }),
    ];
    [[2.6, 0, 0, 0], [1.1, 4.4, 1.6, -1.5], [0.8, -4.8, -2.0, 1.0]].forEach((c, i) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(c[0], 1), mats[i]);
      m.position.set(c[1], c[2], c[3]);
      cluster.add(m);
    });
    cluster.position.x = 4.5;
    scene.add(cluster);

    let mx = 0, my = 0, raf = 0, frame = 0, alive = true;
    const onMove = (e) => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };
    const onScrollFx = () => {
      if (REDUCED) return;
      const y = window.scrollY;
      cluster.rotation.z = y * 0.0008;
      cluster.position.y = y * 0.004;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScrollFx, { passive: true });

    // Phone tilt (gyroscope) drives the same parallax as mouse move on desktop.
    // Baseline is whatever angle the phone is held at when the first reading
    // arrives, so the effect is relative to "however you're holding it" —
    // not an absolute flat-on-a-table orientation.
    let baseBeta = null, baseGamma = null;
    const onOrientation = (e) => {
      if (REDUCED || e.beta == null || e.gamma == null) return;
      if (baseBeta === null) { baseBeta = e.beta; baseGamma = e.gamma; }
      const dGamma = Math.max(-30, Math.min(30, e.gamma - baseGamma));
      const dBeta = Math.max(-30, Math.min(30, e.beta - baseBeta));
      mx = (dGamma / 30) * 0.5;
      my = (dBeta / 30) * 0.5;
    };
    const startMotion = () => window.addEventListener("deviceorientation", onOrientation, { passive: true });
    const requestMotion = () => {
      if (REDUCED) return;
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission().then((s) => { if (s === "granted") startMotion(); }).catch(() => {});
      } else {
        startMotion();
      }
    };
    // iOS requires a user gesture before it will grant motion permission.
    window.addEventListener("touchstart", requestMotion, { once: true, passive: true });

    const connect = () => {
      const p = geo.attributes.position.array;
      let li = 0;
      for (let i = 0; i < N && li < MAXL; i++) {
        for (let j = i + 1; j < N && li < MAXL; j += 7) {
          const dx = p[i*3]-p[j*3], dy = p[i*3+1]-p[j*3+1], dz = p[i*3+2]-p[j*3+2];
          if (dx*dx + dy*dy + dz*dz < 5.5) {
            linePos.set([p[i*3], p[i*3+1], p[i*3+2], p[j*3], p[j*3+1], p[j*3+2]], li * 6);
            li++;
          }
        }
      }
      linePos.fill(0, li * 6);
      lineGeo.attributes.position.needsUpdate = true;
    };

    const animate = () => {
      if (!alive) return;
      raf = requestAnimationFrame(animate);
      const p = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        p[i*3+1] += Math.sin(Date.now() * 0.0004 + i) * 0.0015;
        p[i*3] += speeds[i] * 0.4;
        if (p[i*3] > 15) p[i*3] = -15;
      }
      geo.attributes.position.needsUpdate = true;
      if (frame++ % 6 === 0) connect();
      cluster.rotation.y += 0.0022;
      cluster.rotation.x += 0.0009;
      cluster.children.forEach((m, i) => { m.rotation.x += 0.002 + i * 0.001; m.rotation.z += 0.0015; });
      camera.position.x += (mx * 1.6 - camera.position.x) * 0.04;
      camera.position.y += (-my * 1.1 - camera.position.y) * 0.04;
      camera.lookAt(scene.position);
      renderer.render(scene, camera);
    };
    if (REDUCED) { connect(); renderer.render(scene, camera); } else animate();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScrollFx);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("touchstart", requestMotion);
      window.removeEventListener("deviceorientation", onOrientation);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);
  return <div className="bg3d" ref={mountRef}></div>;
}

/* ---------- Aurora ---------- */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <span className="a1"></span><span className="a2"></span><span className="a3"></span><span className="a4"></span>
    </div>
  );
}

/* ---------- MorphParticles: a cloud of points that morphs between icon shapes,
   the effect from the reference reel, rebuilt for Crix (teal/cyan, on-brand shapes) ---------- */
function seg(a, b, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  return pts;
}
function arc(cx, cy, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * (i / n); pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); }
  return pts;
}
function resample(points, count) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = points[Math.min(points.length - 1, Math.floor((i / count) * points.length))];
  return out;
}

const SHAPES = [
  { name: "Internships", gen: () => [
    ...seg([0, 0.62], [0.78, 0.30], 20), ...seg([0.78, 0.30], [0, -0.02], 20),
    ...seg([0, -0.02], [-0.78, 0.30], 20), ...seg([-0.78, 0.30], [0, 0.62], 20),
    ...seg([-0.24, -0.06], [0.24, -0.06], 10), ...seg([0.24, -0.06], [0.24, -0.30], 8),
    ...seg([0.24, -0.30], [-0.24, -0.30], 10), ...seg([-0.24, -0.30], [-0.24, -0.06], 8),
    ...seg([0.22, 0.32], [0.36, -0.34], 14),
  ] },
  { name: "IT Services", gen: () => [
    ...seg([-0.95, 0.42], [-1.35, 0], 24), ...seg([-1.35, 0], [-0.95, -0.42], 24),
    ...seg([-0.18, 0.62], [0.18, -0.62], 28),
    ...seg([0.95, 0.42], [1.35, 0], 24), ...seg([1.35, 0], [0.95, -0.42], 24),
  ] },
  { name: "Courses", gen: () => [
    ...arc(0, 0.30, 0.52, 0, Math.PI * 2, 48),
    ...seg([-0.20, -0.22], [0.20, -0.22], 10), ...seg([0.20, -0.22], [0.13, -0.50], 10),
    ...seg([0.13, -0.50], [-0.13, -0.50], 8), ...seg([-0.13, -0.50], [-0.20, -0.22], 10),
    ...seg([-0.09, -0.50], [-0.09, -0.64], 6), ...seg([0.09, -0.50], [0.09, -0.64], 6),
  ] },
  { name: "AI Agents", gen: () => {
    let pts = [...arc(0, 0, 0.12, 0, Math.PI * 2, 16)];
    const N = 6;
    for (let i = 0; i < N; i++) {
      const ang = (Math.PI * 2 / N) * i - Math.PI / 2;
      const nx = Math.cos(ang) * 0.85, ny = Math.sin(ang) * 0.85;
      pts = pts.concat(seg([0, 0], [nx, ny], 14), arc(nx, ny, 0.11, 0, Math.PI * 2, 14));
    }
    return pts;
  } },
];
const PARTICLE_COUNT = 900;

function MorphParticles() {
  const mountRef = useRef(null);
  const [label, setLabel] = useState(SHAPES[0].name);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const targets = SHAPES.map((s) => resample(s.gen(), PARTICLE_COUNT));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 20);
    camera.position.z = 4.6;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spriteCanvas.height = 64;
    const sctx = spriteCanvas.getContext("2d");
    const grad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(200,250,245,.8)");
    grad.addColorStop(1, "rgba(20,201,201,0)");
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 64, 64);
    const spriteTex = new THREE.CanvasTexture(spriteCanvas);

    const N = PARTICLE_COUNT;
    const positions = new Float32Array(N * 3);
    const current = new Float32Array(N * 3);
    const from = new Float32Array(N * 3);
    const to = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);

    const colA = new THREE.Color(0x7fe8e0), colB = new THREE.Color(0x14c9c9), colC = new THREE.Color(0xf2b44c);
    for (let i = 0; i < N; i++) {
      const p = targets[0][i];
      current[i * 3] = p[0] * 1.7; current[i * 3 + 1] = p[1] * 1.7; current[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      const c = Math.random() < 0.08 ? colC : (Math.random() < 0.5 ? colA : colB);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    positions.set(current);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.045, map: spriteTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true, opacity: 0.9,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    let shapeIdx = 0, morphing = false, morphStart = 0, raf = 0, alive = true;
    const morphDur = 1500, t0 = performance.now();

    const startMorph = () => {
      const nextIdx = (shapeIdx + 1) % SHAPES.length;
      for (let i = 0; i < N; i++) {
        from[i * 3] = current[i * 3]; from[i * 3 + 1] = current[i * 3 + 1]; from[i * 3 + 2] = current[i * 3 + 2];
        const p = targets[nextIdx][i];
        to[i * 3] = p[0] * 1.7; to[i * 3 + 1] = p[1] * 1.7; to[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      }
      shapeIdx = nextIdx;
      morphing = true; morphStart = performance.now();
      setLabel(SHAPES[shapeIdx].name);
    };
    const interval = setInterval(() => { if (!REDUCED) startMorph(); }, 3600);

    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const animate = () => {
      if (!alive) return;
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const pos = geo.attributes.position.array;
      if (morphing) {
        const t = Math.min((now - morphStart) / morphDur, 1);
        const e = ease(t);
        for (let i = 0; i < N; i++) {
          current[i * 3] = from[i * 3] + (to[i * 3] - from[i * 3]) * e;
          current[i * 3 + 1] = from[i * 3 + 1] + (to[i * 3 + 1] - from[i * 3 + 1]) * e;
          current[i * 3 + 2] = from[i * 3 + 2] + (to[i * 3 + 2] - from[i * 3 + 2]) * e;
        }
        if (t >= 1) morphing = false;
      }
      const drift = (now - t0) * 0.0002;
      for (let i = 0; i < N; i++) {
        pos[i * 3] = current[i * 3] + Math.sin(drift * 2 + i) * 0.01;
        pos[i * 3 + 1] = current[i * 3 + 1] + Math.cos(drift * 2 + i * 1.3) * 0.01;
        pos[i * 3 + 2] = current[i * 3 + 2];
      }
      geo.attributes.position.needsUpdate = true;
      points.rotation.y = Math.sin(drift * 0.6) * 0.15;
      points.rotation.x = Math.cos(drift * 0.4) * 0.05;
      renderer.render(scene, camera);
    };
    if (REDUCED) renderer.render(scene, camera); else animate();

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);
    // The mount div can still be mid-layout (width 0) the instant this effect
    // fires — a ResizeObserver catches the real size as soon as it settles,
    // not just on window resize.
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      alive = false;
      clearInterval(interval);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      renderer.dispose(); mat.dispose(); geo.dispose(); spriteTex.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="particle-stage" ref={mountRef}>
      <span className="particle-label">{label}</span>
    </div>
  );
}

/* ---------- LiveDevice: laptop mockup, screen shows the morphing particle scene ---------- */
export function LiveDevice() {
  return (
    <div className="device-rig">
      <div className="device">
        <div className="device-inner">
          <div className="device-topbar">
            <i></i><i></i><i></i>
            <span>crixtechnology.in</span>
          </div>
          <MorphParticles />
          <div className="device-sheen"></div>
        </div>
      </div>
      <div className="device-deck"></div>
      <svg className="device-cable-svg" viewBox="0 0 300 90" aria-hidden="true">
        <defs>
          <linearGradient id="deviceCableGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--amber)" />
            <stop offset="100%" stopColor="var(--teal)" />
          </linearGradient>
        </defs>
        <path className="device-cable-line" d="M20,10 C90,20 140,40 260,70" />
        <path className="device-cable-flow" d="M20,10 C90,20 140,40 260,70" />
        <circle className="device-node" cx="266" cy="72" r="5" />
        <circle cx="266" cy="72" r="3" fill="var(--cyan)" />
      </svg>
    </div>
  );
}
