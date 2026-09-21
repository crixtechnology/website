// Loaded automatically by `react-scripts test`. jsdom has none of the browser
// APIs the site's animation and scroll code reaches for, so give the component
// tests harmless stand-ins.
// react-router needs these, and jsdom doesn't provide them.
const { TextEncoder, TextDecoder } = require("util");
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  });
}
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
if (!window.IntersectionObserver) window.IntersectionObserver = NoopObserver;
if (!window.ResizeObserver) window.ResizeObserver = NoopObserver;
window.scrollTo = () => {};
