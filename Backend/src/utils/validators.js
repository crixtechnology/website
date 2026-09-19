// Shared field-format rules — was previously copy-pasted between
// routes/auth.js and routes/contact.js (which even said "same rule as
// auth.js" in a comment without actually importing it), risking the two
// silently drifting apart if one copy was ever tightened without the other.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return EMAIL_RE.test(String(email).trim());
}

// 8-15 digits after stripping formatting — covers a bare local number up to
// a full international one with country code, loose enough for the several
// plausible ways a visitor might type theirs (spaces, dashes, +91 prefix).
function isValidPhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

// Well-known, long-lived disposable/temporary email providers — students and
// leads sometimes use these to get past a "you must give an email" gate,
// which leaves the admin with no way to actually follow up. Not exhaustive
// (new throwaway domains appear constantly); this only catches the common,
// established ones. Checked on top of isValidEmail, not instead of it.
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

function isDisposableEmail(email) {
  const domain = String(email).trim().toLowerCase().split("@")[1] || "";
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

// Letters (incl. accented/non-Latin scripts) plus spaces, apostrophes, dots
// and hyphens — covers "Mary-Jane O'Connor", "Zoë", etc. without accepting
// digits or symbols a real name never has. 2-60 chars.
const NAME_RE = /^[\p{L}][\p{L} .'-]{1,59}$/u;

function isValidName(name) {
  return NAME_RE.test(String(name).trim());
}

// Restricts a stored link to an actual http(s) URL. Without this, an admin
// field like Lecture.link (rendered directly into a student-facing <a href>
// on the "Join live" button — Frontend/src/pages/student/Learn.jsx) could be
// set to a `javascript:` URI — React does NOT sanitize that scheme out of
// href by default — and execute in whichever student's browser clicks it,
// with access to their sessionStorage JWT. Only matters if the admin account
// setting it is malicious or compromised, but that shouldn't be a lever to
// pivot into arbitrary student account takeover, so it's checked at the API
// boundary regardless of what any particular UI does with the value.
function isValidHttpUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (e) {
    return false;
  }
}

module.exports = { EMAIL_RE, isValidEmail, isValidPhone, isDisposableEmail, NAME_RE, isValidName, isValidHttpUrl };
