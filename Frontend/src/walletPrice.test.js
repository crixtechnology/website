import { walletDiscount } from "./hooks/useWalletCredit.js";

// Mirrors checkout (Backend utils/referrals.js priceOrder).
it("takes wallet credit off the price, within the usage cap and the ₹1 minimum", () => {
  expect(walletDiscount(999, { available: 50, usagePercent: 100 })).toBe(50);
  expect(walletDiscount(999, { available: 5000, usagePercent: 100 })).toBe(998);
  expect(walletDiscount(1000, { available: 5000, usagePercent: 30 })).toBe(300);
  expect(walletDiscount(999, { available: 49.5, usagePercent: 100 })).toBe(49);
  expect(walletDiscount(999, null)).toBe(0);
  expect(walletDiscount(999, { available: 0, usagePercent: 100 })).toBe(0);
});

test("the card takes the whole price off when the wallet can pay for it outright", () => {
  const { walletOffPrice } = require("./hooks/useWalletCredit.js");
  expect(walletOffPrice(999, { available: 5000, usagePercent: 100 })).toBe(999);
  expect(walletOffPrice(999, { available: 300, usagePercent: 100 })).toBe(300);
  expect(walletOffPrice(1000, { available: 5000, usagePercent: 30 })).toBe(300);
  expect(walletOffPrice(999, null)).toBe(0);
});
