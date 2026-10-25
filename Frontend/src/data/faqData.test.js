import { ALL_FAQS, FAQ_TOPICS, searchFaqs } from "./faqData.js";

// Pages the site actually has, so a bot answer can't link to a dead end.
const ROUTES = ["/", "/programs", "/services", "/about", "/careers", "/contact", "/privacy-policy", "/terms-of-service", "/client-terms", "/dashboard", "/profile"];

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
        // The chat never sends people to WhatsApp — a department card (`dept`) shows the right number instead.
        expect(l.href || "").not.toMatch(/wa\.me/);
      }
      if (f.dept) expect(["programs", "it", "both"]).toContain(f.dept);
    }
  });
});

describe("help bot answers say it in the chat", () => {
  it("never sends people to another page just to read the answer", () => {
    for (const f of ALL_FAQS) expect(f.a).not.toMatch(/\b(see|check|visit) (the|our) [a-z ]{0,25}page\b|\b(is|are) on (its|the|each) (?!same )[a-z ]{0,20}page\b/i);
  });

  it("lists every IT service with what it covers, and the process and engagement models in full", () => {
    const byId = Object.fromEntries(ALL_FAQS.map((x) => [x.id, x]));
    expect(byId["s-offer"].a.split("\n").filter((l) => l.startsWith("• ")).length).toBe(12);
    expect(byId["s-offer"].a).toMatch(/• Website Development & Web Solutions — Static websites/);
    expect(byId["s-offer"].links).toBeUndefined();
    expect(byId["s-process"].a).toMatch(/Discover[\s\S]*Estimate[\s\S]*Build[\s\S]*Deliver & Support/);
    expect(byId["s-cost"].a).toMatch(/Fixed Price[\s\S]*Dedicated Team[\s\S]*Hourly \/ Retainer/);
    expect(byId["o-phone"].a).toMatch(/Mon–Sat/);
  });
});

describe("help bot search", () => {
  const top = (text) => (searchFaqs(text)[0] || {}).id;

  it.each([
    ["fees", "i-paid"],
    ["refund", "p-refund"],
    ["delete my account", "p-delete"],
    ["are you hiring", "k-open"],
    ["how to apply for a job", "k-apply"],
    ["aptitude test fee", "k-fee"],
    ["negative marking", "k-test"],
    ["webcam full screen rules", "k-rules"],
    ["when will i get my result", "k-result"],
    ["can i reapply", "k-again"],
    ["webcam photos", "k-photos"],
    ["signup bonus", "r-bonus"],
    ["cookies", "o-cookies"],
    ["gst", "p-gst"],
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
    ["client terms", "s-terms"],
    ["is the project fee refundable", "s-refund"],
    ["who owns the source code", "s-own"],
    ["will you sign an nda", "s-nda"],
    ["what if the project is late", "s-change"],
    // The client-terms answers mustn't take over the student ones.
    ["refund policy", "p-refund"],
    ["how is my data used", "o-privacy"],
    ["can i use my own referral code", "r-self"],
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
