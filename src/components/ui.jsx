import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import * as THREE from "three";
import { site, marquee } from "../data/content.js";
import { submitApplication, createRazorpayOrder } from "../services/api.js";

export const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Reveal (scroll-in animation wrapper) ---------- */
export function Reveal({ as: Tag = "div", variant = "reveal", className = "", children, style, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
export function TiltCard({ children, style }) {
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
    <article ref={ref} className="card" style={style} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </article>
  );
}

/* ---------- InfoCard (program/service/course) ---------- */
// Alternates entrance direction per column (left / top / right) so a 3-up grid
// visibly converges from different sides as it scrolls into view.
export function InfoCard({ item, i, onDetail, onBuy }) {
  const variant = i % 3 === 0 ? "reveal-l" : i % 3 === 2 ? "reveal-r" : "reveal-top";
  const hasPrice = item.price != null;
  const discounted = hasPrice ? Math.round(item.price * (1 - (item.discountPercent || 0) / 100)) : null;
  const closed = item.status === "closed";
  return (
    <Reveal as="div" variant={variant} style={{ "--i": i }}>
      <TiltCard>
        <div className="card-top">
          <span className="tag">{item.tag}</span>
          {closed && <span className="closed-badge">Currently closed</span>}
        </div>
        <h3>{item.title}</h3>
        <p className="card-benefit">{item.desc}</p>
        {item.durationDays ? <span className="duration-chip">{item.durationDays} days</span> : null}
        {hasPrice && (
          <div className="price-row">
            {item.discountPercent > 0 && <span className="price-old">₹{item.price.toLocaleString("en-IN")}</span>}
            <span className="price-now">₹{discounted.toLocaleString("en-IN")}</span>
            {item.discountPercent > 0 && <span className="price-off">{item.discountPercent}% off</span>}
          </div>
        )}
        <div className="card-btn-row">
          {hasPrice && (
            <button className="btn btn-solid buy-btn" disabled={closed} onClick={() => onBuy && onBuy(item)}>
              {closed ? "Currently closed" : "Buy now"}
            </button>
          )}
          {item.slug ? (
            <Link className="btn btn-ghost see-more-btn" to={`/programs/${item.slug}`}>See more →</Link>
          ) : (
            <button className="btn btn-ghost see-more-btn" onClick={() => onDetail && onDetail(item)}>
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
    default:
      return null;
  }
}

/* ---------- BuyModal: collects applicant details then opens Razorpay Checkout ---------- */
export function BuyModal({ item, onClose }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item) { setForm({ name: "", email: "", phone: "" }); setStatus(""); setLoading(false); }
  }, [item]);

  if (!item) return null;

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setStatus(""); };

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
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      setStatus("Please fill your name, email and phone.");
      return;
    }
    setLoading(true);
    setStatus("Setting up your enrollment...");

    const appRes = await submitApplication({
      type: "course", refTitle: item.title, name: form.name, email: form.email, phone: form.phone,
    });
    if (!appRes.ok || !appRes.application) {
      setLoading(false);
      setStatus(appRes.error || "Could not start right now. Please try again.");
      return;
    }

    const orderRes = await createRazorpayOrder(appRes.application._id, item.slug);
    if (!orderRes.ok) {
      setLoading(false);
      setStatus(orderRes.error || "Could not start payment right now.");
      return;
    }

    const scriptOk = await loadRazorpayScript();
    setLoading(false);
    if (!scriptOk || !window.Razorpay) {
      setStatus("Could not load the payment gateway. Check your connection and try again.");
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
      handler: () => setStatus("Payment received — we'll email your confirmation shortly."),
      modal: { ondismiss: () => setStatus("") },
    });
    rzp.open();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <span className="eyebrow">Enroll</span>
        <h3 style={{ margin: "12px 0 4px" }}>{item.title}</h3>
        <p style={{ color: "var(--muted)", fontSize: ".85rem", marginBottom: 20 }}>
          Fill your details to continue to payment.
        </p>
        <form onSubmit={onSubmit}>
          <div className="field"><label>Full name</label>
            <input value={form.name} onChange={set("name")} placeholder="Your name" /></div>
          <div className="field"><label>Email</label>
            <input type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" /></div>
          <div className="field"><label>Phone</label>
            <input value={form.phone} onChange={set("phone")} placeholder="98765 43210" /></div>
          <button className="btn btn-solid" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Please wait..." : "Continue to payment"}
          </button>
          {status && <p className="form-note">{status}</p>}
        </form>
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
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [open]);

  const links = [
    ["/programs", "Internships & Courses"],
    ["/services", "IT Services"],
    ["/about", "About"],
    ["/contact", "Contact"],
  ];
  return (
    <nav ref={navRef} className={`topbar ${scrolled ? "scrolled" : ""}`}>
      <div className="wrap nav-in">
        <Link to="/" onClick={() => setOpen(false)}><Logo /></Link>
        <ul className={`nav-links ${open ? "open" : ""}`}>
          {links.map(([to, label]) => (
            <li key={to}>
              <NavLink to={to} onClick={() => setOpen(false)}
                className={({ isActive }) => (isActive ? "active" : "")}>{label}</NavLink>
            </li>
          ))}
        </ul>
        <Link className="nav-cta" to="/contact">Apply for internship</Link>
        <button className="burger" aria-label="Menu" onClick={() => setOpen(!open)}>{open ? "✕" : "☰"}</button>
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
      ["Virtual Internships", "/programs"],
      ["Web Development Track", "/programs"],
      ["Android Development", "/programs"],
      ["Online Courses", "/programs"],
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
