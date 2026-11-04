import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import { TrainingInternship } from "./pages/pages.jsx";
import { groupVariants } from "./utils/variants.js";
import * as api from "./services/api.js";

// One domain offered in several durations: tracks the admin gives the same
// group show as a single card with a duration switch, plus an optional
// "Starts on" estimate in the card's facts.
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
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it("shows one card per domain and switches its duration in place", async () => {
    api.getCourses.mockResolvedValue({
      ok: true,
      courses: [
        track("MERN — 3 Months", "mern-3", 90, { group: "MERN", startingFrom: "2nd week of January" }),
        track("MERN — 1 Month", "mern-1", 30, { group: "MERN", startingFrom: "15 December" }),
        track("Android", "android", 30),
      ],
    });
    await act(async () => {
      root.render(
        <UserContext.Provider value={{ user: null, isLoggedIn: false }}>
          <MemoryRouter><TrainingInternship /></MemoryRouter>
        </UserContext.Provider>
      );
    });
    const cards = [...container.querySelectorAll("#programs .card")];
    expect(cards).toHaveLength(2); // MERN (two durations) + Android
    const mern = cards[0];
    const opts = [...mern.querySelectorAll(".duration-opt")];
    expect(opts.map((o) => o.textContent)).toEqual(["1 month", "3 months"]);
    expect(opts[0].getAttribute("aria-pressed")).toBe("true");
    expect(mern.querySelector("h3").textContent).toBe("MERN — 1 Month");
    const startsOn = (card) => [...card.querySelectorAll(".job-facts > div")].find((d) => d.querySelector("dt").textContent === "Starts on");
    expect(startsOn(mern).querySelector("dd").textContent).toBe("15 December");
    expect(mern.querySelector("a.see-more-btn").getAttribute("href")).toBe("/programs/mern-1");

    await act(async () => { opts[1].click(); });
    expect(mern.querySelector("h3").textContent).toBe("MERN — 3 Months");
    expect(startsOn(mern).querySelector("dd").textContent).toBe("2nd week of January");
    expect(mern.querySelector("a.see-more-btn").getAttribute("href")).toBe("/programs/mern-3");

    // A track on its own has no switch and, with no value set, no tag.
    expect(cards[1].querySelector(".duration-switch")).toBeNull();
    expect(startsOn(cards[1])).toBeUndefined();
  });
});
