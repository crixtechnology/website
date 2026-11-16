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
  api.getMyWallet.mockResolvedValue({ ok: false });
  api.getOpenings.mockResolvedValue({ ok: false, openings: [] });
  // The page shuffles its cards; this value keeps them in the order given.
  jest.spyOn(Math, "random").mockReturnValue(0.9999);
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
  // What every program includes, and the extras only some have.
  expect(container.querySelectorAll(".stage-card")).toHaveLength(2);
  expect(container.querySelector("#selection").textContent).toContain("Letter of Recommendation");
  // Old anchors still resolve.
  expect(container.querySelector("#internships")).not.toBeNull();
  expect(container.querySelector("#courses")).not.toBeNull();
});

it("shows each program's details and fee on its card, with Enroll now opening the online checkout", async () => {
  api.getCourses.mockImplementation(async (type) => ({
    ok: true,
    courses: type === "internship"
      ? [
        { ...program("Web Internship", 2999), stipend: "Up to ₹3,000/month", mode: "Remote", skills: ["React"], positions: { total: 5, filled: 1, left: 4 } },
        { ...program("Full Internship", 1499), positions: { total: 20, filled: 20, left: 0 } },
        { ...program("Unpriced Internship", 1), tiers: [] },
      ]
      : [],
  }));
  const openAuthModal = jest.fn();
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user: null, isLoggedIn: false, openAuthModal }}>
        <MemoryRouter initialEntries={["/training-internship"]}><TrainingInternship /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  const [internship, full, unpriced] = [...container.querySelectorAll("#programs .card")];
  expect(internship.textContent).toContain("4 of 5 positions open");
  expect(internship.textContent).toContain("Up to ₹3,000/month");
  expect(internship.textContent).toContain("Remote");
  // The description and skills are only in View details, not on the card.
  expect(internship.textContent).not.toContain("React");
  expect(internship.querySelector(".deliverable-chip")).toBeNull();
  // The fee the admin set is on the card, and Enroll now starts the checkout —
  // after logging in, for a visitor.
  expect(internship.querySelector(".card-price").textContent).toContain("₹2,999");
  const labelsOf = (card) => [...card.querySelectorAll("button")].map((b) => b.textContent);
  expect(labelsOf(internship)).toEqual(["Enroll now"]);
  await act(async () => { internship.querySelector("button").click(); });
  expect(openAuthModal).toHaveBeenCalledWith("login", expect.any(Function));
  // A full program, or one with no price, takes a request instead.
  expect(labelsOf(full)).toEqual(["Request to apply"]);
  expect(labelsOf(unpriced)).toEqual(["Request to apply"]);
  expect(unpriced.querySelector(".card-price")).toBeNull();
  // ...and the page gives the phone and WhatsApp options too.
  const contact = container.querySelector("#programs .training-contact");
  expect(contact.querySelector('a[href^="tel:"]')).not.toBeNull();
  expect(contact.querySelector('a[href^="https://wa.me/"]')).not.toBeNull();
});

// status is Admin's Open/Closed switch for taking applications.
it("shows a closed track as Currently closed, never Open, with applying turned off", async () => {
  api.getCourses.mockImplementation(async (type) => ({
    ok: true,
    courses: type === "internship"
      ? [program("Web Internship", 2999), { ...program("Data Internship", 1499), status: "closed" }]
      : [],
  }));
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user: null, isLoggedIn: false }}>
        <MemoryRouter initialEntries={["/training-internship"]}><TrainingInternship /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  const cards = [...container.querySelectorAll("#programs .card")];
  const byTitle = (t) => cards.find((c) => c.querySelector("h3").textContent === t);
  const open = byTitle("Web Internship");
  expect(open.querySelector(".tag").textContent).toBe("Open");
  expect(open.querySelector(".closed-badge")).toBeNull();
  expect(open.querySelector(".fee-pill").textContent).toBe("Paid training");
  const closed = byTitle("Data Internship");
  expect(closed.querySelector(".tag")).toBeNull();
  expect(closed.querySelector(".fee-pill")).toBeNull();
  expect(closed.querySelector(".closed-badge").textContent).toBe("Currently closed");
  const apply = [...closed.querySelectorAll("button")].find((b) => b.textContent === "Applications closed");
  expect(apply.disabled).toBe(true);
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
  expect([...other.querySelectorAll("button")].map((b) => b.textContent)).toContain("Enroll now");
});

it("shows the original price crossed out beside the final price", async () => {
  api.getCourses.mockResolvedValue({
    ok: true,
    courses: [
      { ...program("Cyber Security", 1499), tiers: [{ tier: "basic", price: 1499, originalPrice: 1999, discountPercent: 0, features: [] }] },
      program("Web Internship", 2999),
      // An older plan with a % discount still shows its price crossed out.
      { ...program("Data Internship", 5000), tiers: [{ tier: "basic", price: 5000, discountPercent: 20, features: [] }] },
    ],
  });
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user: null, isLoggedIn: false }}>
        <MemoryRouter initialEntries={["/training-internship"]}><TrainingInternship /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  const price = (title) => [...container.querySelectorAll("#programs .card")].find((c) => c.querySelector("h3").textContent === title).querySelector(".card-price");
  const offer = price("Cyber Security");
  expect(offer.querySelector(".price-old").textContent).toContain("₹1,999");
  expect(offer.querySelector(".price-now").textContent).toContain("₹1,499");
  expect(offer.querySelector(".price-off").textContent).toBe("25% off");
  // No original price: just the price.
  expect(price("Web Internship").querySelector(".price-old")).toBeNull();
  expect(price("Web Internship").querySelector(".price-now").textContent).toBe("₹2,999");
  expect(price("Data Internship").querySelector(".price-old").textContent).toContain("₹5,000");
  expect(price("Data Internship").querySelector(".price-now").textContent).toContain("₹4,000");
});

