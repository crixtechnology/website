import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import { SignupBonusPopup } from "./components/ui.jsx";

global.IS_REACT_ACT_ENVIRONMENT = true;
let container;
let root;
beforeEach(() => {
  jest.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

const show = (ctx, bonus = 300) => {
  act(() => {
    root.render(<UserContext.Provider value={ctx}><MemoryRouter><SignupBonusPopup bonus={bonus} /></MemoryRouter></UserContext.Provider>);
  });
  act(() => { jest.advanceTimersByTime(1000); });
};

it("tells a logged-out visitor about the signup bonus, and opens login from its button", () => {
  const openAuthModal = jest.fn();
  show({ isLoggedIn: false, openAuthModal });
  const box = container.querySelector(".bonus-modal");
  expect(box.textContent).toMatch(/₹\s?300/);
  act(() => { box.querySelector(".buy-btn").click(); });
  expect(openAuthModal).toHaveBeenCalledWith("login");
  expect(container.querySelector(".bonus-modal")).toBeNull();
});

it("shows again on every visit while logged out, after being closed", () => {
  show({ isLoggedIn: false });
  act(() => { container.querySelector(".modal-close").click(); });
  expect(container.querySelector(".bonus-modal")).toBeNull();
  act(() => root.render(<div />));
  show({ isLoggedIn: false });
  expect(container.querySelector(".bonus-modal")).not.toBeNull();
});

it("never shows when logged in or when the bonus is 0", () => {
  show({ isLoggedIn: true });
  expect(container.querySelector(".bonus-modal")).toBeNull();
  show({ isLoggedIn: false }, 0);
  expect(container.querySelector(".bonus-modal")).toBeNull();
});

it("closes when the visitor logs in", () => {
  show({ isLoggedIn: false });
  expect(container.querySelector(".bonus-modal")).not.toBeNull();
  show({ isLoggedIn: true });
  expect(container.querySelector(".bonus-modal")).toBeNull();
});

// Someone who already has an account (they've logged in on this browser before)
// is only logged out — the "Sign up & claim" offer isn't for them.
it("doesn't show to a returning student who has logged in on this browser before", () => {
  window.localStorage.setItem("crix_has_account", "1");
  try {
    show({ isLoggedIn: false });
    expect(container.querySelector(".bonus-modal")).toBeNull();
  } finally {
    window.localStorage.removeItem("crix_has_account");
  }
});

it("remembers the account once someone logs in", () => {
  const { setStoredUser, hasAccountOnThisDevice } = require("./services/api.js");
  window.localStorage.removeItem("crix_has_account");
  expect(hasAccountOnThisDevice()).toBe(false);
  setStoredUser({ name: "Asha" });
  expect(hasAccountOnThisDevice()).toBe(true);
  setStoredUser(null); // logging out keeps the flag
  expect(hasAccountOnThisDevice()).toBe(true);
  window.localStorage.removeItem("crix_has_account");
});
