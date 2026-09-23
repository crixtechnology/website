// Hover/focus prefetching for the lazily-loaded routes. App.jsx registers each
// lazy route's import() here; Chrome (ui.jsx) calls prefetchRoute(pathname)
// when a pointer or keyboard focus lands on an internal link, so the page's
// code is already downloaded by the time the link is clicked. import() is
// cached by the bundler, so calling a loader twice costs nothing.
const loaders = [];
const started = new Set();

export function registerPrefetch(map) {
  Object.entries(map).forEach(([prefix, load]) => loaders.push([prefix, load]));
}

export function prefetchRoute(pathname) {
  if (!pathname) return;
  for (const [prefix, load] of loaders) {
    const hit = prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix;
    if (hit && !started.has(prefix)) {
      started.add(prefix);
      load().catch(() => started.delete(prefix)); // retry on a later hover if it failed
    }
  }
}
