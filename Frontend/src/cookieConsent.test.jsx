// Google Analytics loads only after the visitor accepts it in the cookie
// banner; declining (now or later) keeps it off and clears its cookies.
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let analytics;
let CookieConsent;
let R; // React and friends, from the same fresh module registry as the code under test

// analytics.js reads the measurement ID when it loads, so each test loads fresh
// copies — of React too, so the component and the renderer share one.
function load(gaId) {
  jest.resetModules();
  if (gaId) process.env.REACT_APP_GA_MEASUREMENT_ID = gaId;
  else delete process.env.REACT_APP_GA_MEASUREMENT_ID;
  R = { React: require("react"), createRoot: require("react-dom/client").createRoot, MemoryRouter: require("react-router-dom").MemoryRouter };
  analytics = require("./utils/analytics.js");
  CookieConsent = require("./components/CookieConsent.jsx").default;
  root = R.createRoot(container);
}
const act = (fn) => R.React.act(fn);

const gaScripts = () => document.head.querySelectorAll('script[src*="googletagmanager.com"]');
const render = () => act(async () => { root.render(R.React.createElement(R.MemoryRouter, null, R.React.createElement(CookieConsent))); });
const button = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent === text);

beforeEach(() => {
  window.localStorage.clear();
  gaScripts().forEach((s) => s.remove());
  delete window.gtag;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
});
afterEach(() => {
  if (root) act(() => root.unmount());
  container.remove();
  delete process.env.REACT_APP_GA_MEASUREMENT_ID;
});

describe("cookie consent", () => {
  it("asks nothing when analytics isn't set up", async () => {
    load("");
    analytics.initAnalytics();
    await render();
    expect(container.textContent).toBe("");
    expect(gaScripts()).toHaveLength(0);
  });

  it("loads nothing until the visitor accepts, then starts analytics", async () => {
    load("G-TEST12345");
    analytics.initAnalytics();
    await render();
    expect(container.textContent).toContain("Cookies on this site");
    expect(gaScripts()).toHaveLength(0);
    analytics.trackEvent("begin_checkout");
    expect(window.gtag).toBeUndefined();

    await act(async () => { button("Accept analytics").click(); });
    expect(container.textContent).toBe("");
    expect(window.localStorage.getItem(analytics.CONSENT_KEY)).toBe("granted");
    expect(gaScripts()).toHaveLength(1);
    expect(typeof window.gtag).toBe("function");
  });

  it("keeps analytics off when declined, and lets the visitor change their mind later", async () => {
    load("G-TEST12345");
    await render();
    await act(async () => { button("Decline").click(); });
    expect(window.localStorage.getItem(analytics.CONSENT_KEY)).toBe("denied");
    expect(gaScripts()).toHaveLength(0);
    expect(container.textContent).toBe("");

    // "Cookie settings" in the footer brings the banner back, saying what they chose.
    await act(async () => { analytics.openCookieSettings(); });
    expect(container.textContent).toContain("currently declined");
    await act(async () => { button("Accept analytics").click(); });
    expect(gaScripts()).toHaveLength(1);
  });

  it("remembers a yes on the next visit, and a later no clears Google Analytics cookies", async () => {
    window.localStorage.setItem("crix_analytics_consent", "granted");
    load("G-TEST12345");
    analytics.initAnalytics();
    await render();
    expect(container.textContent).toBe(""); // already answered: no banner
    expect(gaScripts()).toHaveLength(1);

    document.cookie = "_ga=GA1.1.123; path=/";
    document.cookie = "_ga_TEST12345=GS1.1.456; path=/";
    analytics.setAnalyticsConsent("denied");
    expect(document.cookie).not.toMatch(/_ga/);
    expect(window["ga-disable-G-TEST12345"]).toBe(true);
  });
});
