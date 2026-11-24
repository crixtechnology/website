// Basic / Plus / Pro plans. A course or internship from the API carries
// `tiers: [{ tier, price, originalPrice, discountPercent, features }]` — one entry per plan
// it sells (Backend/src/utils/tiers.js). No entries means nothing to buy
// online (apply / request-to-enroll instead), which is also what the static
// content.js fallback items look like, since they carry no `tiers` at all.

export const TIER_ORDER = ["basic", "plus", "pro"];

export const TIER_LABEL = { basic: "Basic", plus: "Plus", pro: "Pro" };

export const tierLabel = (tier) => TIER_LABEL[tier] || "";

// The plans on offer for an item, always in basic -> plus -> pro order.
export function offeredTiers(item) {
  return (item?.tiers || [])
    .filter((t) => t && TIER_ORDER.includes(t.tier) && t.price != null)
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
}

// What the buyer actually pays for one plan, in whole rupees.
export function planPrice(plan) {
  return Math.round(plan.price * (1 - (plan.discountPercent || 0) / 100));
}

// The price before the offer, to show struck through beside planPrice(plan):
// the plan's original price when Admin set one, else — for an older plan with
// a % discount — its own price. Null when there's nothing to cross out.
export function listPrice(plan) {
  const now = planPrice(plan);
  if (plan.originalPrice != null && Number(plan.originalPrice) > now) return Number(plan.originalPrice);
  return plan.price > now ? plan.price : null;
}

// How much is off, as a whole percentage of the struck-through price (0 = no offer).
export function offPercent(plan) {
  const was = listPrice(plan);
  return was ? Math.round(((was - planPrice(plan)) / was) * 100) : 0;
}

// Whole rupees print bare (₹2,999); an amount with paise keeps both digits
// (₹4,799.20), as an upgrade's price difference can.
export const formatINR = (amount) =>
  Number.isInteger(amount)
    ? `₹${amount.toLocaleString("en-IN")}`
    : `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A training fee as a logged-out visitor sees it: the first and last digit,
// everything between (separators too) as X, and a * after it
// (₹4,999 -> ₹4XXX9*; ₹12,499 -> ₹1XXXX9*). Logging in shows the real price.
// Amounts of two digits or fewer keep their digits, still with the *.
export const maskINR = (amount) => {
  const num = formatINR(amount).slice(1);
  if (num.length < 3) return `₹${num}*`;
  return `₹${num[0]}${"X".repeat(num.length - 2)}${num[num.length - 1]}*`;
};

// Every plan priced at ₹0: a free opportunity, not something sold on the
// Programs page (free roles live on Careers). Kept off the Programs grid,
// "You might also like" and the sitemap (scripts/prerender-meta.js has a copy).
export function isFreeProgram(item) {
  const plans = offeredTiers(item);
  return plans.length > 0 && plans.every((p) => !p.price);
}

// "Buy" is only offered when something is priced AND the admin has opened it.
// A closed item hides its prices entirely and falls back to the request form.
export function isOpenForBuy(item) {
  return item?.status !== "closed" && offeredTiers(item).length > 0;
}
