import { safeNextPath } from "./safePath.js";

describe("safeNextPath", () => {
  it("keeps a path on this site", () => {
    expect(safeNextPath("/programs?buy=react-basics&tier=pro")).toBe("/programs?buy=react-basics&tier=pro");
  });
  it("refuses anything that leads to another site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/\\/evil.example", "javascript:alert(1)", "/\tevil", " /x", "", null]) {
      expect(safeNextPath(bad)).toBe("");
    }
  });
});
