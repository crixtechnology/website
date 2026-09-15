// Minimal, dependency-free number → words converter.
// Uses the Indian numbering system (lakh/crore) for INR, international
// (thousand/million) grouping for everything else.

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}

function threeDigits(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return (hundred ? ONES[hundred] + " Hundred" + (rest ? " " : "") : "") + (rest ? twoDigits(rest) : "");
}

function indianWords(n) {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = n;
  let parts = [];
  if (crore) parts.push(threeDigits(crore) + " Crore");
  if (lakh) parts.push(threeDigits(lakh) + " Lakh");
  if (thousand) parts.push(threeDigits(thousand) + " Thousand");
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ").trim();
}

function internationalWords(n) {
  if (n === 0) return "Zero";
  const million = Math.floor(n / 1000000); n %= 1000000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = n;
  let parts = [];
  if (million) parts.push(threeDigits(million) + " Million");
  if (thousand) parts.push(threeDigits(thousand) + " Thousand");
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ").trim();
}

export function amountToWords(amount, currency = "INR") {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const whole = Math.floor(Math.abs(rounded));
  const paise = Math.round((Math.abs(rounded) - whole) * 100);
  const words = currency === "INR" ? indianWords(whole) : internationalWords(whole);
  const unit = currency === "INR" ? "Rupees" : currency === "USD" ? "US Dollars" : currency;
  const subUnit = currency === "INR" ? "Paise" : "Cents";
  let out = `${words} ${unit}`;
  if (paise) out += ` and ${twoDigits(paise)} ${subUnit}`;
  return out + " Only";
}
