import { useEffect } from "react";

// Every route used to inherit the exact same <title> and meta description
// from public/index.html (whatever the homepage's were) — a course page,
// About, Contact, even the admin panel all showed identical browser-tab
// text and identical link-preview descriptions. This gives each page its
// own, set on mount/update and left in place until the next page sets its
// own (SPA navigation never reloads index.html, so nothing else resets it).
// Callers pass the full title they want (e.g. "About Us | Crix Technology")
// — no implicit suffixing, so the homepage can keep its own full brand title.
export function usePageMeta({ title, description }) {
  useEffect(() => {
    if (title) document.title = title;

    if (description) {
      let tag = document.querySelector('meta[name="description"]');
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", "description");
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", description);
    }
  }, [title, description]);
}
