import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import { InquiryModal } from "./components/ui.jsx";
import * as api from "./services/api.js";

// A Training + Internship payment request can only reach an account, so the
// Request to apply form asks a logged-out visitor to log in or sign up first.
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
afterEach(() => { act(() => root.unmount()); container.remove(); });

const item = { title: "MERN Training", slug: "mern", type: "internship" };
async function render(ctx, kind = "internship") {
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ isLoggedIn: !!ctx.user, isAdmin: false, ...ctx }}>
        <MemoryRouter><InquiryModal item={item} kind={kind} onClose={() => {}} /></MemoryRouter>
      </UserContext.Provider>
    );
  });
}

it("asks a logged-out visitor to log in or sign up before applying for training", async () => {
  const openAuthModal = jest.fn();
  await render({ user: null, openAuthModal });
  expect(document.body.querySelector("#inquiry-name")).toBeNull();
  const btn = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Log in or sign up to apply");
  await act(async () => { btn.click(); });
  expect(openAuthModal).toHaveBeenCalledWith("login");
});

it("fills the form from the account, with its email fixed", async () => {
  await render({ user: { name: "Asha Mehta", email: "asha@example.com", phone: "+919876543210" }, openAuthModal: jest.fn() });
  const email = document.body.querySelector("#inquiry-email");
  expect(email.value).toBe("asha@example.com");
  expect(email.readOnly).toBe(true);
  expect(document.body.querySelector("#inquiry-name").value).toBe("Asha Mehta");
});

it("still lets a guest ask about a course", async () => {
  await render({ user: null, openAuthModal: jest.fn() }, "course");
  expect(document.body.querySelector("#inquiry-name")).not.toBeNull();
});
