import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import { Programs } from "./pages/pages.jsx";
import * as api from "./services/api.js";

// The Programs page: internships and courses in one section, paid ones only.
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

it("shows internships and courses together in one section, leaving out free ones", async () => {
  api.getCourses.mockImplementation(async (type) => ({
    ok: true,
    courses: type === "internship"
      ? [program("Web Internship", 2999), program("Free Internship", 0)]
      : [program("React Course", 1499)],
  }));
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user: null, isLoggedIn: false }}>
        <MemoryRouter initialEntries={["/programs"]}><Programs /></MemoryRouter>
      </UserContext.Provider>
    );
  });

  const section = container.querySelector("#programs");
  expect(section.querySelectorAll(".type-pill--internship")).toHaveLength(1);
  expect(section.querySelectorAll(".type-pill--course")).toHaveLength(1);
  expect(section.textContent).toContain("Web Internship");
  expect(section.textContent).toContain("React Course");
  expect(container.textContent).not.toContain("Free Internship");
  // The old filter and separate sections are gone; the old anchors still resolve.
  expect(container.querySelector(".program-filter")).toBeNull();
  expect(container.querySelector("section#internships, section#courses")).toBeNull();
  expect(container.querySelector("#internships")).not.toBeNull();
  expect(container.querySelector("#courses")).not.toBeNull();
});

it("shows each program's details on its card, and no Choose a plan once it's full", async () => {
  api.getCourses.mockImplementation(async (type) => ({
    ok: true,
    courses: type === "internship"
      ? [{ ...program("Web Internship", 2999), stipend: "Up to ₹3,000/month", mode: "Remote", skills: ["React"], positions: { total: 5, filled: 1, left: 4 } }]
      : [{ ...program("React Course", 1499), positions: { total: 20, filled: 20, left: 0 } }],
  }));
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user: null, isLoggedIn: false }}>
        <MemoryRouter initialEntries={["/programs"]}><Programs /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  const [internship, course] = [...container.querySelectorAll("#programs .card")];
  expect(internship.textContent).toContain("4 of 5 positions open");
  expect(internship.textContent).toContain("Up to ₹3,000/month");
  expect(internship.textContent).toContain("React");
  expect([...internship.querySelectorAll("button")].some((b) => b.textContent === "Choose a plan")).toBe(true);
  expect(course.textContent).toContain("Seats filled");
  const full = [...course.querySelectorAll("button")].find((b) => b.textContent === "All seats filled");
  expect(full.disabled).toBe(true);
});

it("sends someone who already has a program to My Dashboard instead of offering its plans", async () => {
  api.getCourses.mockImplementation(async (type) => ({
    ok: true, courses: type === "internship" ? [program("Web Internship", 2999)] : [program("React Course", 1499)],
  }));
  api.getMyEnrollments.mockResolvedValue({ ok: true, enrollments: [{ course: { _id: "Web Internship" }, tier: "basic", expired: false }] });
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user: { name: "S" }, isLoggedIn: true }}>
        <MemoryRouter initialEntries={["/programs"]}><Programs /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  const [owned, other] = [...container.querySelectorAll("#programs .card")];
  const link = [...owned.querySelectorAll("a")].find((a) => a.textContent.startsWith("View in My Dashboard"));
  expect(link.getAttribute("href")).toBe("/dashboard");
  expect([...other.querySelectorAll("button")].some((b) => b.textContent === "Choose a plan")).toBe(true);
});
