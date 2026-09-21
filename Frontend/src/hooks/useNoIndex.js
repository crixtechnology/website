import { useEffect } from "react";

// While `active`, adds <meta name="robots" content="noindex"> to the page, and removes
// it again afterwards. The site is a single-page app whose host answers every address
// with the same 200 page, so a "not found" screen can't say 404 in the HTTP status;
// this is how search engines are told it isn't a real page.
export function useNoIndex(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => { if (meta.parentNode) meta.parentNode.removeChild(meta); };
  }, [active]);
}
