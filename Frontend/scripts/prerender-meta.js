// Runs after `npm run build` (the "postbuild" script in package.json).
//
// This is a single-page app: every address is answered with the same
// build/index.html, so a crawler that doesn't run JavaScript (Bing, LinkedIn,
// WhatsApp/Facebook link previews, ...) would see the home page's title,
// description and no <h1> on every page. This writes, per page, a copy of the
// app with that page's own title, description, canonical URL, social tags,
// breadcrumb/structured data and a real <h1> + summary baked into the HTML:
//   - build/<page>/index.html        for each page in src/data/seo.json
//   - build/programs/<slug>/index.html for each live course/internship
//     (fetched from the backend at build time, when reachable)
//   - build/app.html                 fallback for every other address, with
//                                    no canonical/og:url (see below)
//   - build/sitemap.xml
// (On Cloudflare Pages, CF_PAGES set, pages are written as <page>.html
// instead and a 404.html copy of app.html is added; see writePage below.)
// Vercel serves real files before applying vercel.json's rewrites, so these
// are picked up automatically; the app itself then boots exactly as before.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");
const seo = JSON.parse(fs.readFileSync(path.join(root, "src", "data", "seo.json"), "utf8"));
// The Free Internship page's roles — static, the same file the page reads.
const freeInternships = JSON.parse(fs.readFileSync(path.join(root, "src", "data", "freeInternships.json"), "utf8"));
const template = fs.readFileSync(path.join(buildDir, "index.html"), "utf8");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const url = (p) => seo.siteUrl + (p === "/" ? "/" : p);
const ldScript = (id, data) => `<script type="application/ld+json" id="${id}">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
// Meta descriptions over ~160 characters get cut off in results: trim at a word boundary.
const clip = (s, n = 158) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n - 1)).replace(/[,;:\s—–-]+$/, "") + "…"; };

// A program's name with its length — must match programTitle() in
// src/hooks/usePageMeta.js. One domain is sold in 1 / 2 / 3 / 6 month versions
// under the same title; without the length their pages had identical titles,
// H1s and descriptions.
const DURATION_NAMES = { 15: "15 days", 30: "1 month", 60: "2 months", 90: "3 months", 180: "6 months" };
function programTitle(c) {
  const n = Number(c.durationDays);
  if (!Number.isFinite(n) || n <= 0) return c.title;
  const length = DURATION_NAMES[n] || `${n} ${n === 1 ? "day" : "days"}`;
  const already = new RegExp(`\\b(${String(n / 30)}[\\s-]*months?|${n}[\\s-]*days?)\\b`, "i");
  return already.test(c.title) ? c.title : `${c.title} — ${length}`;
}

// What search results show for a program — must match programSeoTitle() and
// programDescription() in src/hooks/usePageMeta.js. One domain's 1 / 2 / 3 / 6
// month programs share their visible text, so the search title and snippet are
// told apart by length, price and stipend. The stipend is tidied the way
// stipendInfo() in src/utils/positions.js does it.
function paidStipend(c) {
  const raw = String(c.stipend || "").trim();
  if (!raw || /^(no stipend|none|unpaid|nil)\.?$/i.test(raw)) return "";
  let text = raw.replace(/\(?\s*performance[\s-]*based\s*\)?/i, "").trim();
  let per = "";
  const perMatch = text.match(/\s*\/\s*(month|mo|week|day)\.?$/i);
  if (perMatch) {
    per = perMatch[1].toLowerCase() === "mo" ? "month" : perMatch[1].toLowerCase();
    text = text.slice(0, perMatch.index).trim();
  }
  text = text.replace(/(₹\s*)(\d{4,})/g, (_, sign, d) => `₹${Number(d).toLocaleString("en-IN")}`).replace(/\s*-\s*(?=₹|\d)/g, " – ");
  return text ? `${text}${per ? `/${per}` : ""}` : "";
}
// The signup bonus a new account gets (Admin's careers terms, read with the
// openings below) — a logged-out visitor's fee is shown after it. Same default
// as defaultTerms in src/data/careers.js.
let signupTerms = { amount: 300, usagePercent: 100 };
const maskINR = (n) => {
  const num = String(Math.round(Math.max(0, Number(n) || 0)));
  if (num.length < 3) return `₹${num}*`;
  return `₹${num[0]}${"X".repeat(num.length - 2)}${num[num.length - 1]}*`;
};
// What the bonus takes off a price — the same rule as walletOffPrice() in src/hooks/useWalletCredit.js.
function bonusOff(price) {
  const p = Math.floor(Number(price) || 0);
  const { amount, usagePercent } = signupTerms;
  if (!(amount > 0) || p <= 0) return 0;
  if (usagePercent >= 100 && amount >= p) return p;
  if (p <= 1) return 0;
  const cap = Math.floor((p * Math.max(0, Math.min(100, usagePercent))) / 100);
  return Math.floor(Math.min(amount, Math.max(0, Math.min(p - 1, cap))));
}
// As the logged-out page shows it: after the signup bonus, masked — must match
// lowestPrice() in src/hooks/usePageMeta.js ("₹3XX9* after the ₹300 signup bonus").
function lowestPrice(c) {
  const prices = (Array.isArray(c.tiers) ? c.tiers : []).map((t) => Number(t && t.price)).filter((n) => n > 0);
  if (!prices.length) return "";
  const low = Math.min(...prices);
  const off = bonusOff(low);
  return off > 0 ? `${maskINR(low - off)} after the ₹${signupTerms.amount.toLocaleString("en-IN")} signup bonus` : maskINR(low);
}
function programSeoTitle(c) {
  return `${programTitle(c)}${paidStipend(c) ? " + Paid Internship" : ""} | Crix Technology`;
}
function programDescription(c) {
  const desc = String(c.desc || "").trim();
  const price = lowestPrice(c);
  const stipend = paidStipend(c);
  const months = Math.round(Number(c.durationDays) / 30) || 0;
  const training = Number(c.stipendTrainingMonths) || 0;
  let lead = "";
  if (stipend && months && training > 0 && training < months) {
    lead = `${training} months training + ${months - training} months paid internship (stipend ${stipend}, performance based)${price ? `, ${price}` : ""}.`;
  } else if (stipend) {
    lead = `training + paid internship (stipend ${stipend}, performance based)${price ? `, ${price}` : ""}.`;
  } else if (price) {
    lead = `online training for ${price}, with offer letter, certificate and LOR.`;
  }
  const name = programTitle(c);
  if (!desc) return `${name} — ${lead || "online Training + Internship by Crix Technology, Ahmedabad."}`;
  return lead ? `${name}: ${lead} ${desc}` : `${name}: ${desc}`;
}

// Keywords for a course/internship page from its own content — must match
// programKeywords() in src/hooks/usePageMeta.js, which the app uses.
function programKeywords(c) {
  const kind = c.type === "internship" ? "internship" : "course";
  // Skills (what the card shows), else the older points list.
  const source = Array.isArray(c.skills) && c.skills.length ? c.skills : Array.isArray(c.points) ? c.points : [];
  const topics = source
    .filter((p) => typeof p === "string" && p.trim() && p.length <= 60)
    .map((p) => p.replace(/^Capstone:\s*/i, "").trim())
    .slice(0, 6);
  return [...new Set([c.title, `${c.title} ${kind}`, `online ${kind}`, ...topics, "Crix Technology"])];
}

// Replace one tag's attribute value, failing loudly if the tag is missing
// (so a template change can't silently ship pages with the home page's tags).
function setAttr(html, tagRegex, attr, value, label) {
  let hit = false;
  const out = html.replace(tagRegex, (tag) => {
    hit = true;
    return tag.replace(new RegExp(`${attr}="[^"]*"`), `${attr}="${esc(value)}"`);
  });
  if (!hit) throw new Error(`prerender-meta: ${label} not found in build/index.html`);
  return out;
}

