const crypto = require("crypto");
const { prisma } = require("../db");

// Emailed one-time codes for the password flows. See EmailOtp in
// prisma/schema.prisma.

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
// A code can be re-sent at most this often — stops the endpoint being used to
// flood someone's inbox.
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const PURPOSES = { RESET: "reset_password", REVEAL: "view_password" };

function hashCode(userId, purpose, code) {
  // HMAC with a server secret: a 6-digit code has only 1M possibilities, so a
  // plain hash would be instantly reversible if the table ever leaked.
  return crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${userId}:${purpose}:${code}`).digest("hex");
}

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

// Creates (replacing any earlier one) a code for this user + purpose.
// Returns { code } to email, or { wait } (seconds) if one was sent too recently.
async function issueOtp(userId, purpose) {
  const existing = await prisma.emailOtp.findUnique({ where: { userId_purpose: { userId, purpose } } });
  if (existing) {
    const age = Date.now() - existing.createdAt.getTime();
    if (age < OTP_RESEND_COOLDOWN_MS) return { wait: Math.ceil((OTP_RESEND_COOLDOWN_MS - age) / 1000) };
  }
  const code = generateCode();
  const data = {
    codeHash: hashCode(userId, purpose, code),
    attempts: 0,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    createdAt: new Date(),
  };
  await prisma.emailOtp.upsert({
    where: { userId_purpose: { userId, purpose } },
    create: { userId, purpose, ...data },
    update: data,
  });
  return { code };
}

// Checks a submitted code. A code is single-use: a correct one is deleted, and
// a wrong one burns an attempt — after OTP_MAX_ATTEMPTS the code is dead and a
// new one must be requested, so it can't be brute-forced. Returns true/false;
// callers give the same generic error for every kind of failure.
async function verifyOtp(userId, purpose, submitted) {
  const code = String(submitted || "").trim();
  if (!/^\d{6}$/.test(code)) return false;

  const row = await prisma.emailOtp.findUnique({ where: { userId_purpose: { userId, purpose } } });
  if (!row) return false;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.emailOtp.deleteMany({ where: { id: row.id } });
    return false;
  }

  // Burn the attempt BEFORE comparing, atomically — concurrent guesses can't
  // squeeze in extra tries past the cap, because only requests whose increment
  // actually matched (attempts still < max) get to compare.
  const burned = await prisma.emailOtp.updateMany({
    where: { id: row.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (burned.count === 0) {
    await prisma.emailOtp.deleteMany({ where: { id: row.id } });
    return false;
  }

  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(hashCode(userId, purpose, code), "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;

  // Only the request whose delete actually removed the row wins — two requests
  // submitting the same correct code at once can't both succeed.
  const consumed = await prisma.emailOtp.deleteMany({ where: { id: row.id } });
  return consumed.count === 1;
}

async function clearOtps(userId) {
  await prisma.emailOtp.deleteMany({ where: { userId } });
}

module.exports = { issueOtp, verifyOtp, clearOtps, PURPOSES, OTP_TTL_MS, OTP_MAX_ATTEMPTS };
