import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import { TrainingInternship } from "./pages/pages.jsx";
import * as api from "./services/api.js";

// The Training + Internship page: paid internship-type programs only — no courses.
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

const program = (title, price) => ({
  _id: title, slug: title.toLowerCase().replace(/\W+/g, "-"), title, desc: "Learn things.", points: [],
  tiers: [{ tier: "basic", price, discountPercent: 0, features: [] }],
});

it("lists only paid training tracks, never courses, and explains the stipend selection", async () => {
  api.getCourses.mockImplementation(async (type) => ({
    ok: true,
    courses: type === "internship"
      ? [program("Web Internship", 2999), program("Free Internship", 0)]
      : [program("React Course", 1499)],
  }));
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user: null, isLoggedIn: false }}>
        <MemoryRouter initialEntries={["/training-internship"]}><TrainingInternship /></MemoryRouter>
      </UserContext.Provider>
    );
  });

  // Courses are never even asked for.
  expect(api.getCourses).not.toHaveBeenCalledWith("course");
  const section = container.querySelector("#programs");
  expect(section.querySelectorAll(".type-pill--internship")).toHaveLength(1);
  expect(section.querySelectorAll(".type-pill--course")).toHaveLength(0);
  expect(section.textContent).toContain("Web Internship");
  expect(container.textContent).not.toContain("React Course");
  expect(section.querySelectorAll(".card")).toHaveLength(1); // the free one is left out
  // Train first, then the selected few move on to a stipend internship.
  expect(container.querySelectorAll(".stage-card")).toHaveLength(2);
  expect(container.querySelector("#selection").textContent).toContain("not guaranteed");
  // Old anchors still resolve.
  expect(container.querySelector("#internships")).not.toBeNull();
  expect(container.querySelector("#courses")).not.toBeNull();
});

it("shows each program's details on its card, and no Choose a plan once it's full", async () => {
  api.getCourses.mockImplementation(async (type) => ({
    ok: true,
    courses: type === "internship"
      ? [
        { ...program("Web Internship", 2999), stipend: "Up to ₹3,000/month", mode: "Remote", skills: ["React"], positions: { total: 5, filled: 1, left: 4 } },
        { ...program("Full Internship", 1499), positions: { total: 20, filled: 20, left: 0 } },
      ]
      : [],
  }));
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user: null, isLoggedIn: false }}>
        <MemoryRouter initialEntries={["/training-internship"]}><TrainingInternship /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  const [internship, full] = [...container.querySelectorAll("#programs .card")];
  expect(internship.textContent).toContain("4 of 5 positions open");
  expect(internship.textContent).toContain("Up to ₹3,000/month");
  expect(internship.textContent).toContain("React");
  expect([...internship.querySelectorAll("button")].some((b) => b.textContent === "Choose a plan")).toBe(true);
  expect(full.querySelector("button[disabled]")).not.toBeNull();
  expect([...full.querySelectorAll("button")].some((b) => b.textContent === "Choose a plan")).toBe(false);
});

it("sends someone who already has a program to My Dashboard instead of offering its plans", async () => {
  api.getCourses.mockImplementation(async (type) => ({
    ok: true, courses: type === "internship" ? [program("Web Internship", 2999), program("Data Internship", 1499)] : [],
  }));
  api.getMyEnrollments.mockResolvedValue({ ok: true, enrollments: [{ course: { _id: "Web Internship" }, tier: "basic", expired: false }] });
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user: { name: "S" }, isLoggedIn: true }}>
        <MemoryRouter initialEntries={["/training-internship"]}><TrainingInternship /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  const [owned, other] = [...container.querySelectorAll("#programs .card")];
  const link = [...owned.querySelectorAll("a")].find((a) => a.textContent.startsWith("View in My Dashboard"));
  expect(link.getAttribute("href")).toBe("/dashboard");
  expect([...other.querySelectorAll("button")].some((b) => b.textContent === "Choose a plan")).toBe(true);
});
