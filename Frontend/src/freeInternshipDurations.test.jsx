import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import FreeInternships from "./pages/FreeInternships.jsx";
import { freeOpenings, FREE_APPLY_FORM_URL } from "./data/freeInternships.js";
import { groupVariants, variantLabel } from "./utils/variants.js";
import * as api from "./services/api.js";

// The Free Internship page is static: its roles come from data/freeInternships.js,
// never from the backend. Roles with the same group are one role offered in
// several durations: one card with a duration switch.
jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

const role = (title, slug, duration, extra = {}) => ({ slug, title, duration, group: "", ...extra });

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
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const render = async () => {
    await act(async () => { root.render(<MemoryRouter><FreeInternships /></MemoryRouter>); });
    return [...container.querySelectorAll("#openings .job-card")];
  };

  it("shows every static role without calling the backend", async () => {
    const cards = await render();
    expect(cards.map((c) => c.querySelector("h3").textContent)).toEqual(freeOpenings.map((o) => o.title));
    expect(api.getFreeOpenings).not.toHaveBeenCalled();
    expect(api.getMyJobApplications).not.toHaveBeenCalled();
    expect(container.querySelector(".duration-switch")).toBeNull();
  });

  it("sends Apply Now, on a card and in its details, to our Google Form in a new tab", async () => {
    const cards = await render();
    for (const c of cards) {
      const a = c.querySelector("a.buy-btn");
      expect(a.textContent).toBe("Apply Now");
      expect(a.getAttribute("href")).toBe(FREE_APPLY_FORM_URL);
      expect(a.getAttribute("target")).toBe("_blank");
    }
    await act(async () => { cards[0].querySelector(".see-more-btn").click(); });
    const dialog = document.querySelector("[role='dialog']");
    expect(dialog.textContent).toContain(freeOpenings[0].responsibilities[0]);
    const inDetails = [...dialog.querySelectorAll("a")].find((a) => a.textContent === "Apply Now — Free");
    expect(inDetails.getAttribute("href")).toBe(FREE_APPLY_FORM_URL);
    expect(document.querySelector("input[type='file']")).toBeNull();
  });
});