// One page: { path, title, description, h1, crumbs: [{name, path}], ld: [{id, data}] }
function pageHtml(pg) {
  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(pg.title)}</title>`);
  html = setAttr(html, /<meta name="description"[^>]*>/, "content", pg.description, "meta description");
  html = setAttr(html, /<link rel="canonical"[^>]*>/, "href", url(pg.path), "canonical");
  html = setAttr(html, /<meta property="og:url"[^>]*>/, "content", url(pg.path), "og:url");
  html = setAttr(html, /<meta property="og:title"[^>]*>/, "content", pg.title, "og:title");
  html = setAttr(html, /<meta property="og:description"[^>]*>/, "content", pg.description, "og:description");
  html = setAttr(html, /<meta name="twitter:title"[^>]*>/, "content", pg.title, "twitter:title");
  html = setAttr(html, /<meta name="twitter:description"[^>]*>/, "content", pg.description, "twitter:description");
  // Page-specific keywords, or no tag at all (never the home page's list).
  html = pg.keywords && pg.keywords.length
    ? setAttr(html, /<meta name="keywords"[^>]*>/, "content", pg.keywords.join(", "), "meta keywords")
    : html.replace(/\s*<meta name="keywords"[^>]*>/, "");
  if (!/<h1 id="seo-h1">/.test(html)) throw new Error("prerender-meta: seo-h1 not found in build/index.html");
  html = html.replace(/<h1 id="seo-h1">[\s\S]*?<\/h1>/, `<h1 id="seo-h1">${esc(pg.h1)}</h1>`);
  html = html.replace(/<p id="seo-desc">[\s\S]*?<\/p>/, `<p id="seo-desc">${esc(pg.description)}</p>`);
  const blocks = [];
  if (pg.crumbs) {
    // Same ids the app uses (useJsonLd), so it replaces these instead of adding a second copy.
    blocks.push(ldScript("breadcrumb-jsonld", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: pg.crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: url(c.path) })),
    }));
  }
  (pg.ld || []).forEach((b) => blocks.push(ldScript(b.id, b.data)));
  if (blocks.length) html = html.replace("</head>", `${blocks.join("")}</head>`);
  return html;
}

// Built on Cloudflare Pages (it sets CF_PAGES=1) rather than Vercel. Pages
// redirects /about to /about/ when the page is about/index.html, while every
// canonical URL has no trailing slash; about.html is served at /about as it
// is. Vercel's build keeps the about/index.html layout its vercel.json expects.
const ON_PAGES = !!process.env.CF_PAGES;
// Hosted build (Vercel or Pages): a localhost API can't be reached there.
const HOSTED = !!(process.env.VERCEL || process.env.CF_PAGES);

function writePage(pg) {
  const rel = pg.path.replace(/^\//, "");
  if (ON_PAGES) {
    const file = path.join(buildDir, `${rel}.html`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, pageHtml(pg));
    return;
  }
  const dir = path.join(buildDir, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), pageHtml(pg));
}

// Live courses/internships from the backend (REACT_APP_API_URL — the same
// variable the app is built with). The backend's free host sleeps when idle
// and can take ~30-60s to wake, so this waits up to 60s and retries once. If
// it still can't be reached, the build carries on without course pages (they
// then fall back to app.html, like any other address) instead of failing.
async function livePrograms() {
  const api = process.env.REACT_APP_API_URL;
  if (!api || (HOSTED && /localhost|127\.0\.0\.1/.test(api))) return [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(`${api.replace(/\/+$/, "")}/courses`, { signal: ctrl.signal });
      const json = await res.json();
      return (json.ok && Array.isArray(json.courses) ? json.courses : [])
        // Training + Internship tracks only — courses were dropped.
        .filter((c) => c && c.type === "internship" && typeof c.slug === "string" && /^[a-z0-9-]+$/.test(c.slug) && typeof c.title === "string" && c.title.trim());
    } catch (e) {
      console.warn(`prerender-meta: courses fetch attempt ${attempt} failed (${e.name === "AbortError" ? "timed out" : e.message})`);
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

// Every plan priced at ₹0 — must match isFreeProgram() in src/utils/tiers.js.
// The Training + Internship page only lists paid programs, so free ones stay out of the sitemap.
function isFreeProgram(c) {
  const plans = (Array.isArray(c.tiers) ? c.tiers : []).filter((t) => t && t.price != null);
  return plans.length > 0 && plans.every((t) => !t.price);
}

// Open job roles from the backend, for the Careers page's JobPosting markup. Same
// wake-up allowance as livePrograms(), one try: without them the page is still
// written, and the app adds the markup itself once it loads.
async function liveOpenings() {
  const api = process.env.REACT_APP_API_URL;
  if (!api || (HOSTED && /localhost|127\.0\.0\.1/.test(api))) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(`${api.replace(/\/+$/, "")}/careers/openings`, { signal: ctrl.signal });
    const json = await res.json();
    if (json.ok && json.terms) {
      const amount = Number(json.terms.signupBonus);
      const usage = Number(json.terms.creditUsagePercent);
      signupTerms = { amount: Number.isFinite(amount) ? amount : signupTerms.amount, usagePercent: Number.isFinite(usage) ? usage : signupTerms.usagePercent };
    }
    return (json.ok && Array.isArray(json.openings) ? json.openings : []).filter((o) => o && typeof o.title === "string" && o.title.trim());
  } catch (e) {
    console.warn(`prerender-meta: openings fetch failed (${e.name === "AbortError" ? "timed out" : e.message})`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// schema.org JobPosting for one opening — must match jobPostingLd() in
// src/pages/Careers.jsx, which the app uses.
function jobPostingLd(o) {
  const lines = (title, items) => (Array.isArray(items) && items.length ? `<p><strong>${title}</strong></p><ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "");
  return {
    "@type": "JobPosting",
    title: o.title,
    description: `<p>${o.summary || o.title}</p>${lines("Responsibilities", o.responsibilities)}${lines("Eligibility", o.eligibility)}${lines("Skills", o.skills)}`,
    datePosted: String(o.createdAt || "").slice(0, 10) || undefined,
    employmentType: "INTERN",
    hiringOrganization: { "@type": "Organization", name: "Crix Technology", sameAs: seo.siteUrl, logo: `${seo.siteUrl}/crix-logo.png` },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Ahmedabad", addressRegion: "Gujarat", addressCountry: "IN" } },
    jobLocationType: "TELECOMMUTE",
    applicantLocationRequirements: { "@type": "Country", name: "India" },
    baseSalary: { "@type": "MonetaryAmount", currency: "INR", value: { "@type": "QuantitativeValue", minValue: 0, maxValue: 6000, unitText: "MONTH" } },
    experienceRequirements: o.experience || undefined,
    skills: (Array.isArray(o.skills) ? o.skills : []).join(", ") || undefined,
    directApply: true,
    url: url("/careers"),
  };
}

