// Free internships are free end to end: applying, the aptitude test and the
// internship. Nothing on the page, in the FAQs or in the Terms may ask an
// applicant to pay a test or processing fee.
import { freeHero, freeSteps, freeRules } from "./data/freeInternships.js";
import { defaultTerms, hiringSteps, careersRulesDocument } from "./data/careers.js";
import { legal } from "./data/content.js";

const pageText = () => [freeHero.text, ...freeSteps.map((s) => s.desc), ...freeRules].join("\n");

describe("no test or processing fee", () => {
  it("says the free internships page has no fee, and never asks for a payment", () => {
    const text = pageText();
    expect(text).not.toMatch(/processing fee|pay the|₹/i);
    expect(freeSteps[1].desc).toMatch(/There is no fee/);
    expect(freeRules[0]).toMatch(/free/);
    expect(freeRules[0]).toMatch(/never asks applicants for a fee/);
  });

  it("quotes no fee in the careers terms, hiring steps or rules document", () => {
    expect(defaultTerms.testFee).toBeUndefined();
    const steps = hiringSteps(defaultTerms).map((s) => s.desc).join("\n");
    expect(steps).toMatch(/Applying and the test are free/);
    const rules = JSON.stringify(careersRulesDocument(defaultTerms));
    expect(`${steps}\n${rules}`).not.toMatch(/₹289|₹94|Razorpay|undefined/);
  });

  it("doesn't charge a fee in the Terms", () => {
    const all = JSON.stringify(legal.terms);
    expect(all).not.toMatch(/₹94|₹289/);
    expect(all).not.toMatch(/pay the aptitude-test processing fee|shown to you at the payment step/);
    expect(all).toMatch(/No fee to apply\. Applying for a role and taking its aptitude test are free/);
  });
});
