const crypto = require("crypto");

// Starter passwords for accounts created through Google Sign-In.
//
// Google users never type a password, so without one they couldn't use the
// email+password login (or the "change password" form, which asks for the
// current one). We generate a random one at first Google sign-in, hash it into
// `passwordHash` like any other password, and ALSO keep an AES-256-GCM
// encrypted copy in `User.defaultPasswordEnc` so the owner can read it in
// their profile after an emailed OTP.
//
// Scope is deliberately narrow: only this system-generated password is ever
// stored recoverably. A password the user chooses (signup, change, reset) is
// bcrypt-only and can't be shown to anyone, and choosing one wipes the
// encrypted starter copy (routes/password.js).

// No look-alike characters (0/O, 1/l/I) — the user has to read this off a
// screen and type it.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const DEFAULT_PASSWORD_LENGTH = 12;

function generateDefaultPassword(length = DEFAULT_PASSWORD_LENGTH) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

// DEFAULT_PASSWORD_KEY should be its own long random secret in production, so
// a leaked JWT_SECRET doesn't also unlock stored starter passwords; falling
// back to JWT_SECRET keeps a fresh dev setup working with no extra config.
function vaultKey() {
  const secret = process.env.DEFAULT_PASSWORD_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("DEFAULT_PASSWORD_KEY (or JWT_SECRET) must be set to store starter passwords");
  return crypto.createHash("sha256").update(`crix-default-password:${secret}`).digest();
}

// Output: base64( iv(12) | authTag(16) | ciphertext )
function encryptPassword(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

// Returns null (never throws) on a wrong key or corrupted/tampered value, so a
// rotated key just means "can't be shown any more", not a 500.
function decryptPassword(blob) {
  try {
    const raw = Buffer.from(String(blob), "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", vaultKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch (e) {
    return null;
  }
}

module.exports = { generateDefaultPassword, encryptPassword, decryptPassword };
