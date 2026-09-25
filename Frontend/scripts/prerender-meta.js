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
// Vercel serves real files before applying vercel.json's rewrites, so these
// are picked up automatically; the app itself then boots exactly as before.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");
const seo = JSON.parse(fs.readFileSync(path.join(root, "src", "data", "seo.json"), "utf8"));
const template = fs.readFileSync(path.join(buildDir, "index.html"), "utf8");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const url = (p) => seo.siteUrl + (p === "/" ? "/" : p);
const ldScript = (id, data) => `<script type="application/ld+json" id="${id}">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
// Meta descriptions over ~160 characters get cut off in results: trim at a word boundary.
const clip = (s, n = 158) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n - 1)).replace(/[,;:\s—–-]+$/, "") + "…"; };

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

function writePage(pg) {
  const dir = path.join(buildDir, pg.path.replace(/^\//, ""));
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
  if (!api || (process.env.VERCEL && /localhost|127\.0\.0\.1/.test(api))) return [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(`${api.replace(/\/+$/, "")}/courses`, { signal: ctrl.signal });
      const json = await res.json();
      return (json.ok && Array.isArray(json.courses) ? json.courses : [])
        .filter((c) => c && typeof c.slug === "string" && /^[a-z0-9-]+$/.test(c.slug) && typeof c.title === "string" && c.title.trim());
    } catch (e) {
      console.warn(`prerender-meta: courses fetch attempt ${attempt} failed (${e.name === "AbortError" ? "timed out" : e.message})`);
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

(async () => {
  // 1. The static pages from seo.json.
  let written = 0;
  for (const [p, r] of Object.entries(seo.routes)) {
    if (p === "/") continue; // build/index.html already carries the home page's tags
    writePage({
      path: p,
      title: r.title,
      description: r.description,
      h1: r.title.replace(/\s*\|\s*Crix Technology.*$/, ""),
      crumbs: r.crumb ? [{ name: "Home", path: "/" }, { name: r.crumb, path: p }] : null,
    });
    written++;
  }

  // 2. One page per live course/internship.
  const programs = await livePrograms();
  for (const c of programs) {
    const p = `/programs/${c.slug}`;
    const kind = c.type === "internship" ? "Internship" : "Course";
    const description = clip(c.desc ? `${c.desc} Online ${kind.toLowerCase()} by Crix Technology.` : `${c.title} — online ${kind.toLowerCase()} by Crix Technology, Ahmedabad.`);
    writePage({
      path: p,
      title: `${c.title} | Crix Technology`,
      description,
      h1: `${c.title} — ${kind}`,
      crumbs: [{ name: "Home", path: "/" }, { name: "Internships & Courses", path: "/programs" }, { name: c.title, path: p }],
      ld: [{
        id: "course-jsonld", // same id as useCourseJsonLd in the app
        data: {
          "@context": "https://schema.org",
          "@type": "Course",
          name: c.title,
          description: c.desc || c.title,
          url: url(p),
          provider: { "@type": "Organization", name: "Crix Technology", url: seo.siteUrl },
          hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", ...(c.durationDays ? { courseWorkload: `P${c.durationDays}D` } : {}) },
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
    .replace(/\s*<meta property="og:url"[^>]*>/, "");
  if (/rel="canonical"|property="og:url"/.test(appHtml)) throw new Error("prerender-meta: couldn't strip canonical/og:url from app.html");
  fs.writeFileSync(path.join(buildDir, "app.html"), appHtml);

  // 4. Sitemap: the static pages plus every live course/internship page.
  const today = new Date().toISOString().slice(0, 10);
  const entries = [
    ...Object.entries(seo.routes).map(([p, r]) => ({ loc: url(p), freq: r.changefreq || "monthly", pri: r.priority || "0.5" })),
    ...programs.map((c) => ({ loc: url(`/programs/${c.slug}`), freq: "weekly", pri: "0.8" })),
  ];
  fs.writeFileSync(path.join(buildDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/prerender-meta.js on each build: the pages in
     src/data/seo.json, plus every live course/internship page when the
     backend was reachable at build time. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${e.loc}</loc><lastmod>${today}</lastmod><changefreq>${e.freq}</changefreq><priority>${e.pri}</priority></url>`).join("\n")}
</urlset>
`);
  console.log(`prerender-meta: wrote ${written} page files (${programs.length} course/internship pages) + app.html + sitemap.xml (${entries.length} URLs)`);
})().catch((e) => { console.error(e); process.exit(1); });
