import { act } from "react";
import { createRoot } from "react-dom/client";
import { UserContext } from "./context/UserContext.jsx";
import { AuthModal, Chrome } from "./components/ui.jsx";
import * as api from "./services/api.js";

jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.resetAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const q = (sel) => container.querySelector(sel);
const fill = (el, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("messages inside a popup", () => {
  it("appear in the popup's form (not floating over its heading at the top of the screen)", async () => {
    const value = { authModal: { mode: "login" }, closeAuthModal: jest.fn(), login: jest.fn().mockResolvedValue({ ok: false, error: "Invalid credentials" }), signup: jest.fn(), loginWithGoogle: jest.fn(), sessionExpired: false };
    await act(async () => { root.render(<UserContext.Provider value={value}><AuthModal /></UserContext.Provider>); });
    await act(async () => { fill(q("#auth-email"), "someone@example.com"); });
    await act(async () => { fill(q("#auth-password"), "wrong-password"); });
    await act(async () => { q("#auth-password").closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });

    const msg = q(".modal-box .alert-inline.alert-error");
    expect(msg).not.toBeNull();
    expect(msg.textContent).toContain("Invalid credentials");
    expect(msg.getAttribute("role")).toBe("alert");
    // ...and nothing was portaled out to <body> as a floating toast.
    expect(document.body.querySelectorAll(":scope > .alert").length).toBe(0);
  });

  it("keeps the 'signed out for inactivity' notice inside the popup too", async () => {
    const value = { authModal: { mode: "login" }, closeAuthModal: jest.fn(), login: jest.fn(), signup: jest.fn(), loginWithGoogle: jest.fn(), sessionExpired: true };
    await act(async () => { root.render(<UserContext.Provider value={value}><AuthModal /></UserContext.Provider>); });
    expect(q(".modal-box .alert-inline")).not.toBeNull();
  });
});

describe("back-to-top button", () => {
  const scrollTo = (y) => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
    act(() => { window.dispatchEvent(new Event("scroll")); });
  };
  const setWidth = (w) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
  const btn = () => q("#toTop");
  const shown = () => btn().classList.contains("show");

  beforeEach(async () => {
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
    api.getMyReferral && api.getMyReferral.mockResolvedValue({ ok: false });
  });

  it("on a phone: shows only while scrolling UP, hides again on the way down", async () => {
    setWidth(375);
    await act(async () => { root.render(<Chrome />); });
    expect(shown()).toBe(false);
    scrollTo(1500); // reading downward
    expect(shown()).toBe(false);
    scrollTo(1300); // heading back up
    expect(shown()).toBe(true);
    scrollTo(1500); // down again
    expect(shown()).toBe(false);
    scrollTo(200); // near the top: never
    expect(shown()).toBe(false);
  });

  it("on a wide screen: shows once you're past the fold, whichever way you scroll", async () => {
    setWidth(1280);
    await act(async () => { root.render(<Chrome />); });
    scrollTo(1500);
    expect(shown()).toBe(true);
    scrollTo(100);
    expect(shown()).toBe(false);
  });

  it("is out of the tab order and hidden from screen readers while invisible", async () => {
    setWidth(1280);
    await act(async () => { root.render(<Chrome />); });
    expect(btn().getAttribute("tabindex")).toBe("-1");
    expect(btn().getAttribute("aria-hidden")).toBe("true");
    scrollTo(1500);
    expect(btn().getAttribute("tabindex")).toBe("0");
    expect(btn().hasAttribute("aria-hidden")).toBe(false);
  });
});
