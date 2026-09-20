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
  };
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

module.exports = { publicUser, ensureDefaultPassword };
