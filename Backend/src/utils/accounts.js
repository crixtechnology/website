const bcrypt = require("bcryptjs");
const { prisma } = require("../db");
const { generateDefaultPassword, encryptPassword } = require("./passwordVault");

// hasPassword / hasDefaultPassword / isGoogleAccount drive the profile page's
// password section (Frontend Profile.jsx): whether "Change password" has a
// current password to ask for, and whether there's a system-generated starter
// password the owner can look up after an emailed OTP. Never the password itself.
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    hasPassword: !!user.passwordHash,
    hasDefaultPassword: !!user.defaultPasswordEnc,
    isGoogleAccount: !!user.googleId,
    mustChangePassword: !!user.mustChangePassword,
    profilePending: !!user.profilePending,
  };
}

// The profile details every purchase needs (course, internship, upgrade,
// payment request, aptitude-test fee): a real name — not the placeholder an
// account made from the login form starts with — and a phone number.
// Returns the missing ones, e.g. ["full name", "phone number"]; [] = complete.
function profileMissing(user) {
  const missing = [];
  if (!String(user.name || "").trim() || user.profilePending) missing.push("full name");
  if (!String(user.phone || "").trim()) missing.push("phone number");
  return missing;
}

// For payment routes: answers 400 PROFILE_INCOMPLETE (and returns true) when
// the signed-in student's profile isn't complete yet.
async function rejectIfProfileIncomplete(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  const missing = user ? profileMissing(user) : [];
  if (!missing.length) return false;
  res.status(400).json({
    ok: false,
    code: "PROFILE_INCOMPLETE",
    missing,
    error: `Please add your ${missing.join(" and ")} in your profile before paying.`,
  });
  return true;
}

// A starting name for an account made from the login form, from the email's
// local part ("rahul.sharma99@..." -> "Rahul Sharma"). Only a placeholder:
// the account stays profilePending until its owner saves a real name.
function nameFromEmail(email) {
  const words = String(email).split("@")[0].replace(/[^a-zA-Z]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ").slice(0, 60);
  return name.length >= 2 ? name : "Student";
}

// Gives a Google-created account a working email+password login: a random
// starter password, hashed like any password, with an encrypted copy the owner
// can view in their profile after an emailed OTP (utils/passwordVault.js).
// A no-op for an account that already has a password (e.g. a password account
// that later linked Google keeps the password its owner chose).
async function ensureDefaultPassword(user) {
  if (user.passwordHash) return user;
  const plain = generateDefaultPassword();
  const passwordHash = await bcrypt.hash(plain, 10);
  // `passwordHash: null` in the WHERE makes this race-safe: if two requests
  // land at once, only one write wins and the other's password is discarded
  // rather than overwriting a value the owner may already have seen.
  await prisma.user.updateMany({
    where: { id: user.id, passwordHash: null },
    data: { passwordHash, defaultPasswordEnc: encryptPassword(plain) },
  });
  // Re-read either way, so a lost race returns whoever won's stored values.
  return prisma.user.findUnique({ where: { id: user.id } });
}

module.exports = { publicUser, ensureDefaultPassword, profileMissing, rejectIfProfileIncomplete, nameFromEmail };
