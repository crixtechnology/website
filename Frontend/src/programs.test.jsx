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
