import { useEffect } from "react";

function setMetaTag(attrName, attrValue, content) {
  let tag = document.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attrName, attrValue);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
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
// is optional; defaults to the branded share card (public/og-image.png) when a page doesn't have anything
// more specific to show.
// Callers that pass neither title nor description (e.g. AdminGuard's
// logged-in-and-authorized state, which explicitly wants a no-op so it
// doesn't clobber the wrapped admin page's own usePageMeta call) get a
// genuine no-op — this used to unconditionally rewrite og:image/twitter:
// image/og:url/canonical regardless, so AdminGuard's effect (a parent,
// which per React's child-before-parent effect order runs AFTER the
// wrapped page's own usePageMeta) would reset those straight back to the
// site defaults right after the child page set its own. Harmless today
// only because no page yet passes a custom `image`; real bug waiting for
// the first one that does.
export function usePageMeta({ title, description, image } = {}) {
  useEffect(() => {
    if (!title && !description) return;

    if (title) document.title = title;
    if (description) setMetaTag("name", "description", description);

    if (title) {
      setMetaTag("property", "og:title", title);
      setMetaTag("name", "twitter:title", title);
    }
    if (description) {
      setMetaTag("property", "og:description", description);
      setMetaTag("name", "twitter:description", description);
    }
    const ogImage = image || `${window.location.origin}/og-image.png`;
    setMetaTag("property", "og:image", ogImage);
    setMetaTag("name", "twitter:image", ogImage);
    setMetaTag("property", "og:url", window.location.href);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.href);
  }, [title, description, image]);
}
