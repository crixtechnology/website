import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import { TrainingInternship } from "./pages/pages.jsx";
import { groupVariants } from "./utils/variants.js";
import * as api from "./services/api.js";

// One domain offered in several durations: tracks the admin gives the same
// group are grouped (groupVariants — the home page's card switch and a track
// page's "other durations" links). The Training + Internship page shows a card
// per duration under a duration filter: All / 1 / 2 / 3 / 6 months.
jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

const track = (title, slug, durationDays, extra = {}) => ({
  _id: slug, slug, title, type: "internship", desc: "Learn things.", points: [], durationDays,
  tiers: [{ tier: "basic", price: 1000, discountPercent: 0, features: [] }], ...extra,
});

describe("groupVariants", () => {
  it("puts a group's tracks together, shortest first, in the order groups first appear", () => {
    const groups = groupVariants([
      track("MERN 3M", "mern-3", 90, { group: "MERN" }),
      track("Android", "android", 30),
      track("MERN 1M", "mern-1", 30, { group: " mern " }),
    ]);
    expect(groups.map((g) => g.variants.map((v) => v.slug))).toEqual([["mern-1", "mern-3"], ["android"]]);
  });

  it("never merges tracks without a group", () => {
    expect(groupVariants([track("A", "a", 30), track("B", "b", 30)])).toHaveLength(2);
  });
});

describe("the Training + Internship page", () => {
  let container;
  let root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.resetAllMocks();
    api.getMyWallet.mockResolvedValue({ ok: false });
    api.getOpenings.mockResolvedValue({ ok: false, openings: [] });
    // The page shuffles its cards; this value keeps them in the order given.
    jest.spyOn(Math, "random").mockReturnValue(0.9999);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const renderPage = async (courses) => {
    api.getCourses.mockResolvedValue({ ok: true, courses });
    await act(async () => {
      root.render(
        <UserContext.Provider value={{ user: null, isLoggedIn: false }}>
          <MemoryRouter><TrainingInternship /></MemoryRouter>
        </UserContext.Provider>
      );
    });
  };
  const titles = () => [...container.querySelectorAll("#programs .card h3")].map((h) => h.textContent);
  const pills = () => [...container.querySelectorAll("#programs .filter-pill")];
  const pick = (label) => act(async () => { pills().find((b) => b.textContent === label).click(); });

  it("shows a card for every duration, each with its own details", async () => {
    await renderPage([
      track("MERN — 3 Months", "mern-3", 90, { group: "MERN", startingFrom: "2nd week of January" }),
      track("MERN — 1 Month", "mern-1", 30, { group: "MERN", startingFrom: "15 December" }),
      track("Android", "android", 30),
    ]);
    const cards = [...container.querySelectorAll("#programs .card")];
    expect(cards).toHaveLength(3);
    expect(container.querySelector("#programs .duration-switch")).toBeNull();
    const fact = (card, name) => [...card.querySelectorAll(".job-facts > div")].find((d) => d.querySelector("dt").textContent === name);
    expect(fact(cards[0], "Duration").querySelector("dd").textContent).toBe("3 months");
    expect(fact(cards[0], "Starts on").querySelector("dd").textContent).toBe("2nd week of January");
    expect(cards[1].querySelector("a.see-more-btn").getAttribute("href")).toBe("/programs/mern-1");
    expect(fact(cards[2], "Starts on")).toBeUndefined();
  });

  it("filters the cards by duration with the capsules on top", async () => {
    await renderPage([
      track("Web 1M", "web-1", 30), track("Web 2M", "web-2", 60), track("Web 3M", "web-3", 90),
      track("Data 3M", "data-3", 90), track("Any length", "any", null),
    ]);
    expect(pills().map((b) => b.textContent)).toEqual(["All", "1 month", "2 months", "3 months", "6 months", "Stipend"]);
    expect(pills()[0].getAttribute("aria-pressed")).toBe("true");
    expect(titles()).toHaveLength(5);

    await pick("3 months");
    // Each card names its length, since one domain is a card per duration.
    expect(titles()).toEqual(["Web 3M — 3 months", "Data 3M — 3 months"]);
    expect(pills().map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "true", "false", "false"]);
    await pick("2 months");
    expect(titles()).toEqual(["Web 2M — 2 months"]);

    // Nothing of that length: says so, and offers the way back.
    await pick("6 months");
    expect(titles()).toEqual([]);
    expect(container.querySelector("#programs .filter-empty").textContent).toContain("No 6-month programs right now.");
    await act(async () => { container.querySelector("#programs .filter-reset").click(); });
    expect(titles()).toHaveLength(5);
    await pick("All");
    expect(titles()).toHaveLength(5);
  });

  it("shows only programs that pay a stipend under Stipend", async () => {
    await renderPage([
      track("Paid A", "paid-a", 90, { stipend: "₹3,000/month" }),
      track("Old none", "old-none", 90, { stipend: "No Stipend" }),
      track("No stipend", "none", 30),
      track("Paid B", "paid-b", 180, { stipend: "Up to ₹7,000/month", stipendTrainingMonths: 2 }),
    ]);
    await pick("Stipend");
    expect(titles()).toEqual(["Paid A — 3 months", "Paid B — 6 months"]);
    expect(pills().find((b) => b.textContent === "Stipend").getAttribute("aria-pressed")).toBe("true");
  });

  it("says so when no program pays a stipend", async () => {
    await renderPage([track("No stipend", "none", 30)]);
    await pick("Stipend");
    expect(titles()).toEqual([]);
    expect(container.querySelector("#programs .filter-empty").textContent).toContain("No programs with a stipend right now.");
  });
});
