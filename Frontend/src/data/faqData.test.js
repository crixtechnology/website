import { ALL_FAQS, FAQ_TOPICS, searchFaqs } from "./faqData.js";

// Pages the site actually has, so a bot answer can't link to a dead end.
const ROUTES = ["/", "/programs", "/internships", "/courses", "/services", "/about", "/contact", "/privacy-policy", "/terms-of-service", "/client-terms", "/dashboard", "/profile"];

describe("help bot answers", () => {
  it("has unique ids, a question and an answer for every entry", () => {
    const ids = ALL_FAQS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of ALL_FAQS) {
      expect(f.q.trim().length).toBeGreaterThan(5);
      expect(f.a.trim().length).toBeGreaterThan(20);
    }
    for (const t of FAQ_TOPICS) expect(t.faqs.length).toBeGreaterThan(0);
  });

  it("only links to pages that exist, and external links are real URLs", () => {
    for (const f of ALL_FAQS) {
      for (const l of f.links || []) {
        expect(l.label).toBeTruthy();
        if (l.to) expect(ROUTES).toContain(l.to);
        else expect(l.href).toMatch(/^(https?:\/\/|mailto:)/);
      }
    }
  });
});

describe("help bot search", () => {
  const top = (text) => (searchFaqs(text)[0] || {}).id;

  it.each([
    ["fees", "i-paid"],
    ["refund", "p-refund"],
    ["timings", "o-hours"],
    ["phone number", "o-phone"],
    ["address", "o-where"],
    ["email address", "o-email"],
    ["website cost", "s-cost"],
    ["do you build apps", "s-offer"],
    ["kit", "i-kit"],
    ["login not working", "a-forgot"],
    ["i forgot password", "a-forgot"],
    ["wallet balance", "r-wallet"],
    ["where is my receipt", "p-receipt"],
    ["how do i pay", "p-pay"],
    ["certificates", "c-cert"],
  ])("answers “%s” with %s first", (text, id) => {
    expect(top(text)).toBe(id);
  });

  it("understands plurals", () => {
    expect(top("coupons")).toBe(top("coupon"));
    expect(top("internships")).toBe("i-offer");
  });

  it("finds nothing for gibberish or empty input", () => {
    expect(searchFaqs("")).toEqual([]);
    expect(searchFaqs("   ")).toEqual([]);
    expect(searchFaqs("xyzzy qwertyuiop")).toEqual([]);
  });

  it("returns at most three results", () => {
    expect(searchFaqs("course internship payment").length).toBeLessThanOrEqual(3);
  });
});