// The same for a Free Internship role — must match freeJobPostingLd in
// src/pages/FreeInternships.jsx. Unpaid (no baseSalary) and applied for
// through our Google Form (not directApply).
function freeJobPostingLd(o) {
  const lines = (title, items) => (Array.isArray(items) && items.length ? `<p><strong>${title}</strong></p><ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "");
  return {
    "@type": "JobPosting",
    title: o.title,
    description: `<p>${o.summary}</p>${lines("Responsibilities", o.responsibilities)}${lines("Eligibility", o.eligibility)}${lines("Skills", o.skills)}`
      + `<p>Free internship: no fee to apply, no stipend. Duration: ${o.duration}. Mode: ${o.mode}. Expected start: ${o.startsOn}.</p>`,
    datePosted: o.datePosted,
    employmentType: "INTERN",
    hiringOrganization: { "@type": "Organization", name: "Crix Technology", sameAs: seo.siteUrl, logo: `${seo.siteUrl}/crix-logo.png` },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Ahmedabad", addressRegion: "Gujarat", addressCountry: "IN" } },
    jobLocationType: "TELECOMMUTE",
    applicantLocationRequirements: { "@type": "Country", name: "India" },
    experienceRequirements: o.experience || undefined,
    skills: (Array.isArray(o.skills) ? o.skills : []).join(", ") || undefined,
    directApply: false,
    url: url("/free-internships"),
  };
}
const openFreeRoles = freeInternships.openings.filter((o) => !(o.positions && o.positions.left === 0));

(async () => {
  // 1. The static pages from seo.json.
  let written = 0;
  const openings = await liveOpenings();
  // Every role is free to apply for, so each gets JobPosting markup — must match the Careers page.
  const freeOpenings = openings;
  for (const [p, r] of Object.entries(seo.routes)) {
    if (p === "/") continue; // build/index.html already carries the home page's tags
    writePage({
      path: p,
      title: r.title,
      description: r.description,
      h1: r.title.replace(/\s*\|\s*Crix Technology.*$/, ""),
      keywords: r.keywords,
      crumbs: r.crumb ? [{ name: "Home", path: "/" }, { name: r.crumb, path: p }] : null,
      // Same id as the app's useJsonLd("jobs-jsonld") on the Careers page.
      ld: p === "/careers" && freeOpenings.length ? [{ id: "jobs-jsonld", data: { "@context": "https://schema.org", "@graph": freeOpenings.map(jobPostingLd) } }]
        // Same id as the app's useJsonLd("free-jobs-jsonld") on the Free Internship page.
        : p === "/free-internships" && openFreeRoles.length ? [{ id: "free-jobs-jsonld", data: { "@context": "https://schema.org", "@graph": openFreeRoles.map(freeJobPostingLd) } }]
        : undefined,
    });
    written++;
  }

  // 2. One page per live course/internship.
  const programs = await livePrograms();
  for (const c of programs) {
    const p = `/programs/${c.slug}`;
    const kind = c.type === "internship" ? "Training + Internship" : "Course";
    const name = programTitle(c);
    // Same text as programDescription() / programSeoTitle() in src/hooks/usePageMeta.js.
    const description = clip(programDescription(c));
    writePage({
      path: p,
      title: programSeoTitle(c),
      description,
      h1: `${kind}: ${name}`,
      keywords: programKeywords(c),
      crumbs: [{ name: "Home", path: "/" }, { name: "Training + Internship", path: "/training-internship" }, { name, path: p }],
      ld: [{
        id: "course-jsonld", // same id as useCourseJsonLd in the app
        data: {
          "@context": "https://schema.org",
          "@type": "Course",
          name,
          description: c.desc || c.title,
          url: url(p),
          provider: { "@type": "Organization", name: "Crix Technology", url: seo.siteUrl },
          hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", ...(c.durationDays ? { courseWorkload: `P${c.durationDays}D` } : {}) },
          keywords: programKeywords(c).join(", "),
        },
      }],
    });
    written++;
  }

  // 3. Fallback for every other address. It must NOT claim the home page's
  //    canonical/og:url — that would tell crawlers each such page is a
  //    duplicate of the home page. The app sets the right ones once it runs.
  const appHtml = template
    .replace(/\s*<link rel="canonical"[^>]*>/, "")
    .replace(/\s*<meta property="og:url"[^>]*>/, "")
    .replace(/\s*<meta name="keywords"[^>]*>/, "");
  if (/rel="canonical"|property="og:url"/.test(appHtml)) throw new Error("prerender-meta: couldn't strip canonical/og:url from app.html");
  fs.writeFileSync(path.join(buildDir, "app.html"), appHtml);
  // Pages: an address with no file (a mistyped link, a program created after
  // this build) gets the app as its 404 page, so the app still opens it.
  // Without a 404.html, Pages would answer such addresses with the home page.
  if (ON_PAGES) fs.writeFileSync(path.join(buildDir, "404.html"), appHtml);

  // 4. Sitemap: the static pages plus every live Training + Internship program's
  // page — one per duration (1 / 2 / 3 / 6 months), since each is its own card and page.
  const today = new Date().toISOString().slice(0, 10);
  const entries = [
    ...Object.entries(seo.routes).map(([p, r]) => ({ loc: url(p), freq: r.changefreq || "monthly", pri: r.priority || "0.5" })),
    // Only Training + Internship programs are listed on the site now — courses stay out.
    // A program's lastmod is when it was last edited in Admin, not the build date,
    // so search engines can tell which pages really changed.
    ...programs.filter((c) => c.type === "internship" && !isFreeProgram(c)).map((c) => ({
      loc: url(`/programs/${c.slug}`), freq: "weekly", pri: "0.8",
      mod: /^\d{4}-\d{2}-\d{2}/.test(String(c.updatedAt || "")) ? String(c.updatedAt).slice(0, 10) : undefined,
    })),
  ];
  fs.writeFileSync(path.join(buildDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/prerender-meta.js on each build: the pages in
     src/data/seo.json, plus the page of every live Training + Internship
     program (one per duration) when the backend was reachable at build time. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${e.loc}</loc><lastmod>${e.mod || today}</lastmod><changefreq>${e.freq}</changefreq><priority>${e.pri}</priority></url>`).join("\n")}
</urlset>
`);
  console.log(`prerender-meta: wrote ${written} page files (${programs.length} course/internship pages) + app.html + sitemap.xml (${entries.length} URLs)`);
})().catch((e) => { console.error(e); process.exit(1); });
