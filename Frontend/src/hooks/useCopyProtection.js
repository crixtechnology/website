import { useEffect } from "react";

// Where copying is still allowed: anything the visitor types into (forms),
// contact details they need to reach us, and anything marked .allow-copy.
const ALLOWED = 'input, textarea, select, [contenteditable="true"], a[href^="mailto:"], a[href^="tel:"], .allow-copy';

function allowedTarget(node) {
  const el = node && (node.nodeType === 1 ? node : node.parentElement);
  return !!(el && el.closest && el.closest(ALLOWED));
}

// Discourages copying the site's text: no selecting (CSS, see .no-copy in
// global.css), no copy/cut of a selection, no right-click menu, and no
// dragging images out. Off on the admin pages, where the admin needs to copy
// student details. This only deters casual copying — anyone determined can
// still read the page source; there is no way for a website to fully prevent that.
export function useCopyProtection(enabled) {
  useEffect(() => {
    const body = document.body;
    if (!enabled) { body.classList.remove("no-copy"); return undefined; }
    body.classList.add("no-copy");

    const onCopy = (e) => {
      const sel = window.getSelection && window.getSelection();
      if (allowedTarget(e.target) || (sel && allowedTarget(sel.anchorNode) && allowedTarget(sel.focusNode))) return;
      e.preventDefault();
    };
    const onContextMenu = (e) => { if (!allowedTarget(e.target)) e.preventDefault(); };
    const onDragStart = (e) => { if (e.target && e.target.tagName === "IMG") e.preventDefault(); };

    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);
    return () => {
      body.classList.remove("no-copy");
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
    };
  }, [enabled]);
}
