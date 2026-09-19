// Mirrors Backend/src/utils/validators.js so "a valid email"/"a valid phone
// number" means the same thing on both sides — this gives instant feedback
// before a round trip, the backend re-checks the same rules regardless.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return EMAIL_RE.test(String(email).trim());
}

// Well-known, long-lived disposable/temporary email providers — same list as
// Backend/src/utils/validators.js, kept in sync by hand since the two run in
// different bundlers. Not exhaustive; this is an instant-feedback layer, the
// backend is the real gate (a request that skips this JS can't skip that).
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "guerrillamail.biz",
  "guerrillamail.de", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com",
  "sharklasers.com", "grr.la", "pokemail.net", "spam4.me",
  "10minutemail.com", "10minutemail.net", "20minutemail.com",
  "temp-mail.org", "temp-mail.io", "tempmail.com", "tempmail.net", "tempmailo.com",
  "tempmail.dev", "tempemail.co", "temporary-mail.net", "throwawaymail.com", "throwam.com",
  "yopmail.com", "yopmail.fr", "yopmail.net", "cool.fr.nf",
  "trashmail.com", "trashmail.net", "trash-mail.com", "dispostable.com",
  "fakeinbox.com", "fakemailgenerator.com", "getnada.com", "nada.email",
  "maildrop.cc", "mintemail.com", "moakt.com", "emailondeck.com",
  "mailnesia.com", "mohmal.com", "mailcatch.com", "mailsac.com",
  "spamgourmet.com", "tempinbox.com", "mytemp.email", "tempr.email",
  "inboxbear.com", "burnermail.io", "discard.email", "discardmail.com",
  "1secmail.com", "1secmail.net", "1secmail.org", "dropmail.me",
  "harakirimail.com", "luxusmail.org", "no-spam.ws", "spambog.com",
  "spamfree24.org", "emailtemporario.com.br", "airmail.cc",
]);

export function isDisposableEmail(email) {
  const domain = String(email).trim().toLowerCase().split("@")[1] || "";
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

// Returns "" when `email` passes both the format and disposable-domain
// checks, else a sentence fragment to slot into the same "Please add X, Y
// and Z." messages every form here already builds. Presence is the
// caller's job — some forms treat email as optional.
export function emailFormatError(email) {
  if (!isValidEmail(email)) return "a valid email address";
  if (isDisposableEmail(email)) return "a permanent email address (not a temporary/disposable one)";
  return "";
}

// Letters (incl. accented/non-Latin scripts) plus spaces, apostrophes, dots
// and hyphens — covers "Mary-Jane O'Connor", "Zoë", etc. without accepting
// digits or symbols a real name never has. 2-60 chars.
const NAME_RE = /^[\p{L}][\p{L} .'-]{1,59}$/u;

export function isValidName(name) {
  return NAME_RE.test(String(name).trim());
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

// Mirrors Backend/src/utils/validators.js's isValidHttpUrl — defense in
// depth for anywhere a stored link gets rendered straight into an <a href>
// (e.g. Learn.jsx's "Join live" button, built from an admin-set Lecture
// link). React does not strip a `javascript:` URI out of href on its own;
// the backend is the real gate (this can't help a request that skips it),
// but this stops a bad value already in the DB — pre-existing, or from
// anywhere that isn't this one validated route — from ever being rendered
// as a clickable link.
export function isValidHttpUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (e) {
    return false;
  }
}
