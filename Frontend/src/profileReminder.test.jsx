import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import { Navbar } from "./components/ui.jsx";
import * as api from "./services/api.js";

// The floating "add your details" reminder for students whose profile can't buy yet.
jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.resetAllMocks();
  window.sessionStorage.clear();
  api.getMyPaymentRequests.mockResolvedValue({ ok: true, requests: [] });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const banner = () => document.body.querySelector(".profile-reminder");
async function render(user, path = "/") {
  // A fresh router each time, so the address really changes.
  act(() => root.unmount());
  root = createRoot(container);
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user, isLoggedIn: !!user, isAdmin: false, logout: jest.fn(), openAuthModal: jest.fn() }}>
        <MemoryRouter initialEntries={[path]}><Navbar /></MemoryRouter>
      </UserContext.Provider>
    );
  });
}

it("reminds a student with no phone or a placeholder name, linking to Profile", async () => {
  await render({ name: "Rahul Sharma", email: "rahul@example.com", phone: "", profilePending: true });
  expect(banner().textContent).toContain("Add your full name and phone number");
  expect(banner().querySelector("a").getAttribute("href")).toBe("/profile?reason=complete");
});

it("stays away from a complete profile, from Profile itself, and once dismissed", async () => {
  await render({ name: "Asha Mehta", email: "asha@example.com", phone: "+919876543210" });
  expect(banner()).toBeNull();

  await render({ name: "Asha", email: "asha@example.com", phone: "" }, "/profile");
  expect(banner()).toBeNull();

  await render({ name: "Asha", email: "asha@example.com", phone: "" });
  expect(banner().textContent).toContain("Add your phone number — you'll need it to buy");
  await act(async () => { banner().querySelector("button").click(); });
  expect(banner()).toBeNull();
  expect(window.sessionStorage.getItem("crix_profile_reminder")).toBe("1");
});
