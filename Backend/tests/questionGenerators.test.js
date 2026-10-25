// The generated questions (src/utils/questionGenerators.js) are written by code
// at the moment a test starts, so nobody proof-reads them. This runs every
// pattern many times and checks each result is a usable question, and for the
// ones whose answer can be recomputed from the question's own text, that the
// answer marked correct really is.
const { GENERATORS, generateQuestions, generatorCount } = require("../src/utils/questionGenerators");
const { CATEGORIES } = require("../src/utils/careers");

const RUNS = 300;
const each = (name, check) => {
  const fn = Object.values(GENERATORS).flat().find((g) => g.name === name);
  expect(fn).toBeDefined();
  for (let i = 0; i < RUNS; i++) {
    const q = fn();
    check(q.text, q.options[q.correct], q);
  }
};
const numbers = (text) => (text.match(/-?\d+(\.\d+)?/g) || []).map(Number);
const amount = (s) => Number(String(s).replace(/[^0-9.-]/g, ""));

describe("question generators", () => {
  it("exist for every category the test draws from", () => {
    expect(Object.keys(GENERATORS).sort()).toEqual(Object.keys(CATEGORIES).sort());
    for (const category of Object.keys(GENERATORS)) expect(generatorCount(category)).toBeGreaterThanOrEqual(9);
  });

  it.each(Object.keys(GENERATORS))("%s: every pattern always gives four distinct options and one answer", (category) => {
    for (const generator of GENERATORS[category]) {
      for (let i = 0; i < RUNS; i++) {
        const q = generator();
        expect(typeof q.text).toBe("string");
        expect(q.text.length).toBeGreaterThan(15);
        expect(q.text.length).toBeLessThan(2000);
        // A slipped calculation shows up as one of these in the wording. (One
        // pattern lists undefined and NaN on purpose, as values in its code.)
        if (generator.name !== "truthyCount") expect(q.text).not.toMatch(/undefined|NaN|Infinity|\[object/);
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options.map((o) => o.trim().toLowerCase())).size).toBe(4);
        for (const o of q.options) expect(o.trim()).not.toBe("");
        expect(Number.isInteger(q.correct)).toBe(true);
        expect(q.correct).toBeGreaterThanOrEqual(0);
        expect(q.correct).toBeLessThan(4);
      }
    }
  });

  it("gives a paper different patterns, never the same one twice", () => {
    for (const category of Object.keys(GENERATORS)) {
      const made = generateQuestions(category, 6);
      expect(made).toHaveLength(6);
      expect(generateQuestions(category, 500)).toHaveLength(generatorCount(category));
      expect(generateQuestions("no-such-category", 3)).toEqual([]);
    }
  });

  it("produces different questions from one call to the next", () => {
    const texts = new Set();
    for (let i = 0; i < 40; i++) texts.add(generateQuestions("quantitative", 1)[0].text);
    expect(texts.size).toBeGreaterThan(20);
  });

  // ---- answers recomputed independently from the question text ----
  it("simple interest", () => each("simpleInterest", (text, answer) => {
    const [p, r, t] = numbers(text.replace(/,/g, ""));
    expect(amount(answer)).toBe((p * r * t) / 100);
  }));

  it("compound interest", () => each("compoundInterest", (text, answer) => {
    const [p, r] = numbers(text.replace(/,/g, ""));
    expect(amount(answer)).toBeCloseTo(p * (1 + r / 100) ** 2 - p, 6);
  }));

  it("work done together", () => each("workTogether", (text, answer) => {
    const [a, b] = numbers(text);
    expect(1 / amount(answer)).toBeCloseTo(1 / a + 1 / b, 9);
  }));

  it("platform length", () => each("platformLength", (text, answer) => {
    const [train, kmh, seconds] = numbers(text);
    expect(amount(answer) + train).toBeCloseTo((kmh * 5 / 18) * seconds, 6);
  }));

  it("average speed", () => each("averageSpeed", (text, answer) => {
    const [a, b] = numbers(text);
    expect(amount(answer)).toBeCloseTo(2 / (1 / a + 1 / b), 9);
  }));

  it("units digit", () => each("unitsDigit", (text, answer) => {
    const [base, power] = numbers(text);
    expect(BigInt(answer)).toBe((BigInt(base) ** BigInt(power)) % 10n);
  }));

  it("the other number from HCF and LCM", () => each("otherNumberFromHcfLcm", (text, answer) => {
    const [hcf, lcm, one] = numbers(text);
    expect(amount(answer) * one).toBe(hcf * lcm);
  }));

  it("rank from the bottom", () => each("rankFromBottom", (text, answer) => {
    const [total, top] = numbers(text);
    expect(amount(answer)).toBe(total - top + 1);
  }));

  it("students who play neither game", () => each("playsNeither", (text, answer) => {
    const [total, a, b, both] = numbers(text);
    expect(amount(answer)).toBe(total - (a + b - both));
  }));

  it("day of the week", () => each("dayAfterManyDays", (text, answer) => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const today = days.findIndex((d) => text.includes(`today is ${d}`));
    expect(answer).toBe(days[(today + numbers(text)[0]) % 7]);
  }));

  it("JavaScript output questions", () => {
    // The question shows real code: run it and compare with the marked answer.
    for (const name of ["reduceSum", "filterAndMap", "closureCounter", "spliceLength", "loopSum", "truthyCount", "spreadMax"]) {
      each(name, (text, answer) => {
        const code = text.slice(text.indexOf("\n") + 1);
        const printed = [];
        // eslint-disable-next-line no-new-func
        new Function("console", code)({ log: (v) => printed.push(String(v)) });
        expect(printed).toEqual([answer]);
      });
    }
  });

  it("string and number coercion", () => each("stringCoercion", (text, answer) => {
    const expression = /console\.log\((.*)\) print/.exec(text)[1];
    // eslint-disable-next-line no-new-func
    expect(String(new Function(`return ${expression};`)())).toBe(answer);
  }));

  it("event loop order", () => each("eventLoopOrder", (text, answer) => {
    const label = (pattern) => pattern.exec(text)[1];
    const sync = label(/^console\.log\("(\w)"\);$/m), micro = label(/then\(\(\) => console\.log\("(\w)"\)/), timer = label(/setTimeout\(\(\) => console\.log\("(\w)"\)/);
    expect(answer).toBe(`${sync} ${micro} ${timer}`);
  }));

  it("pagination", () => each("paginationOffset", (text, answer) => {
    const [limit, page] = numbers(text.replace("start at 1", ""));
    expect(amount(answer)).toBe((page - 1) * limit);
  }));

  it("mean, and both-red probability", () => {
    each("meanOfValues", (text, answer) => {
      const values = numbers(text);
      expect(amount(answer)).toBe(values.reduce((a, b) => a + b, 0) / values.length);
    });
    each("bothRed", (text, answer) => {
      const [red, blue] = numbers(text);
      const [n, d] = answer.split("/").map(Number);
      expect(n / d).toBeCloseTo((red / (red + blue)) * ((red - 1) / (red + blue - 1)), 9);
    });
  });

  it("population variance", () => each("variance", (text, answer) => {
    const values = numbers(text);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(amount(answer)).toBeCloseTo(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length, 9);
  }));

  // ---- python patterns: the printed answer worked out again from the code shown ----
  const code = (text) => text.slice(text.indexOf("\n") + 1);

  it("python: floor division and remainder", () => each("floorDivMod", (text, answer) => {
    const [a, b] = numbers(code(text));
    expect(answer).toBe(`${Math.floor(a / b)} ${a % b}`);
  }));

  it("python: length of a repeated string", () => each("stringRepeatLength", (text, answer) => {
    const word = /s = "(\w+)"/.exec(text)[1], n = Number(/s \* (\d+)/.exec(text)[1]);
    expect(amount(answer)).toBe(word.length * n);
  }));

  it("python: sum of a range", () => each("rangeSum", (text, answer) => {
    const [start, stop, step] = numbers(code(text));
    let sum = 0;
    for (let i = start; i < stop; i += step) sum += i;
    expect(amount(answer)).toBe(sum);
  }));

  it("python: halving loop", () => each("halvingLoop", (text, answer) => {
    let n = numbers(code(text))[0], count = 0;
    while (n > 1) { n = Math.floor(n / 2); count += 1; }
    expect(amount(answer)).toBe(count);
  }));

  it("python: dictionary update", () => each("dictUpdate", (text, answer) => {
    const [x, y, k, z] = numbers(code(text));
    expect(amount(answer)).toBe(x + y + k + z);
  }));

  it("python: append versus extend", () => each("appendVersusExtend", (text, answer) => {
    const lists = [...text.matchAll(/\[([\d, ]+)\]/g)].map((m) => m[1].split(",").length);
    expect(amount(answer)).toBe(lists[0] + 1 + lists[2]);
  }));

  it("python: split, set and max(key=len)", () => {
    each("splitWordCount", (text, answer) => expect(amount(answer)).toBe(/"([a-z ]+)"\.split/.exec(text)[1].split(" ").length));
    each("setLength", (text, answer) => expect(amount(answer)).toBe(new Set(numbers(/set\((.*)\)\)/.exec(text)[1])).size));
    each("longestWord", (text, answer) => {
      const words = [...text.matchAll(/"(\w+)"/g)].map((m) => m[1]);
      expect(words).toHaveLength(4);
      for (const w of words) if (w !== answer) expect(w.length).toBeLessThan(answer.length);
    });
  });
});
