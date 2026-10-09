import { formatDuration } from "./duration.js";

describe("formatDuration", () => {
  it.each([
    [15, "15 days"],
    [30, "1 month"],
    [90, "3 months"],
    [180, "6 months"],
  ])("says %i days as “%s”", (days, text) => {
    expect(formatDuration(days)).toBe(text);
  });

  it("accepts the number as text, as it arrives from forms", () => {
    expect(formatDuration("90")).toBe("3 months");
  });

  it("leaves other lengths as days", () => {
    expect(formatDuration(45)).toBe("45 days");
    expect(formatDuration(7)).toBe("7 days");
    expect(formatDuration(365)).toBe("365 days");
    expect(formatDuration(1)).toBe("1 day");
  });

  it("gives nothing for no duration", () => {
    for (const none of [null, undefined, 0, "", "abc", -5]) expect(formatDuration(none)).toBe("");
  });
});
