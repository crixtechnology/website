import { useEffect } from "react";
import seo from "../data/seo.json";
import { formatDuration } from "../utils/duration.js";
import { stipendInfo } from "../utils/positions.js";
import { formatINR, maskINR } from "../utils/tiers.js";
import { bonusOff } from "./usePriceText.js";

export const SITE_URL = seo.siteUrl;

function setMetaTag(attrName, attrValue, content) {
  let tag = document.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attrName, attrValue);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

// The one address search engines should credit for the current page: the
// canonical domain (seo.json siteUrl) + the path, never the query string
// (?ref=..., ?buy=...) or #anchor, so those variants all
// consolidate onto a single URL instead of competing as duplicates.
export function canonicalUrl(pathname = window.location.pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
  return SITE_URL + (path === "/" ? "/" : path);
}

// Title/description/breadcrumb for one of the static pages listed in
// src/data/seo.json — the same data scripts/prerender-meta.js bakes into
// each page's HTML after a build.
export function routeMeta(path) {
  const r = seo.routes[path];
  if (!r) return {};
  return {
    title: r.title,
    description: r.description,
    keywords: r.keywords || null,
    crumbs: r.crumb ? [{ name: "Home", path: "/" }, { name: r.crumb, path }] : null,
  };
}

// A program's name with its length, e.g. "MERN Stack Developer — 3 months".
// One domain is sold in several durations under the same title (1 / 2 / 3 / 6
// months), so the title alone gave each duration's page the same <title>, H1
// and description — duplicates in search results. A title that already says
// its length is left as it is. scripts/prerender-meta.js does the same.
export function programTitle(course) {
  if (!course || !course.title) return "";
  const length = formatDuration(course.durationDays);
  if (!length) return course.title;
  const n = String(Number(course.durationDays) / 30);
  const already = new RegExp(`\\b(${n}[\\s-]*months?|${Number(course.durationDays)}[\\s-]*days?)\\b`, "i");
  return already.test(course.title) ? course.title : `${course.title} — ${length}`;
}

// ---------- what search results show (never drawn on the page itself) ----------
// One domain's 1 / 2 / 3 / 6 month programs (and a 6-month version with a paid
// internship) share their visible text, so their search title and snippet are
// told apart by what really differs: length, price and stipend.
// scripts/prerender-meta.js builds the same text for the prebuilt pages.

// The stipend's amount, e.g. "₹3,000 – ₹7,000/month", or "" when there is none.
function paidStipend(course) {
  const s = stipendInfo(course);
  return s && !s.none && s.amount ? `${s.amount}${s.per ? `/${s.per}` : ""}` : "";
}

// The lowest price the program is sold for, as the logged-out page shows it
// (search engines never log in): after the signup bonus (`bonus`, { amount,
// usagePercent } or null) and masked — "₹3XXX9* after the ₹300 signup bonus" — or "".
function lowestPrice(course, bonus) {
  const prices = (Array.isArray(course.tiers) ? course.tiers : []).map((t) => Number(t && t.price)).filter((n) => n > 0);
  if (!prices.length) return "";
  const low = Math.min(...prices);
  const off = bonusOff(low, bonus);
  return off > 0 ? `${maskINR(low - off)} after the ${formatINR(bonus.amount)} signup bonus` : maskINR(low);
}

// The <title> of a program page: "MERN Stack Developer — 6 months + Paid Internship | Crix Technology".
export function programSeoTitle(course) {
  if (!course || !course.title) return "";
  return `${programTitle(course)}${paidStipend(course) ? " + Paid Internship" : ""} | Crix Technology`;
}

// A program page's meta description: its length-qualified name, what sets this
// length apart (price; training and paid-internship months), then its summary.
export function programDescription(course, bonus = null) {
  if (!course || !course.title) return "";
  const desc = String(course.desc || "").trim();
  const price = lowestPrice(course, bonus);
  const stipend = paidStipend(course);
  const months = Math.round(Number(course.durationDays) / 30) || 0;
  const training = Number(course.stipendTrainingMonths) || 0;
  let lead = "";
  if (stipend && months && training > 0 && training < months) {
    lead = `${training} months training + ${months - training} months paid internship (stipend ${stipend}, performance based)${price ? `, ${price}` : ""}.`;
  } else if (stipend) {
    lead = `training + paid internship (stipend ${stipend}, performance based)${price ? `, ${price}` : ""}.`;
  } else if (price) {
    lead = `online training for ${price}, with offer letter, certificate and LOR.`;
  }
  const name = programTitle(course);
  if (!desc) return `${name} — ${lead || "online Training + Internship by Crix Technology, Ahmedabad."}`;
  return lead ? `${name}: ${lead} ${desc}` : `${name}: ${desc}`;
}

