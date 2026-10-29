import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import * as api from "./services/api.js";

// The admin dashboard's tiles.
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

it("shows courses, paid and free internships as one Courses & Internships tile", async () => {
  const priced = [{ tier: "basic", price: 999, discountPercent: 0, features: [] }];
  api.adminGetCourses.mockResolvedValue({ ok: true, courses: [
    { _id: "c1", type: "course", status: "open", tiers: priced },
    { _id: "c2", type: "course", status: "closed", tiers: priced },
    { _id: "i1", type: "internship", status: "closed", tiers: [] },
  ] });
  api.adminGetJobOpenings.mockResolvedValue({ ok: true, openings: [{ _id: "o1", audience: "free" }, { _id: "o2", audience: "general" }] });
  for (const fn of ["adminGetEnrollments", "adminGetUsers", "adminGetContacts", "adminGetApplications", "adminGetReferrals", "adminGetBotQuestions", "adminGetJobApplications"]) {
    api[fn].mockResolvedValue({ ok: false });
  }
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user: { email: "admin@example.com" }, isLoggedIn: true, isAdmin: true, logout: jest.fn() }}>
        <MemoryRouter><AdminDashboard /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  const tiles = [...container.querySelectorAll(".admin-tile")];
  const labels = tiles.map((t) => t.querySelector(".tag").textContent);
  expect(labels).toContain("Courses & Internships");
  expect(labels).not.toContain("Courses");
  expect(labels).not.toContain("Internships");
  const tile = tiles.find((t) => t.querySelector(".tag").textContent === "Courses & Internships");
  expect(tile.getAttribute("href")).toBe("/admin/courses");
  expect(tile.textContent).toContain("4"); // 2 courses + 1 paid + 1 free internship
  expect(tile.textContent).toContain("1 free internship · 1 paid · 2 courses · 1 on sale");
});
