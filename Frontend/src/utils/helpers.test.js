import { offeredTiers, planPrice, formatINR, maskINR, isOpenForBuy, tierLabel } from "./tiers.js";
import { isValidName, isValidEmail, isDisposableEmail, emailFormatError } from "./validators.js";

describe("plans", () => {
  const item = {
    status: "open",
    tiers: [
      { tier: "pro", price: 3000 },
      { tier: "basic", price: 1000 },
      { tier: "plus", price: 2000, discountPercent: 25 },
      { tier: "gold", price: 1 }, // not a plan
      { tier: "plus", price: null }, // no price set
    ],
  };
  it("lists the plans basic -> plus -> pro and drops anything else", () => {
    expect(offeredTiers(item).map((t) => t.tier)).toEqual(["basic", "plus", "pro"]);
  });
  it("prices in whole rupees, matching what the server charges", () => {
    expect(planPrice({ price: 2000, discountPercent: 25 })).toBe(1500);
    expect(planPrice({ price: 5999, discountPercent: 20 })).toBe(4799); // 4799.20 rounds down
    expect(planPrice({ price: 999 })).toBe(999);
  });
  it("formats rupees", () => {
    expect(formatINR(2999)).toBe("₹2,999");
    expect(formatINR(150000)).toBe("₹1,50,000");
    expect(formatINR(4799.2)).toBe("₹4,799.20");
  });
  it("is open for purchase only when something is priced and not closed", () => {
    expect(isOpenForBuy({ status: "open", tiers: [{ tier: "basic", price: 1 }] })).toBe(true);
    expect(isOpenForBuy({ status: "closed", tiers: [{ tier: "basic", price: 1 }] })).toBe(false);
    expect(isOpenForBuy({ status: "open", tiers: [] })).toBe(false);
    expect(isOpenForBuy(undefined)).toBe(false);
  });
  it("labels plans", () => {
    expect(tierLabel("plus")).toBe("Plus");
    expect(tierLabel("nope")).toBe("");
  });
});

describe("validators", () => {
  it("checks names, emails and disposable domains", () => {
    expect(isValidName("Mary-Jane O'Connor")).toBe(true);
    expect(isValidName("Zoë")).toBe(true);
    expect(isValidName("R2D2")).toBe(false);
    expect(isValidName("A")).toBe(false);
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(emailFormatError("nope")).toMatch(/valid email/);
    expect(emailFormatError("x@mailinator.com")).toMatch(/permanent/);
    expect(emailFormatError("real@gmail.com")).toBe("");
  });
});

// One domain is sold in several durations under the same title: each page,
// card and receipt names its length so they don't read as duplicates.
describe("programTitle / programDescription", () => {
  const { programTitle, programDescription } = require("../hooks/usePageMeta.js");
  test("adds the length to the name", () => {
    expect(programTitle({ title: "MERN Stack Developer", durationDays: 90 })).toBe("MERN Stack Developer — 3 months");
    expect(programTitle({ title: "Web", durationDays: 30 })).toBe("Web — 1 month");
    expect(programTitle({ title: "Cyber", durationDays: 45 })).toBe("Cyber — 45 days");
  });
  test("leaves a name that already says its length, or has none", () => {
    expect(programTitle({ title: "MERN — 3 Months", durationDays: 90 })).toBe("MERN — 3 Months");
    expect(programTitle({ title: "Web 6-month track", durationDays: 180 })).toBe("Web 6-month track");
    expect(programTitle({ title: "Open ended" })).toBe("Open ended");
    expect(programTitle(null)).toBe("");
  });
  test("the description starts with the full name", () => {
    expect(programDescription({ title: "Web", durationDays: 60, desc: "Build sites." })).toBe("Web — 2 months: Build sites.");
    expect(programDescription({ title: "Web", durationDays: 60 })).toMatch(/^Web — 2 months — online Training \+ Internship/);
  });
});

// Search results only: lengths of one domain share their visible text, so the
// title and snippet differ by price and stipend instead.
describe("programSeoTitle / programDescription for search results", () => {
  const { programSeoTitle, programDescription } = require("../hooks/usePageMeta.js");
  const desc = "The complete web training.";
  const plain = { title: "MERN Stack Developer", durationDays: 30, desc, stipend: "No Stipend", tiers: [{ tier: "basic", price: 1799 }] };
  const plain6 = { ...plain, durationDays: 180, tiers: [{ tier: "basic", price: 6299 }] };
  const paid = { ...plain, durationDays: 180, stipend: "₹3000 - ₹7000/ month", stipendTrainingMonths: 3, tiers: [{ tier: "basic", price: 22999 }] };

  test("marks the paid-internship version in the title", () => {
    expect(programSeoTitle(plain6)).toBe("MERN Stack Developer — 6 months | Crix Technology");
    expect(programSeoTitle(paid)).toBe("MERN Stack Developer — 6 months + Paid Internship | Crix Technology");
  });
  test("leads the snippet with what differs", () => {
    expect(programDescription(plain)).toBe("MERN Stack Developer — 1 month: online training for ₹1XXX9*, with offer letter, certificate and LOR. The complete web training.");
    expect(programDescription(paid)).toBe("MERN Stack Developer — 6 months: 3 months training + 3 months paid internship (stipend ₹3,000 – ₹7,000/month, performance based), ₹2XXXX9*. The complete web training.");
    expect(new Set([plain, plain6, paid].map(programDescription)).size).toBe(3);
  });
  test("never mentions a stipend for a program without one", () => {
    expect(programDescription(plain6)).not.toMatch(/stipend|paid internship/i);
    expect(programDescription({ ...plain, stipend: "" })).not.toMatch(/stipend/i);
  });
});

describe("maskINR", () => {
  it("keeps the first and last digit, hides everything between, and adds a *", () => {
    expect(maskINR(4999)).toBe("₹4XXX9*");
    expect(maskINR(12499)).toBe("₹1XXXX9*");
    expect(maskINR(999)).toBe("₹9X9*");
  });
  it("leaves one- and two-digit amounts unhidden, still with the *", () => {
    expect(maskINR(0)).toBe("₹0*");
    expect(maskINR(99)).toBe("₹99*");
  });
});
