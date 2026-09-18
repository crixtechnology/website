// Mirrors Backend/src/utils/validators.js so "a valid email"/"a valid phone
// number" means the same thing on both sides — this gives instant feedback
// before a round trip, the backend re-checks the same rules regardless.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return EMAIL_RE.test(String(email).trim());
}

// Country codes offered by every phone field on the site (InquiryModal,
// ServiceInquiryModal, Contact). `digits` is the expected local number
// length for that country — used to give a specific "10-digit number" hint
// beyond the backend's own generic 8-15-digit range check.
export const COUNTRY_CODES = [
  { code: "+91", label: "🇮🇳 +91", digits: 10 },
  { code: "+1", label: "🇺🇸 +1", digits: 10 },
  { code: "+44", label: "🇬🇧 +44", digits: 10 },
  { code: "+61", label: "🇦🇺 +61", digits: 9 },
  { code: "+971", label: "🇦🇪 +971", digits: 9 },
  { code: "+65", label: "🇸🇬 +65", digits: 8 },
  { code: "+49", label: "🇩🇪 +49", digits: 10 },
  { code: "+81", label: "🇯🇵 +81", digits: 10 },
  { code: "+86", label: "🇨🇳 +86", digits: 11 },
  { code: "+92", label: "🇵🇰 +92", digits: 10 },
];

// Returns "" when `digits` is a valid local number for `countryCode`, or a
// sentence fragment (e.g. "a valid 10-digit number for +91") to slot into
// the same "Please add X, Y and Z." messages every form here already builds.
export function phoneLengthError(countryCode, digits) {
  const country = COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];
  return String(digits).length === country.digits ? "" : `a valid ${country.digits}-digit number for ${country.code}`;
}
