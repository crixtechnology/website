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
  // The page opens on the roles; the form is behind the Add button.
  expect(q("form")).toBeNull();
  expect(qa(".admin-row b").map((b) => b.textContent)).toEqual(["Web Development Intern"]);
  await act(async () => { qa(".admin-row button").find((b) => b.textContent === "Copy").click(); });
  expect(q("form h3").textContent).toBe("Add a copy of a Careers role");
  expect(q(".copy-note").textContent).toContain("Web Development Intern");
  expect(q("#jo-title").value).toBe("Web Development Intern");
  expect(q("#jo-positions").value).toBe("5");
  expect(q("#jo-mins").value).toBe("45");
  expect(q("#jo-order")).toBeNull(); // no Display order box: a copy goes last

  await act(async () => { fill(q("#jo-duration"), "6 months"); });
  await act(async () => { q("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(api.adminUpdateJobOpening).not.toHaveBeenCalled();
  expect(api.adminCreateJobOpening).toHaveBeenCalledTimes(1);
  expect(api.adminCreateJobOpening.mock.calls[0][0]).toMatchObject({
    title: "Web Development Intern", duration: "6 months", skills: ["React", "CSS"], startsOn: "15 December", positions: 5, audience: "general",
    techCategory: "frontend", durationMinutes: 45, marksPerQuestion: 2, cutoffScore: 20,
    questionCounts: { quantitative: 5, logical: 5, verbal: 5, technical: 15 },
  });
  // Saved: the form shuts and the roles are back on top.
  expect(q("form")).toBeNull();
  await act(async () => { qa(".list-toolbar button").find((b) => b.textContent === "+ Add a Careers role").click(); });
  expect(q("form h3").textContent).toBe("Add a new Careers role");
  expect(q("#jo-title").value).toBe("");
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
  expect(q("form")).toBeNull();
  expect(q(".copy-note")).toBeNull();
  expect(api.adminCreateJobOpening).not.toHaveBeenCalled();
  expect(api.adminUpdateJobOpening).not.toHaveBeenCalled();
});

it("finds a role by title, skill or duration without scrolling the list", async () => {
  api.getAdminToken.mockReturnValue("token");
  const other = { ...role, _id: "o2", slug: "data", title: "Data Science Intern", skills: ["Python"], duration: "6 months" };
  api.adminGetJobOpenings.mockResolvedValue({ ok: true, openings: [role, other], bank: {} });
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ isLoggedIn: true, isAdmin: true, user: null, logout: jest.fn() }}>
        <MemoryRouter><AdminJobOpenings /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  const titles = () => qa(".admin-row b").map((b) => b.textContent);
  expect(titles()).toHaveLength(2);
  await act(async () => { fill(q(".admin-search"), "python"); });
  expect(titles()).toEqual(["Data Science Intern"]);
  expect(q(".list-count").textContent).toBe("1 of 2 roles");
  await act(async () => { fill(q(".admin-search"), "3 months"); });
  expect(titles()).toEqual(["Web Development Intern"]);
  await act(async () => { fill(q(".admin-search"), "nothing like this"); });
  expect(container.textContent).toContain("No roles match that search.");
});
