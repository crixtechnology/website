import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import FreeInternships from "./pages/FreeInternships.jsx";
import { groupVariants, variantLabel } from "./utils/variants.js";
import * as api from "./services/api.js";

// Free internship roles the admin gives the same group are one role offered in
// several durations (3 and 6 months): one card with a duration switch, the same
// as Training + Internship.
jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

const role = (title, slug, duration, extra = {}) => ({
  _id: slug, slug, title, summary: "Build things.", status: "open", audience: "free", techCategory: "web",
  skills: ["React"], responsibilities: [], eligibility: [], stipend: "", experience: "Freshers", duration, mode: "Remote",
  positions: { total: 5, filled: 0, left: 5 }, waiveFee: false, test: { durationMinutes: 45, questions: 40 }, ...extra,
});

describe("grouping roles by their Duration text", () => {
  it("orders a role's durations shortest first and labels them by their Duration", () => {
    const [g] = groupVariants([role("Web — 6 Months", "web-6", "6 months", { group: "Web" }), role("Web — 3 Months", "web-3", "3 months", { group: "Web" })]);
    expect(g.variants.map((v) => v.slug)).toEqual(["web-3", "web-6"]);
    expect(g.variants.map(variantLabel)).toEqual(["3 months", "6 months"]);
  });
});

describe("the Free Internship page", () => {
  let container;
  let root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.resetAllMocks();
    api.getMyJobApplications.mockResolvedValue({ ok: true, applications: [] });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("shows one card per role and switches between 3 and 6 months in place", async () => {
    api.getFreeOpenings.mockResolvedValue({
      ok: true,
      terms: { processingFee: 94 },
      openings: [
        role("Frontend Intern — 6 Months", "fe-6", "6 months", { group: "Frontend (React.js)", startsOn: "February" }),
        role("Frontend Intern — 3 Months", "fe-3", "3 months", { group: "Frontend (React.js)", startsOn: "2nd week of January" }),
        role("Python Intern", "py", "3 months"),
      ],
    });
    await act(async () => {
      root.render(
        <UserContext.Provider value={{ user: null, isLoggedIn: false, isAdmin: false, openAuthModal: jest.fn() }}>
          <MemoryRouter><FreeInternships /></MemoryRouter>
        </UserContext.Provider>
      );
    });
    const cards = [...container.querySelectorAll("#openings .job-card")];
    expect(cards).toHaveLength(2); // Frontend (two durations) + Python
    const fe = cards[0];
    const fact = (label) => [...fe.querySelectorAll(".job-facts > div")].find((d) => d.querySelector("dt").textContent === label)?.querySelector("dd").textContent;
    const opts = [...fe.querySelectorAll(".duration-opt")];
    expect(opts.map((o) => o.textContent)).toEqual(["3 months", "6 months"]);
    expect(fe.querySelector("h3").textContent).toBe("Frontend Intern — 3 Months");
    expect(fact("Duration")).toBe("3 months");
    expect(fact("Starts on")).toBe("2nd week of January");

    await act(async () => { opts[1].click(); });
    expect(fe.querySelector("h3").textContent).toBe("Frontend Intern — 6 Months");
    expect(fact("Duration")).toBe("6 months");
    expect(fact("Starts on")).toBe("February");
    // Picking a duration doesn't open the role's details.
    expect(document.querySelector("[role='dialog']")).toBeNull();

    expect(cards[1].querySelector(".duration-switch")).toBeNull();
  });
});
