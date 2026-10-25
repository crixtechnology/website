// The free internships test processing fee is set in Admin → Careers settings
// and changes from time to time, so the page's own text never quotes it: only
// the payment step shows the amount (and the wallet-credit points beside it).
import { freeHero, freeSteps, freeRules, processingFeePoints } from "./data/freeInternships.js";
import { legal } from "./data/content.js";

const terms = { processingFee: 137, creditExpiryMonths: 12, creditUsagePercent: 100 };
const pageText = () => [
  freeHero(terms.processingFee).text,
  ...freeSteps(terms.processingFee).map((s) => s.desc),
  ...freeRules(terms),
].join("\n");

describe("free internships fee wording", () => {
  it("mentions the processing fee without its amount", () => {
    const text = pageText();
    expect(text).toMatch(/processing fee/);
    expect(text).not.toMatch(/137/);
    expect(text).toMatch(/shown before you pay/);
  });

  it("still says there is no fee when it is set to 0", () => {
    const free = { ...terms, processingFee: 0 };
    expect(freeHero(0).text).not.toMatch(/processing fee/);
    expect(freeRules(free)[0]).toMatch(/free/);
  });

  it("gives the exact amount only at the payment step", () => {
    expect(processingFeePoints(terms)[0]).toMatch(/₹137/);
  });

  it("doesn't fix the amount in the Terms", () => {
    const all = JSON.stringify(legal.terms);
    expect(all).not.toMatch(/₹94/);
    expect(all).toMatch(/shown to you at the payment step/);
  });
});
