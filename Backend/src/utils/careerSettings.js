const { prisma } = require("../db");

// Admin-editable rules for the careers flow and the credit it hands out, kept
// in the same key/value Setting table as the referral rules.
//
//   testFeeRupees          what the aptitude test costs (it comes back as credit)
//   signupBonusCredits     credit a new student account starts with (0 = none)
//   creditExpiryMonths     how long that credit and the test-fee credit last (0 = forever)
//   creditUsagePercent     the most of one purchase that wallet credit may pay for
//   violationLimit         violations after which a test is submitted automatically
//   snapshotIntervalSeconds how often the test page takes a webcam photo
//   generatedQuestionsPercent share of each test made of questions written on the
//                          spot with fresh values (utils/questionGenerators.js); 0 = bank only
//   reapplyCooldownDays    days before someone can apply again to the same FREE
//                          role after an application there ended without an offer
//                          (0 = straight away). Paid roles need a new fee anyway.
//   requireWebcam          refuse to start a test without a working webcam
//   requireDesktopApp      only allow the test inside the desktop lockdown app
const SETTINGS_KEY = "careers";
const DEFAULT_SETTINGS = {
  testFeeRupees: 289,
  signupBonusCredits: 300,
  creditExpiryMonths: 12,
  creditUsagePercent: 100,
  violationLimit: 3,
  snapshotIntervalSeconds: 60,
  generatedQuestionsPercent: 30,
  reapplyCooldownDays: 30,
  requireWebcam: true,
  requireDesktopApp: false,
};

// [min, max] for each whole-number setting.
const INT_RANGES = {
  testFeeRupees: [1, 100000, "The test fee must be a whole number of rupees from 1 to 100000"],
  signupBonusCredits: [0, 100000, "The signup bonus must be a whole number from 0 to 100000"],
  creditExpiryMonths: [0, 120, "Credit expiry must be a whole number of months from 0 (never) to 120"],
  creditUsagePercent: [0, 100, "The credit usage limit must be a whole number from 0 to 100 percent"],
  violationLimit: [1, 50, "The violation limit must be a whole number from 1 to 50"],
  snapshotIntervalSeconds: [20, 600, "The webcam interval must be a whole number of seconds from 20 to 600"],
  generatedQuestionsPercent: [0, 100, "The share of generated questions must be a whole number from 0 to 100 percent"],
  reapplyCooldownDays: [0, 365, "The re-apply wait must be a whole number of days from 0 to 365"],
};
const BOOLEANS = ["requireWebcam", "requireDesktopApp"];

// `db` lets a caller already inside a transaction read through it.
async function getCareerSettings(db = prisma) {
  const row = await db.setting.findUnique({ where: { key: SETTINGS_KEY } });
  return { ...DEFAULT_SETTINGS, ...((row && row.value) || {}) };
}

// Validates and stores the admin's edits. Returns { ok, settings } or { ok:false, error }.
async function saveCareerSettings(input) {
  const body = input || {};
  const next = await getCareerSettings();

  for (const [key, [min, max, message]] of Object.entries(INT_RANGES)) {
    if (body[key] === undefined) continue;
    const n = typeof body[key] === "number" ? body[key] : NaN;
    if (!Number.isInteger(n) || n < min || n > max) return { ok: false, error: message };
    next[key] = n;
  }
  for (const key of BOOLEANS) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "boolean") return { ok: false, error: `${key} must be true or false` };
    next[key] = body[key];
  }
  await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next },
    update: { value: next },
  });
  return { ok: true, settings: next };
}

// When credit added at `from` stops being usable; null = never.
function creditExpiryDate(months, from = new Date()) {
  if (!(months > 0)) return null;
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

module.exports = { DEFAULT_SETTINGS, getCareerSettings, saveCareerSettings, creditExpiryDate };
