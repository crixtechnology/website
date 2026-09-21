import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import App from "./App.jsx";

// An address the site doesn't have gets a real "not found" page — not the home page
// under a wrong URL — and search engines are told not to index it.
jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const renderAt = (path) => act(async () => { root.render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); });
const noindex = () => document.head.querySelector('meta[name="robots"][content="noindex"]');

describe("unknown addresses", () => {
  it("show a 404 page with a way back, and are kept out of search results", async () => {
    await renderAt("/no-such-page");
    expect(container.textContent).toContain("We can't find that page.");
    expect(container.textContent).toContain("Crix Technology is still here to help");
    // The brand's logo is on the page itself (not just the small one in the header), and links home.
    const logo = container.querySelector("main .logo");
    expect(logo).not.toBeNull();
    expect(logo.textContent).toContain("CRIX");
    expect(logo.querySelector('img[src="/logo-icon.png"]')).not.toBeNull();
    expect(logo.closest("a").getAttribute("href")).toBe("/");
    expect(container.querySelector('a[href="/"]')).not.toBeNull();
    expect(container.querySelector('a[href="/programs"]')).not.toBeNull();
    expect(container.querySelector('a[href="/contact"]')).not.toBeNull();
    expect(document.title).toMatch(/Page not found/);
    expect(noindex()).not.toBeNull();
  });

  it("also cover deep made-up paths, including admin-looking ones", async () => {
    await renderAt("/admin/definitely/not/here/at/all");
    expect(container.textContent).toContain("We can't find that page.");
  });

  it("take the noindex tag away again when the page goes", async () => {
    await renderAt("/no-such-page");
    expect(noindex()).not.toBeNull();
    act(() => root.unmount());
    expect(noindex()).toBeNull();
    root = createRoot(container); // afterEach unmounts whatever is current
  });

  it("leave real pages alone", async () => {
    await renderAt("/contact");
    expect(container.textContent).toContain("Ready to build with us?");
    expect(container.textContent).not.toContain("We can't find that page.");
    expect(noindex()).toBeNull();
  });
});
