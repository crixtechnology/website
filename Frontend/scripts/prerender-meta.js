// Runs after `npm run build` (the "postbuild" script in package.json).
//
// This is a single-page app: every address is answered with the same
// build/index.html, so a crawler that doesn't run JavaScript (Bing, LinkedIn,
// WhatsApp/Facebook link previews, ...) sees the home page's title and
// description on every page. For each public page in src/data/seo.json this
// writes build/<page>/index.html — the same app, with that page's own title,
// description, canonical URL, social tags, breadcrumb markup and no-JS
// fallback text baked into the HTML. vercel.json serves those files for their
// paths; the app itself then boots exactly as before.
//
// It also regenerates build/sitemap.xml from the same list (with today's date).
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");
const seo = JSON.parse(fs.readFileSync(path.join(root, "src", "data", "seo.json"), "utf8"));
const template = fs.readFileSync(path.join(buildDir, "index.html"), "utf8");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const url = (p) => seo.siteUrl + (p === "/" ? "/" : p);

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

function pageHtml(p, r) {
  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(r.title)}</title>`);
  html = setAttr(html, /<meta name="description"[^>]*>/, "content", r.description, "meta description");
  html = setAttr(html, /<link rel="canonical"[^>]*>/, "href", url(p), "canonical");
  html = setAttr(html, /<meta property="og:url"[^>]*>/, "content", url(p), "og:url");
  html = setAttr(html, /<meta property="og:title"[^>]*>/, "content", r.title, "og:title");
  html = setAttr(html, /<meta property="og:description"[^>]*>/, "content", r.description, "og:description");
  html = setAttr(html, /<meta name="twitter:title"[^>]*>/, "content", r.title, "twitter:title");
  html = setAttr(html, /<meta name="twitter:description"[^>]*>/, "content", r.description, "twitter:description");
  html = html.replace(/<h1 id="seo-h1">[\s\S]*?<\/h1>/, `<h1 id="seo-h1">${esc(r.title.replace(/\s*\|\s*Crix Technology.*$/, ""))}</h1>`);
  html = html.replace(/<p id="seo-desc">[\s\S]*?<\/p>/, `<p id="seo-desc">${esc(r.description)}</p>`);
  if (r.crumb) {
    const crumbs = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: url("/") },
        { "@type": "ListItem", position: 2, name: r.crumb, item: url(p) },
      ],
    };
    // Same id the app uses (usePageMeta's useJsonLd), so it replaces this one instead of adding a second.
    html = html.replace("</head>", `<script type="application/ld+json" id="breadcrumb-jsonld">${JSON.stringify(crumbs).replace(/</g, "\\u003c")}</script></head>`);
  }
  return html;
}

let pages = 0;
for (const [p, r] of Object.entries(seo.routes)) {
  if (p === "/") continue; // build/index.html already carries the home page's tags
  const dir = path.join(buildDir, p.replace(/^\//, ""));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), pageHtml(p, r));
  pages++;
}

// build/app.html: the fallback vercel.json serves for every other address
// (course pages /programs/:slug, student/admin pages, unknown URLs). It must
// NOT claim the home page's canonical/og:url — that would tell crawlers each
// course page is a duplicate of the home page. The app sets the right ones
// for the actual page once it runs (src/hooks/usePageMeta.js).
const appHtml = template
  .replace(/\s*<link rel="canonical"[^>]*>/, "")
  .replace(/\s*<meta property="og:url"[^>]*>/, "");
if (/rel="canonical"|property="og:url"/.test(appHtml)) throw new Error("prerender-meta: couldn't strip canonical/og:url from app.html");
fs.writeFileSync(path.join(buildDir, "app.html"), appHtml);

// Individual course/internship pages (/programs/:slug) come from the live
// backend, so they're only listed when the API is reachable at build time
// (REACT_APP_API_URL, same variable the app uses). If it isn't — no backend
// deployed yet, a network hiccup — the sitemap is still written without them
// rather than failing the build; crawlers also find them via /programs.
async function liveProgramPaths() {
  const api = process.env.REACT_APP_API_URL;
  if (!api || /localhost|127\.0\.0\.1/.test(api) && process.env.VERCEL) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${api.replace(/\/+$/, "")}/courses`, { signal: ctrl.signal });
    const json = await res.json();
    return (json.ok && Array.isArray(json.courses) ? json.courses : [])
      .filter((c) => c && typeof c.slug === "string" && /^[a-z0-9-]+$/.test(c.slug))
      .map((c) => `/programs/${c.slug}`);
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const programPaths = await liveProgramPaths();
  const entries = [
    ...Object.entries(seo.routes).map(([p, r]) => ({ loc: url(p), freq: r.changefreq || "monthly", pri: r.priority || "0.5" })),
    ...programPaths.map((p) => ({ loc: url(p), freq: "weekly", pri: "0.8" })),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/prerender-meta.js on each build: the pages in
     src/data/seo.json, plus every live course/internship page when the
     backend was reachable at build time. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${e.loc}</loc><lastmod>${today}</lastmod><changefreq>${e.freq}</changefreq><priority>${e.pri}</priority></url>`).join("\n")}
</urlset>
`;
  fs.writeFileSync(path.join(buildDir, "sitemap.xml"), sitemap);
  console.log(`prerender-meta: wrote ${pages} page files + sitemap.xml (${entries.length} URLs, ${programPaths.length} course/internship pages)`);
})();
