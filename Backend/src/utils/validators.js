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

module.exports = { EMAIL_RE, isValidEmail, isValidPhone };
