import fs from "fs";
import path from "path";
import {
  COUNTRIES, POPULAR_COUNTRIES, DEFAULT_COUNTRY, countryByIso, parsePhone, formatPhone, phoneError, compactPhone, searchCountries,
} from "./phone.js";

describe("country list", () => {
  it("has every country once, with a calling code", () => {
    expect(COUNTRIES.length).toBeGreaterThan(230);
    expect(new Set(COUNTRIES.map((c) => c.iso)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) {
      expect(c.dial).toMatch(/^\+\d{1,3}$/);
      expect(c.min).toBeGreaterThan(0);
      expect(c.max).toBeGreaterThanOrEqual(c.min);
      expect(c.digits.length + c.max).toBeLessThanOrEqual(15); // E.164
    }
  });

  it("has a flag image for every country", () => {
    const dir = path.join(__dirname, "..", "..", "public", "flags");
    const missing = COUNTRIES.filter((c) => !fs.existsSync(path.join(dir, `${c.iso}.svg`))).map((c) => c.iso);
    expect(missing).toEqual([]);
  });

  it("puts India first among the popular countries and as the default", () => {
    expect(DEFAULT_COUNTRY).toBe("IN");
    expect(POPULAR_COUNTRIES[0].iso).toBe("IN");
    expect(countryByIso("IN").dial).toBe("+91");
    expect(countryByIso("nonsense").iso).toBe("IN"); // unknown code falls back
  });

  it("accepts each country's own example mobile number", () => {
    const bad = COUNTRIES.filter((c) => c.example && phoneError(formatPhone(c.iso, c.example)) !== "").map((c) => `${c.iso} ${c.example}`);
    expect(bad).toEqual([]);
  });
});

describe("parsePhone", () => {
  it("splits a stored international number", () => {
    expect(parsePhone("+91 9876543210")).toEqual({ iso: "IN", national: "9876543210" });
    expect(parsePhone("+44 7400 123456")).toEqual({ iso: "GB", national: "7400123456" });
    expect(parsePhone("+971501234567")).toEqual({ iso: "AE", national: "501234567" });
    expect(parsePhone("0091 98765 43210")).toEqual({ iso: "IN", national: "9876543210" });
  });

  it("treats a number saved without a code as Indian", () => {
    expect(parsePhone("9876543210")).toEqual({ iso: "IN", national: "9876543210" });
    expect(parsePhone("")).toEqual({ iso: "IN", national: "" });
    expect(parsePhone(undefined)).toEqual({ iso: "IN", national: "" });
  });

  it("keeps the chosen country among those that share a calling code", () => {
    expect(parsePhone("+1 2015550123").iso).toBe("US"); // the main one
    expect(parsePhone("+1 2015550123", "CA").iso).toBe("CA"); // but the picked one wins
    expect(parsePhone("+7 9123456789").iso).toBe("RU");
  });

  it("keeps digits of an unknown code as the national number", () => {
    expect(parsePhone("+999 12345").national).toBe("99912345");
  });
});

describe("formatPhone / compactPhone", () => {
  it("joins the code and the digits, and is empty without digits", () => {
    expect(formatPhone("IN", "98765 43210")).toBe("+91 9876543210");
    expect(formatPhone("GB", "abc")).toBe("");
    expect(formatPhone("US", "")).toBe("");
  });
  it("compacts for Razorpay / tel: links", () => {
    expect(compactPhone("+91 9876543210")).toBe("+919876543210");
    expect(compactPhone("9876543210")).toBe("+919876543210");
    expect(compactPhone("")).toBe("");
  });
  it("round-trips", () => {
    for (const iso of ["IN", "US", "GB", "AE", "AU", "SG"]) {
      const c = countryByIso(iso);
      const back = parsePhone(formatPhone(iso, c.example), iso);
      expect(back).toEqual({ iso, national: c.example });
    }
  });
});

describe("phoneError", () => {
  it("accepts a plausible number and names what is wrong otherwise", () => {
    expect(phoneError("+91 9876543210")).toBe("");
    expect(phoneError("+91 98765")).toBe("a valid 10-digit number for +91");
    expect(phoneError("+91 98765432101")).toBe("a valid 10-digit number for +91"); // one digit too many
    expect(phoneError("+44 7400123456")).toBe("");
    expect(phoneError("+44 740012345")).toBe(""); // UK numbers can be 9 or 10 digits
    expect(phoneError("+62 12")).toMatch(/for \+62 \(\d+–\d+ digits\)/); // a range where one length isn't fixed
    expect(phoneError("")).not.toBe(""); // callers check "is it filled in" themselves
  });
});

describe("searchCountries", () => {
  const isos = (q) => (searchCountries(q) || []).map((c) => c.iso);
  it("returns null for an empty query so the full list shows", () => {
    expect(searchCountries("")).toBeNull();
    expect(searchCountries("   ")).toBeNull();
  });
  it("finds by name, iso, nickname and calling code", () => {
    expect(isos("india")).toContain("IN");
    expect(isos("ind")[0]).toBe("IN"); // starts with it
    expect(isos("uk")[0]).toBe("GB"); // the UK, not Ukraine
    expect(isos("uae")[0]).toBe("AE");
    expect(isos("gb")[0]).toBe("GB");
    expect(isos("+44")[0]).toBe("GB"); // the main country of a shared code first
    expect(isos("44")).toEqual(expect.arrayContaining(["GB", "JE", "GG", "IM"]));
    expect(isos("+9")).toEqual(expect.arrayContaining(["IN", "PK"]));
  });
  it("ignores accents and finds nothing for nonsense", () => {
    expect(isos("cote")).toContain("CI");
    expect(isos("zzzzzz")).toEqual([]);
  });
});
