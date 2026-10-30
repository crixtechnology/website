import { pdfSafe, pdfFileName, buildDocumentPdf } from "./documentPdf.js";
import { careersRulesDocument, defaultTerms, testRuleLines } from "../data/careers.js";
import { legal } from "../data/content.js";

// No network in tests: build without the logo.
jest.mock("./loadImageDataUrl.js", () => ({ __esModule: true, default: async () => null }));

describe("document PDFs", () => {
  it("swaps characters the PDF font can't print for readable ones", () => {
    expect(pdfSafe("Fee ₹289 → credits − 0.25 ✓")).toBe("Fee Rs. 289 -> credits - 0.25 -");
    // What the font does have (bullets, dashes, curly quotes) is kept.
    expect(pdfSafe("• one — “two” it’s")).toBe("• one — “two” it’s");
    expect(pdfSafe("emoji 🎉 gone")).toBe("emoji  gone");
  });

  it("names the file after the document", () => {
    expect(pdfFileName("Terms of Service")).toBe("Crix-Technology-Terms-of-Service.pdf");
    expect(pdfFileName("Aptitude Test Rules — Web Development Intern")).toBe("Crix-Technology-Aptitude-Test-Rules-Web-Development-Intern.pdf");
  });

  it("builds the whole Terms of Service over several pages", async () => {
    const doc = await buildDocumentPdf({ title: "Terms of Service", subtitle: legal.updated, intro: legal.terms.intro, sections: legal.terms.sections });
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    const bytes = doc.output("arraybuffer");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("careers rules document", () => {
  it("covers hiring, the fee and the test, numbered in order", () => {
    const d = careersRulesDocument(defaultTerms);
    expect(d.sections.map((s) => s.title)).toEqual([
      "1. How hiring works", "2. Registration fee & wallet credits", "3. The aptitude test", "4. Fair play", "5. Results & selection", "6. Questions",
    ]);
    expect(d.sections[1].content).toContain("₹289");
  });

  it("on the test page, leaves out the fee and states that role's own test", () => {
    const rules = { questions: 40, durationMinutes: 30, marksPerQuestion: 1, violationLimit: 3, snapshotIntervalSeconds: 60 };
    const d = careersRulesDocument(null, { role: "Web Development Intern", rules });
    expect(d.title).toBe("Aptitude Test Rules — Web Development Intern");
    expect(d.sections[0].title).toBe("1. The aptitude test");
    expect(d.sections[0].content).toContain("40 multiple-choice questions in 30 minutes");
    expect(d.sections[0].content).toContain("After 3 warnings");
    expect(testRuleLines(rules)).toHaveLength(10);
  });
});
