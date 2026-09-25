import { useEffect } from "react";

// While `active`, sets <meta name="robots" content="noindex">, and restores the
// previous value afterwards. The site is a single-page app whose host answers every address
// with the same 200 page, so a "not found" screen can't say 404 in the HTTP status;
// this is how search engines are told it isn't a real page. public/index.html
// already has a robots tag ("index, follow, ..."), so this updates that one
// rather than adding a second, conflicting tag.
export function useNoIndex(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    let meta = document.querySelector('meta[name="robots"]');
    const created = !meta;
    const previous = meta ? meta.getAttribute("content") : null;
    if (created) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "noindex");
    return () => {
      if (created) { if (meta.parentNode) meta.parentNode.removeChild(meta); }
      else meta.setAttribute("content", previous);
    };
  }, [active]);
}