const renderTI = async (ctx) => {
  await act(async () => {
    root.render(
      <UserContext.Provider value={ctx}>
        <MemoryRouter initialEntries={["/training-internship"]}><TrainingInternship /></MemoryRouter>
      </UserContext.Provider>
    );
  });
};
const titles = () => [...container.querySelectorAll("#programs h3")].map((h) => h.textContent);

it("shows the cards in a random order", async () => {
  api.getCourses.mockResolvedValue({ ok: true, courses: [program("A Track", 999), program("B Track", 999), program("C Track", 999)] });
  Math.random.mockReturnValue(0); // each swap picks the first card
  await renderTI({ user: null, isLoggedIn: false });
  expect(titles()).toEqual(["B Track", "C Track", "A Track"]);
});

it("logged in, takes the student's wallet credit straight off the price shown", async () => {
  api.getCourses.mockResolvedValue({ ok: true, courses: [program("Web Internship", 999)] });
  api.getMyWallet.mockResolvedValue({ ok: true, wallet: { available: 50, usagePercent: 100 } });
  api.getMyEnrollments.mockResolvedValue({ ok: true, enrollments: [] });
  await renderTI({ user: { id: "u1", name: "Asha" }, isLoggedIn: true });
  const price = container.querySelector(".card-price");
  // Final price after the ₹50 credit, the full price struck through, and a note why.
  expect(price.querySelector(".price-now").textContent).toMatch(/₹\s?949$/);
  expect(price.querySelector(".price-old").textContent).toMatch(/₹\s?999$/);
  expect(price.querySelector(".price-off").textContent).toBe("5% off");
  expect(price.querySelector(".card-price-wallet-note").textContent).toMatch(/Includes your ₹\s?50 wallet credit/);
  expect(price.textContent).not.toMatch(/Payable/);
});

it("shows ₹0 when the wallet pays for the whole program, as checkout does", async () => {
  api.getCourses.mockResolvedValue({ ok: true, courses: [program("Web Internship", 999)] });
  api.getMyWallet.mockResolvedValue({ ok: true, wallet: { available: 5000, usagePercent: 100 } });
  api.getMyEnrollments.mockResolvedValue({ ok: true, enrollments: [] });
  await renderTI({ user: { id: "u1", name: "Asha" }, isLoggedIn: true });
  const price = container.querySelector(".card-price");
  expect(price.querySelector(".price-now").textContent).toMatch(/₹\s?0$/);
  expect(price.querySelector(".card-price-wallet-note").textContent).toMatch(/Paid in full from your ₹\s?999 wallet credit/);
});

it("logged out, shows only the admin's price — no wallet line", async () => {
  api.getCourses.mockResolvedValue({ ok: true, courses: [program("Web Internship", 999)] });
  await renderTI({ user: null, isLoggedIn: false });
  expect(api.getMyWallet).not.toHaveBeenCalled();
  expect(container.querySelector(".card-price-wallet-note")).toBeNull();
  expect(container.querySelector(".card-price .price-now").textContent).toMatch(/₹\s?999$/);
});

// The owner's example: original ₹999, offer ₹899; with ₹50 in the wallet the
// card shows ₹849, still against the original ₹999.
it("takes wallet credit off the offer price, against the original price", async () => {
  const offer = { ...program("Python Developer", 899), tiers: [{ tier: "basic", price: 899, originalPrice: 999, discountPercent: 0, features: [] }] };
  api.getCourses.mockResolvedValue({ ok: true, courses: [offer] });
  api.getMyEnrollments.mockResolvedValue({ ok: true, enrollments: [] });

  api.getMyWallet.mockResolvedValue({ ok: true, wallet: { available: 50, usagePercent: 100 } });
  await renderTI({ user: { id: "u1", name: "Asha" }, isLoggedIn: true });
  const price = container.querySelector(".card-price");
  expect(price.querySelector(".price-old").textContent).toMatch(/₹\s?999$/);
  expect(price.querySelector(".price-now").textContent).toMatch(/₹\s?849$/);
  expect(price.querySelector(".price-off").textContent).toBe("15% off");
});

it("logged out, the same program shows the offer price only", async () => {
  const offer = { ...program("Python Developer", 899), tiers: [{ tier: "basic", price: 899, originalPrice: 999, discountPercent: 0, features: [] }] };
  api.getCourses.mockResolvedValue({ ok: true, courses: [offer] });
  await renderTI({ user: null, isLoggedIn: false });
  const price = container.querySelector(".card-price");
  expect(price.querySelector(".price-old").textContent).toMatch(/₹\s?999$/);
  expect(price.querySelector(".price-now").textContent).toMatch(/₹\s?899$/);
  expect(price.querySelector(".price-off").textContent).toBe("10% off");
});
