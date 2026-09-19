// Pricing plans. Every course/internship can offer up to three plans — basic,
// plus and pro — each with its own price, discount and admin-written feature
// list (CourseTier rows, prisma/schema.prisma). A tier row existing means that
// plan is on offer; an item with no rows is apply-only. Plans are descriptive:
// they change what the buyer pays and what the card promises, not what
// Lecture/Video routes let them open.

const TIERS = ["basic", "plus", "pro"];

const MAX_FEATURES = 20;
const MAX_FEATURE_LENGTH = 200;

// Spread into any Prisma query that returns a Course the frontend will price.
// `tier` is a MySQL ENUM, which sorts by declaration order, so asc is
// basic -> plus -> pro.
const WITH_TIERS = {
  tiers: {
    orderBy: { tier: "asc" },
    select: { id: true, tier: true, price: true, discountPercent: true, features: true },
  },
};

// "plus" -> "Plus", for receipts and emails; empty for an untiered record.
function tierLabel(tier) {
  return isTier(tier) ? tier[0].toUpperCase() + tier.slice(1) : "";
}

// 0 = basic, 1 = plus, 2 = pro — a higher rank is a higher plan (an upgrade).
function tierRank(tier) {
  return TIERS.indexOf(tier);
}

function isTier(value) {
  return TIERS.includes(value);
}

// Validates the `tiers` array an admin request sends: [{ tier, price,
// discountPercent?, features? }, ...]. An entry with a blank/null price means
// "not offered" and is dropped rather than rejected, so the admin form can send
// all three rows and simply leave the ones it doesn't sell empty.
// Returns { ok: true, tiers } (normalised, de-duplicated) or { ok: false, error }.
function parseTiers(input) {
  if (!Array.isArray(input)) return { ok: false, error: "tiers must be an array" };

  const seen = new Set();
  const tiers = [];
  for (const raw of input) {
    if (!raw || !isTier(raw.tier)) {
      return { ok: false, error: `Each plan needs a tier of ${TIERS.join(", ")}.` };
    }
    if (seen.has(raw.tier)) return { ok: false, error: `The ${raw.tier} plan is listed more than once.` };
    seen.add(raw.tier);

    if (raw.price === null || raw.price === undefined || raw.price === "") continue;
    const price = Number(raw.price);
    if (!Number.isFinite(price) || price < 0) {
      return { ok: false, error: `The ${raw.tier} plan needs a price of 0 or more.` };
    }

    const discountPercent = raw.discountPercent === undefined || raw.discountPercent === null || raw.discountPercent === ""
      ? 0
      : Number(raw.discountPercent);
    if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      return { ok: false, error: `The ${raw.tier} plan's discount must be a whole number from 0 to 100.` };
    }

    const features = Array.isArray(raw.features)
      ? raw.features.map((f) => String(f).trim()).filter(Boolean)
      : [];
    if (features.length > MAX_FEATURES || features.some((f) => f.length > MAX_FEATURE_LENGTH)) {
      return {
        ok: false,
        error: `The ${raw.tier} plan can list at most ${MAX_FEATURES} features of ${MAX_FEATURE_LENGTH} characters each.`,
      };
    }

    tiers.push({ tier: raw.tier, price, discountPercent, features });
  }
  return { ok: true, tiers };
}

// What one plan actually charges, in rupees — the same discount maths the
// order (payments.js) and every price shown on the site use.
function tierTotal(tier) {
  return tier.price * (1 - (tier.discountPercent || 0) / 100);
}

module.exports = { TIERS, WITH_TIERS, isTier, tierRank, tierLabel, parseTiers, tierTotal };