// Keywords for one course/internship page, taken only from its own content:
// its name, what kind of program it is, and its listed topics. Kept short.
// (scripts/prerender-meta.js builds the same list for the prebuilt pages.)
export function programKeywords(course) {
  if (!course || !course.title) return [];
  const kind = course.type === "internship" ? "internship" : "course";
  // Skills (what the card shows), else the older points list.
  const source = Array.isArray(course.skills) && course.skills.length ? course.skills : Array.isArray(course.points) ? course.points : [];
  const topics = source
    .filter((p) => typeof p === "string" && p.trim() && p.length <= 60)
    .map((p) => p.replace(/^Capstone:\s*/i, "").trim())
    .slice(0, 6);
  return [...new Set([course.title, `${course.title} ${kind}`, `online ${kind}`, ...topics, "Crix Technology"])];
}

// Adds (and on unmount removes) one JSON-LD structured-data block. `<` is
// escaped so no text inside can close the <script> tag early.
export function useJsonLd(id, data) {
  const json = data ? JSON.stringify(data).replace(/</g, "\\u003c") : "";
  useEffect(() => {
    if (!json) return undefined;
    // The prebuilt page HTML may already carry this block (e.g. the
    // breadcrumb, from scripts/prerender-meta.js) — replace it, don't duplicate.
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    script.textContent = json;
    document.head.appendChild(script);
    return () => { if (script.parentNode) script.parentNode.removeChild(script); };
  }, [id, json]);
}

// Every route used to inherit the exact same <title> and meta description
// from public/index.html (whatever the homepage's were) — a course page,
// About, Contact, even the admin panel all showed identical browser-tab
// text and identical link-preview descriptions. This gives each page its
// own, set on mount/update and left in place until the next page sets its
// own (SPA navigation never reloads index.html, so nothing else resets it).
// Callers pass the full title they want (e.g. "About Us | Crix Technology")
// — no implicit suffixing, so the homepage can keep its own full brand title.
//
// Also drives Open Graph / Twitter Card tags and the canonical link off the
// same title/description — previously every shared link (WhatsApp, Slack,
// Twitter) showed the homepage's own OG tags regardless of which page was
// actually shared, since nothing per-route ever updated them. `image`
// is optional; defaults to the branded share card (public/og-image.png).
// `crumbs` ([{name, path}]) adds a BreadcrumbList for search results.
// Callers that pass neither title nor description (e.g. AdminGuard's
// logged-in-and-authorized state, which explicitly wants a no-op so it
// doesn't clobber the wrapped admin page's own usePageMeta call) get a
// genuine no-op — this used to unconditionally rewrite og:image/twitter:
// image/og:url/canonical regardless, so AdminGuard's effect (a parent,
// which per React's child-before-parent effect order runs AFTER the
// wrapped page's own usePageMeta) would reset those straight back to the
// site defaults right after the child page set its own.
export function usePageMeta({ title, description, image, crumbs, keywords } = {}) {
  const keywordText = Array.isArray(keywords) && keywords.length ? keywords.join(", ") : "";
  useEffect(() => {
    if (!title && !description) return;

    if (title) document.title = title;
    if (description) setMetaTag("name", "description", description);
    // A short page-specific list (seo.json / course topics). A page without
    // one drops the tag, so the previous page's keywords never linger.
    if (keywordText) setMetaTag("name", "keywords", keywordText);
    else document.querySelector('meta[name="keywords"]')?.remove();

    if (title) {
      setMetaTag("property", "og:title", title);
      setMetaTag("name", "twitter:title", title);
    }
    if (description) {
      setMetaTag("property", "og:description", description);
      setMetaTag("name", "twitter:description", description);
    }
    // The share image is loaded from whichever host is serving the page, so
    // previews work on the Vercel address too, not only the final domain.
    const ogImage = image || `${window.location.origin}${seo.image}`;
    setMetaTag("property", "og:image", ogImage);
    setMetaTag("name", "twitter:image", ogImage);
    const url = canonicalUrl();
    setMetaTag("property", "og:url", url);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", url);
  }, [title, description, image, keywordText]);

  useJsonLd("breadcrumb-jsonld", crumbs && crumbs.length > 1 ? {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: canonicalUrl(c.path) })),
  } : null);
}
