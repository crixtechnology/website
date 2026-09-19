import { COUNTRY_DATA } from "../data/countryData.js";

// Country list + phone-number helpers shared by every phone field on the site
// (see components/PhoneInput.jsx). A phone number is stored as ONE string,
// "<+code> <national digits>" — e.g. "+91 9876543210" — which is what the forms
// already sent to the API before there was a country picker.

export const DEFAULT_COUNTRY = "IN";

// Shown first in the picker, in this order, before the full A–Z list.
const POPULAR = ["IN", "US", "GB", "AE", "AU", "SG", "CA", "DE", "PK"];

// Extra words a visitor might type that aren't in the official country name.
const ALIASES = {
  GB: "uk britain england scotland wales",
  US: "usa america",
  AE: "uae emirates dubai abu dhabi",
  KR: "south korea",
  KP: "north korea",
  CZ: "czech republic",
  MM: "burma",
  TR: "turkey",
  NL: "holland",
  CI: "ivory coast",
  SZ: "swaziland",
  MK: "macedonia",
  CV: "cape verde",
  TL: "east timor",
};

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const regionNames = (() => {
  try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { return null; }
})();
const nameOf = (iso) => {
  try { return (regionNames && regionNames.of(iso)) || iso; } catch (e) { return iso; }
};

export const COUNTRIES = COUNTRY_DATA
  .map(([iso, dial, min, max, example, main]) => {
    const name = nameOf(iso);
    return {
      iso, name, dial: `+${dial}`, digits: dial, min, max, example, main: !!main,
      search: norm(`${name} ${iso} ${ALIASES[iso] || ""}`),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));
export const countryByIso = (iso) => BY_ISO.get(iso) || BY_ISO.get(DEFAULT_COUNTRY);

export const POPULAR_COUNTRIES = POPULAR.map((iso) => BY_ISO.get(iso)).filter(Boolean);
const POPULAR_SET = new Set(POPULAR);
export const OTHER_COUNTRIES = COUNTRIES.filter((c) => !POPULAR_SET.has(c.iso));

// calling code (digits only) -> the countries that share it
const BY_DIAL = new Map();
for (const c of COUNTRIES) {
  if (!BY_DIAL.has(c.digits)) BY_DIAL.set(c.digits, []);
  BY_DIAL.get(c.digits).push(c);
}

// Countries matching what the visitor typed in the picker's search box: a name
// ("ind"), an ISO code ("gb"), a nickname ("uk"), or a calling code ("+44"/"44").
// Best matches (name starts with the text) come first.
export function searchCountries(query) {
  const q = norm(query).trim();
  if (!q) return null;
  if (/^\+?\d+$/.test(q)) {
    const d = q.replace("+", "");
    return COUNTRIES.filter((c) => c.digits.startsWith(d)).sort((x, y) => Number(y.main) - Number(x.main));
  }
  // exact ISO code / nickname first ("uk" is the UK, not Ukraine), then names starting with it
  const rank = (c) => {
    if (c.iso.toLowerCase() === q || c.search.split(" ").includes(q)) return 0;
    return norm(c.name).startsWith(q) ? 1 : 2;
  };
  return COUNTRIES.filter((c) => c.search.includes(q)).sort((x, y) => rank(x) - rank(y));
}

// Splits a stored/typed phone string into { iso, national }. A leading "+" is
// matched against the known calling codes; when several countries share one
// (+1, +44, +7 ...) `preferredIso` wins if it's among them, else the main one.
// A number with no "+" is taken to be a national number in `preferredIso`
// (the site's default country when there isn't one) — that's how numbers saved
// before this field existed look.
export function parsePhone(value, preferredIso) {
  const fallback = countryByIso(preferredIso || DEFAULT_COUNTRY);
  const s = String(value == null ? "" : value).trim();
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+") || s.startsWith("00")) {
    const all = s.startsWith("00") ? digits.slice(2) : digits;
    for (const len of [3, 2, 1]) {
      const list = BY_DIAL.get(all.slice(0, len));
      if (list) {
        const pick = list.find((c) => c.iso === (preferredIso || "")) || list.find((c) => c.main) || list[0];
        return { iso: pick.iso, national: all.slice(len) };
      }
    }
    return { iso: fallback.iso, national: all };
  }
  return { iso: fallback.iso, national: digits };
}

// The string to store: "+91 9876543210", or "" when there's no number yet (so
// "is the phone filled in?" checks keep working on the plain string).
export function formatPhone(iso, national) {
  const digits = String(national || "").replace(/\D/g, "");
  return digits ? `${countryByIso(iso).dial} ${digits}` : "";
}

// "" when `value` is a plausible number for its country, else a sentence
// fragment ("a valid 10-digit number for +91") to slot into the same
// "Please add X, Y and Z." messages the forms already build. Presence is the
// caller's job (some forms treat the phone as optional).
export function phoneError(value) {
  const { iso, national } = parsePhone(value);
  const c = countryByIso(iso);
  if (national.length >= c.min && national.length <= c.max) return "";
  return c.min === c.max
    ? `a valid ${c.min}-digit number for ${c.dial}`
    : `a valid number for ${c.dial} (${c.min}–${c.max} digits)`;
}

// A phone number as Razorpay/tel: links want it: "+919876543210". Numbers
// saved without a country code are Indian.
export function compactPhone(value) {
  const { iso, national } = parsePhone(value);
  return national ? `${countryByIso(iso).dial}${national}` : "";
}
