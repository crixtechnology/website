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

    // Apply Now on a card, and in its details, opens our Google Form in a new tab.
    const applyLinks = cards.map((c) => c.querySelector("a.buy-btn"));
    for (const a of applyLinks) {
      expect(a.textContent).toBe("Apply Now");
      expect(a.getAttribute("href")).toBe("https://forms.gle/eaX7kab7zPG7w6SX6");
      expect(a.getAttribute("target")).toBe("_blank");
    }
    await act(async () => { cards[1].querySelector(".see-more-btn").click(); });
    const inDetails = [...document.querySelectorAll("[role='dialog'] a")].find((a) => a.textContent === "Apply Now — Free");
    expect(inDetails.getAttribute("href")).toBe("https://forms.gle/eaX7kab7zPG7w6SX6");
  });

  it("has no apply form on the site: a logged-in student gets the form link too, or their earlier application", async () => {
    const py = role("Python Intern", "py", "3 months");
    const web = role("Web Intern", "web", "3 months");
    const data = role("Data Intern", "data", "3 months");
    api.getFreeOpenings.mockResolvedValue({ ok: true, openings: [py, web, data] });
    // Applied on the site before the form: one test already unlocked, one never finished.
    api.getMyJobApplications.mockResolvedValue({ ok: true, applications: [
      { _id: "a1", status: "test_pending", statusLabel: "Test pending", opening: { _id: web._id } },
      { _id: "a2", status: "payment_pending", statusLabel: "Application incomplete", opening: { _id: data._id } },
    ] });
    const openAuthModal = jest.fn();
    await act(async () => {
      root.render(
        <UserContext.Provider value={{ user: { name: "Asha" }, isLoggedIn: true, isAdmin: false, openAuthModal }}>
          <MemoryRouter><FreeInternships /></MemoryRouter>
        </UserContext.Provider>
      );
    });
    const [pyCard, webCard, dataCard] = [...container.querySelectorAll("#openings .job-card")];
    const main = (card) => card.querySelector(".buy-btn");
    expect(main(pyCard).getAttribute("href")).toBe("https://forms.gle/eaX7kab7zPG7w6SX6");
    expect(main(webCard).textContent).toContain("View my application");
    expect(main(webCard).getAttribute("href")).toBe("/dashboard?tab=applications");
    expect(main(dataCard).textContent).toBe("Apply Now"); // unfinished: apply through the form
    expect(main(dataCard).getAttribute("href")).toBe("https://forms.gle/eaX7kab7zPG7w6SX6");

    // Nothing on the page collects details or a CV, asks for a login, or quotes an on-site test.
    await act(async () => { pyCard.querySelector(".see-more-btn").click(); });
    expect(document.querySelector("input[type='file']")).toBeNull();
    expect(document.querySelector("#free-name")).toBeNull();
    expect(openAuthModal).not.toHaveBeenCalled();
    const details = document.querySelector("[role='dialog']").textContent;
    expect(details).toContain("How to apply");
    expect(details).not.toMatch(/multiple-choice questions|minutes/);
  });

  it("uses the application form link set in Admin, and ignores one that isn't https", async () => {
    const render = async (applyFormUrl) => {
      api.getFreeOpenings.mockResolvedValue({ ok: true, terms: { applyFormUrl }, openings: [role("Python Intern", "py", "3 months")] });
      await act(async () => {
        root.render(
          <UserContext.Provider value={{ user: null, isLoggedIn: false, isAdmin: false, openAuthModal: jest.fn() }}>
            <MemoryRouter><FreeInternships /></MemoryRouter>
          </UserContext.Provider>
        );
      });
      return container.querySelector("#openings .job-card a.buy-btn").getAttribute("href");
    };
    expect(await render("https://forms.gle/NewForm123")).toBe("https://forms.gle/NewForm123");
    act(() => root.unmount());
    root = createRoot(container);
    expect(await render("javascript:alert(1)")).toBe("https://forms.gle/eaX7kab7zPG7w6SX6");
  });
});
