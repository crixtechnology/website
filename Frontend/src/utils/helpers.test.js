import { offeredTiers, planPrice, formatINR, isOpenForBuy, tierLabel } from "./tiers.js";
import { isValidName, isValidEmail, isDisposableEmail, emailFormatError } from "./validators.js";
import { captureReferralFromUrl, getStoredReferral, clearStoredReferral, referralLink } from "./referral.js";

describe("plans", () => {
  const item = {
    status: "open",
    tiers: [
      { tier: "pro", price: 3000 },
      { tier: "basic", price: 1000 },
      { tier: "plus", price: 2000, discountPercent: 25 },
      { tier: "gold", price: 1 }, // not a plan
      { tier: "plus", price: null }, // no price set
    ],
  };
  it("lists the plans basic -> plus -> pro and drops anything else", () => {
    expect(offeredTiers(item).map((t) => t.tier)).toEqual(["basic", "plus", "pro"]);
  });
  it("prices in whole rupees, matching what the server charges", () => {
    expect(planPrice({ price: 2000, discountPercent: 25 })).toBe(1500);
    expect(planPrice({ price: 5999, discountPercent: 20 })).toBe(4799); // 4799.20 rounds down
    expect(planPrice({ price: 999 })).toBe(999);
  });
  it("formats rupees", () => {
    expect(formatINR(2999)).toBe("₹2,999");
    expect(formatINR(150000)).toBe("₹1,50,000");
    expect(formatINR(4799.2)).toBe("₹4,799.20");
  });
  it("is open for purchase only when something is priced and not closed", () => {
    expect(isOpenForBuy({ status: "open", tiers: [{ tier: "basic", price: 1 }] })).toBe(true);
    expect(isOpenForBuy({ status: "closed", tiers: [{ tier: "basic", price: 1 }] })).toBe(false);
    expect(isOpenForBuy({ status: "open", tiers: [] })).toBe(false);
    expect(isOpenForBuy(undefined)).toBe(false);
  });
  it("labels plans", () => {
    expect(tierLabel("plus")).toBe("Plus");
    expect(tierLabel("nope")).toBe("");
  });
});

describe("validators", () => {
  it("checks names, emails and disposable domains", () => {
    expect(isValidName("Mary-Jane O'Connor")).toBe(true);
    expect(isValidName("Zoë")).toBe(true);
    expect(isValidName("R2D2")).toBe(false);
    expect(isValidName("A")).toBe(false);
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(emailFormatError("nope")).toMatch(/valid email/);
    expect(emailFormatError("x@mailinator.com")).toMatch(/permanent/);
    expect(emailFormatError("real@gmail.com")).toBe("");
  });
});

describe("referral link capture", () => {
  beforeEach(() => window.localStorage.clear());
  it("remembers a well-formed code from ?ref= in upper case", () => {
    captureReferralFromUrl("?ref=crix-k7p3qz");
    expect(getStoredReferral()).toBe("CRIX-K7P3QZ");
    clearStoredReferral();
    expect(getStoredReferral()).toBe("");
  });
  it("ignores missing or malformed codes", () => {
    captureReferralFromUrl("");
    captureReferralFromUrl("?ref=");
    captureReferralFromUrl("?ref=<script>");
    captureReferralFromUrl("?ref=" + "A".repeat(40));
    expect(getStoredReferral()).toBe("");
  });
  it("builds the share link", () => {
    expect(referralLink("CRIX-ABC123")).toBe(`${window.location.origin}/?ref=CRIX-ABC123`);
  });
});
