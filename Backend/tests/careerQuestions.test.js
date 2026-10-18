// The starter question bank (src/scripts/careerQuestions.js) is typed by hand
// and inserted straight into the database by the seed, so its shape is checked
// here: a malformed entry would otherwise only show up in a candidate's test.
const bank = require("../src/scripts/careerQuestions");
const { CATEGORIES } = require("../src/utils/careers");

describe("starter question bank", () => {
  it("has 50 questions in every category the test draws from", () => {
    expect(Object.keys(bank).sort()).toEqual(Object.keys(CATEGORIES).sort());
    for (const rows of Object.values(bank)) expect(rows).toHaveLength(50);
  });

  it.each(Object.keys(bank))("%s: every question has four distinct options and a valid answer", (category) => {
    for (const [text, options, correctIndex] of bank[category]) {
      expect(typeof text).toBe("string");
      expect(text.trim().length).toBeGreaterThan(10);
      expect(text.length).toBeLessThanOrEqual(2000);
      expect(options).toHaveLength(4);
      for (const o of options) {
        expect(typeof o).toBe("string");
        expect(o.trim()).not.toBe("");
        expect(o.length).toBeLessThanOrEqual(500);
      }
      expect(new Set(options.map((o) => o.trim().toLowerCase())).size).toBe(4);
      expect(Number.isInteger(correctIndex)).toBe(true);
      expect(correctIndex).toBeGreaterThanOrEqual(0);
      expect(correctIndex).toBeLessThan(4);
    }
  });

  it("never repeats a question together with its options", () => {
    const seen = new Set();
    for (const rows of Object.values(bank)) {
      for (const [text, options] of rows) {
        const key = `${text}|${[...options].sort().join("|")}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });
});
