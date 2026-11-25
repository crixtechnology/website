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

  it("shows one card per domain, with a switch over its durations", async () => {
    await renderPage([
      track("MERN — 3 Months", "mern-3", 90, { group: "MERN", startingFrom: "2nd week of January" }),
      track("MERN — 1 Month", "mern-1", 30, { group: "MERN", startingFrom: "15 December" }),
      track("Android", "android", 30),
    ]);
    const cards = () => [...container.querySelectorAll("#programs .card")];
    expect(cards()).toHaveLength(2);
    const opts = () => [...cards()[0].querySelectorAll(".duration-opt")];
    expect(opts().map((b) => b.textContent)).toEqual(["1 month", "3 months"]);
    const fact = (card, name) => [...card.querySelectorAll(".job-facts > div")].find((d) => d.querySelector("dt").textContent === name);
    // Opens on 3 months.
    expect(opts()[1].getAttribute("aria-pressed")).toBe("true");
    expect(fact(cards()[0], "Duration").querySelector("dd").textContent).toBe("3 months");
    expect(fact(cards()[0], "Starts on").querySelector("dd").textContent).toBe("2nd week of January");
    await act(async () => { opts()[0].click(); });
    expect(fact(cards()[0], "Starts on").querySelector("dd").textContent).toBe("15 December");
    expect(cards()[0].querySelector("a.see-more-btn").getAttribute("href")).toBe("/programs/mern-1");
    expect(cards()[1].querySelector(".duration-switch")).toBeNull();
    expect(fact(cards()[1], "Starts on")).toBeUndefined();
  });

  it("tags the stipend one when two options share a length", async () => {
    await renderPage([
      track("Web 1M", "web-1", 30, { group: "Web" }),
      track("Web 6M", "web-6", 180, { group: "Web" }),
      track("Web 6M Stipend", "web-6s", 180, { group: "Web", stipend: "₹3,000/month" }),
    ]);
    const opts = [...container.querySelectorAll("#programs .duration-opt")];
    // The stipend one is just "Stipend", last.
    expect(opts.map((b) => b.textContent)).toEqual(["1 month", "6 months", "Stipend"]);
    expect(opts[2].getAttribute("aria-label")).toBe("6 months with stipend");
  });

  it("puts the 1- and 2-month lengths under one BCA Special pill with a popup", async () => {
    await renderPage([
      track("Web 1M", "web-1", 30, { group: "Web" }),
      track("Web 2M", "web-2", 60, { group: "Web" }),
      track("Web 3M", "web-3", 90, { group: "Web" }),
    ]);
    const card = () => container.querySelector("#programs .card");
    const top = () => [...card().querySelectorAll(".duration-switch > .duration-opt, .duration-group > .duration-opt")];
    // BCA Special comes after the other lengths.
    expect(top().map((b) => b.textContent)).toEqual(["3 months", "BCA Special▾"]);
    expect(top()[0].getAttribute("aria-pressed")).toBe("true");
    expect(card().querySelector(".duration-pop")).toBeNull();
    const pill = card().querySelector(".duration-opt--group");
    await act(async () => { pill.click(); });
    expect(pill.getAttribute("aria-expanded")).toBe("true");
    const opts = [...card().querySelectorAll(".duration-pop .duration-opt")];
    expect(opts.map((b) => b.textContent)).toEqual(["1 month", "2 months"]);
    await act(async () => { opts[1].click(); });
    expect(card().querySelector(".duration-pop")).toBeNull();
    expect(card().querySelector(".duration-opt--group").textContent).toBe("BCA Special · 2 months▾");
    expect(card().querySelector("a.see-more-btn").getAttribute("href")).toBe("/programs/web-2");
    // Picking 3 months leaves the BCA pill unselected.
    await act(async () => { top()[0].click(); });
    expect(card().querySelector(".duration-opt--group").textContent).toBe("BCA Special▾");
  });

  it("orders the pills: other lengths, Stipend, then BCA Special", async () => {
    await renderPage([
      track("Web 1M", "web-1", 30, { group: "Web" }),
      track("Web 2M", "web-2", 60, { group: "Web" }),
      track("Web 3M", "web-3", 90, { group: "Web" }),
      track("Web 6M", "web-6", 180, { group: "Web" }),
      track("Web 6M Stipend", "web-6s", 180, { group: "Web", stipend: "₹3,000/month" }),
    ]);
    const top = [...container.querySelectorAll("#programs .duration-switch > .duration-opt, #programs .duration-group > .duration-opt")];
    expect(top.map((b) => b.textContent)).toEqual(["3 months", "6 months", "Stipend", "BCA Special▾"]);
  });

  it("opens on the shortest length when there is no 3-month one", async () => {
    await renderPage([
      track("Web 1M", "web-1", 30, { group: "Web" }),
      track("Web 6M", "web-6", 180, { group: "Web" }),
    ]);
    expect([...container.querySelectorAll("#programs .duration-opt")].map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
  });

  it("keeps a lone 1-month length as its own pill", async () => {
    await renderPage([
      track("Web 1M", "web-1", 30, { group: "Web" }),
      track("Web 3M", "web-3", 90, { group: "Web" }),
    ]);
    expect(container.querySelector("#programs .duration-opt--group")).toBeNull();
    expect([...container.querySelectorAll("#programs .duration-opt")].map((b) => b.textContent)).toEqual(["1 month", "3 months"]);
  });

  it("has no filter bar: every program shows, each card naming its own length", async () => {
    await renderPage([
      track("Web 1M", "web-1", 30), track("Data 3M", "data-3", 90), track("Any length", "any", null),
    ]);
    expect(container.querySelector("#programs .filter-pills")).toBeNull();
    expect(titles()).toEqual(["Web 1M — 1 month", "Data 3M — 3 months", "Any length"]);
  });
});
