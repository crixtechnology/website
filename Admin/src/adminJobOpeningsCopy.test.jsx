import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import AdminJobOpenings from "./pages/admin/AdminJobOpenings.jsx";
import * as api from "./services/api.js";

// Job openings (the Careers page): Copy starts a new role from an existing one,
// so the same role in another duration or batch needs only what differs changed.
jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.resetAllMocks();
  window.scrollTo = jest.fn();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const q = (sel) => container.querySelector(sel);
const qa = (sel) => [...container.querySelectorAll(sel)];
const fill = (el, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const role = {
  _id: "o1", slug: "web-intern", title: "Web Development Intern", audience: "general", status: "open", applicants: 3,
  summary: "Build real features.", techCategory: "frontend", skills: ["React", "CSS"], responsibilities: ["Ship features"], eligibility: ["Any year"],
  stipend: "Up to ₹6,000/month", experience: "Freshers", duration: "3 months", mode: "Remote", startsOn: "15 December",
  positions: { total: 5, filled: 2, left: 3 }, order: 2,
  test: { durationMinutes: 45, questions: 30, marksPerQuestion: 2, cutoffScore: 20, questionCounts: { quantitative: 5, logical: 5, verbal: 5, technical: 15 } },
};

it("copies a Careers role, test settings included, into the form as a new role", async () => {
  api.getAdminToken.mockReturnValue("token");
  api.adminGetJobOpenings.mockResolvedValue({ ok: true, openings: [role], bank: { quantitative: 50, logical: 50, verbal: 50, frontend: 50 } });
  api.adminCreateJobOpening.mockResolvedValue({ ok: true });
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ isLoggedIn: true, isAdmin: true, user: null, logout: jest.fn() }}>
        <MemoryRouter><AdminJobOpenings /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  expect(q("form h3").textContent).toBe("Add a new Careers role");
  await act(async () => { qa(".admin-row button").find((b) => b.textContent === "Copy").click(); });
  expect(q("form h3").textContent).toBe("Add a copy of a Careers role");
  expect(q(".copy-note").textContent).toContain("Web Development Intern");
  expect(q("#jo-title").value).toBe("Web Development Intern");
  expect(q("#jo-positions").value).toBe("5");
  expect(q("#jo-mins").value).toBe("45");
  expect(q("#jo-order").value).toBe("");

  await act(async () => { fill(q("#jo-duration"), "6 months"); });
  await act(async () => { q("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(api.adminUpdateJobOpening).not.toHaveBeenCalled();
  expect(api.adminCreateJobOpening).toHaveBeenCalledTimes(1);
  expect(api.adminCreateJobOpening.mock.calls[0][0]).toMatchObject({
    title: "Web Development Intern", duration: "6 months", skills: ["React", "CSS"], startsOn: "15 December", positions: 5, audience: "general",
    techCategory: "frontend", durationMinutes: 45, marksPerQuestion: 2, cutoffScore: 20,
    questionCounts: { quantitative: 5, logical: 5, verbal: 5, technical: 15 },
  });
  // Back to a blank form, and Cancel is gone.
  expect(q("form h3").textContent).toBe("Add a new Careers role");
  expect(qa("form button").map((b) => b.textContent)).not.toContain("Cancel");
});

it("Cancel drops a copy and leaves the original role alone", async () => {
  api.getAdminToken.mockReturnValue("token");
  api.adminGetJobOpenings.mockResolvedValue({ ok: true, openings: [role], bank: {} });
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ isLoggedIn: true, isAdmin: true, user: null, logout: jest.fn() }}>
        <MemoryRouter><AdminJobOpenings /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  await act(async () => { qa(".admin-row button").find((b) => b.textContent === "Copy").click(); });
  await act(async () => { qa("form button").find((b) => b.textContent === "Cancel").click(); });
  expect(q("#jo-title").value).toBe("");
  expect(q(".copy-note")).toBeNull();
  expect(api.adminCreateJobOpening).not.toHaveBeenCalled();
  expect(api.adminUpdateJobOpening).not.toHaveBeenCalled();
});
