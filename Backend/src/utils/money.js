// Rounds to 2 decimal places the way currency should always be handled —
// prevents floating-point dust (e.g. 3998.9999999) leaking into stored
// receipt amounts. Same helper as crix-billing-receipt's src/utils/money.js.
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

module.exports = { round2 };
