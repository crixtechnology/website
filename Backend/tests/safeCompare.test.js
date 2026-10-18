const { safeEqual } = require("../src/utils/safeCompare");

describe("safeEqual", () => {
  it("matches only the exact same text", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
    expect(safeEqual("abc123", "abc124")).toBe(false);
    expect(safeEqual("abc123", "abc12")).toBe(false);
  });

  it("says no, instead of throwing, for non-ASCII text of the same length or anything that isn't text", () => {
    expect(safeEqual("abcdef", "abcdé\u00e9".slice(0, 6))).toBe(false);
    expect(safeEqual("abc", undefined)).toBe(false);
    expect(safeEqual("abc", ["abc"])).toBe(false);
  });
});
