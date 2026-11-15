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
  window.sessionStorage.clear();
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

it("shows once per tab after it's closed", () => {
  show({ isLoggedIn: false });
  act(() => { container.querySelector(".modal-close").click(); });
  act(() => root.render(<div />));
  show({ isLoggedIn: false });
  expect(container.querySelector(".bonus-modal")).toBeNull();
});

it("never shows when logged in or when the bonus is 0", () => {
  show({ isLoggedIn: true });
  expect(container.querySelector(".bonus-modal")).toBeNull();
  show({ isLoggedIn: false }, 0);
  expect(container.querySelector(".bonus-modal")).toBeNull();
});
