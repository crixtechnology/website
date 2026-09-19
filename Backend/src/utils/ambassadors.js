const { prisma } = require("../db");
const { nextSequence } = require("./counter");
const { ensureReferralCode } = require("./referrals");

// Campus ambassador programme.
//
// A student applies; an admin approves. An approved ambassador shares their
// referral code (the same one every student has — utils/referrals.js). Friends
// who use it get the usual welcome discount, and when a friend's first purchase
// goes through the ambassador earns a COMMISSION: a percentage of what that
// friend paid. Commissions sit on hold for a few days, then become payable; the
// ambassador requests a payout and the admin pays it by UPI / bank transfer and
// records it here. The site never moves money itself.
//
// Money is in PAISE unless a name says "Rupees".

const SETTINGS_KEY = "ambassador";
const DEFAULT_SETTINGS = {
  enabled: true,
  defaultCommissionPercent: 10,
  holdDays: 7,
  minPayoutRupees: 500,
  perks: [
    "An official Crix Campus Ambassador certificate",
    "A Crix ambassador welcome kit",
  ],
};

async function getSettings() {
  const row = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  return { ...DEFAULT_SETTINGS, ...((row && row.value) || {}) };
}

async function saveSettings(input) {
  const body = input || {};
  const next = { ...(await getSettings()) };
  const whole = (v, min, max) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return { ok: false, error: "enabled must be true or false" };
    next.enabled = body.enabled;
  }
  if (body.defaultCommissionPercent !== undefined) {
    if (!whole(body.defaultCommissionPercent, 0, 50)) return { ok: false, error: "Commission must be a whole number from 0 to 50 percent" };
    next.defaultCommissionPercent = Number(body.defaultCommissionPercent);
  }
  if (body.holdDays !== undefined) {
    if (!whole(body.holdDays, 0, 90)) return { ok: false, error: "The hold period must be a whole number of days from 0 to 90" };
    next.holdDays = Number(body.holdDays);
  }
  if (body.minPayoutRupees !== undefined) {
    if (!whole(body.minPayoutRupees, 1, 100000)) return { ok: false, error: "The minimum payout must be a whole number of rupees from 1 to 100000" };
    next.minPayoutRupees = Number(body.minPayoutRupees);
  }
  if (body.perks !== undefined) {
    if (!Array.isArray(body.perks)) return { ok: false, error: "perks must be a list" };
    const perks = body.perks.map((p) => String(p).trim()).filter(Boolean);
    if (perks.length > 10 || perks.some((p) => p.length > 140)) return { ok: false, error: "List at most 10 perks of up to 140 characters each" };
    next.perks = perks;
  }
  await prisma.setting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: next }, update: { value: next } });
  return { ok: true, settings: next };
}

// This ambassador's commission %: their own override, else the programme default.
const effectivePercent = (ambassador, settings) =>
  ambassador.commissionPercent != null ? ambassador.commissionPercent : settings.defaultCommissionPercent;

// ---------- validation ----------
const UPI_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,40}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;
const clean = (v) => String(v == null ? "" : v).trim();

// The application form. Returns { ok, data } or { ok:false, error }.
function parseApplication(body) {
  const b = body || {};
  const data = {
    college: clean(b.college),
    city: clean(b.city),
    yearOfStudy: clean(b.yearOfStudy),
    branch: clean(b.branch),
    socialHandle: clean(b.socialHandle),
    motivation: clean(b.motivation),
  };
  if (data.college.length < 2 || data.college.length > 120) return { ok: false, error: "Enter your college name." };
  if (data.city.length < 2 || data.city.length > 80) return { ok: false, error: "Enter your college's city." };
  if (data.yearOfStudy.length > 30) return { ok: false, error: "Year of study is too long." };
  if (data.branch.length > 80) return { ok: false, error: "Course / branch is too long." };
  if (data.socialHandle.length > 100) return { ok: false, error: "Social handle is too long." };
  if (data.motivation.length < 20) return { ok: false, error: "Tell us a little more about why you'd be a great ambassador (at least a couple of sentences)." };
  if (data.motivation.length > 1000) return { ok: false, error: "Keep it under 1000 characters." };
  return { ok: true, data };
}

// The profile an approved ambassador maintains: payout details + kit address.
// Every field is optional; only what's sent changes, and an empty string clears it.
function parseProfile(body) {
  const b = body || {};
  const data = {};
  if (b.upiId !== undefined) {
    const upi = clean(b.upiId);
    if (upi && !UPI_RE.test(upi)) return { ok: false, error: "That doesn't look like a UPI ID (for example name@okbank)." };
    data.upiId = upi;
  }
  if (b.bankHolder !== undefined) {
    const v = clean(b.bankHolder);
    if (v.length > 80) return { ok: false, error: "Account holder name is too long." };
    data.bankHolder = v;
  }
  if (b.bankAccount !== undefined) {
    const v = clean(b.bankAccount).replace(/\s+/g, "");
    if (v && !ACCOUNT_RE.test(v)) return { ok: false, error: "Enter the bank account number using 9 to 18 digits." };
    data.bankAccount = v;
  }
  if (b.bankIfsc !== undefined) {
    const v = clean(b.bankIfsc).toUpperCase();
    if (v && !IFSC_RE.test(v)) return { ok: false, error: "That doesn't look like an IFSC code (for example HDFC0001234)." };
    data.bankIfsc = v;
  }
  if (b.shippingAddress !== undefined) {
    const v = clean(b.shippingAddress);
    if (v.length > 400) return { ok: false, error: "The address is too long." };
    data.shippingAddress = v;
  }
  return { ok: true, data };
}

// Where a payout would go, or null if the ambassador hasn't saved a complete
// way to be paid (a UPI ID, or holder + account + IFSC).
function payoutDestination(a) {
  if (a.upiId) return `UPI: ${a.upiId}`;
  if (a.bankHolder && a.bankAccount && a.bankIfsc) return `Bank: ${a.bankHolder} · A/C ${a.bankAccount} · IFSC ${a.bankIfsc}`;
  return null;
}

const maskAccount = (n) => (n ? `${"•".repeat(Math.max(0, n.length - 4))}${n.slice(-4)}` : "");

// ---------- lifecycle ----------
// Approving an ambassador: they need a code to share, and a certificate to show
// for it. Safe to call again — it only fills in what's missing.
async function onApproved(ambassadorId) {
  const a = await prisma.ambassador.findUnique({ where: { id: ambassadorId } });
  if (!a) return null;
  await ensureReferralCode(a.userId);
  const data = {};
  if (!a.approvedAt) data.approvedAt = new Date();
  if (!a.certificateNumber) {
    const seq = await nextSequence("ambassador");
    data.certificateNumber = `CRX-AMB-${new Date().getFullYear()}-${String(seq).padStart(5, "0")}`;
    data.certificateIssuedAt = new Date();
  }
  if (Object.keys(data).length) return prisma.ambassador.update({ where: { id: ambassadorId }, data });
  return a;
}

// ---------- money ----------
// Breaks an ambassador's commissions into the buckets the dashboard shows:
//   onHold    — earned, still inside the hold period
//   available — payable now, not yet requested
//   requested — claimed by a payout request the admin hasn't paid yet
//   paid      — already paid out
async function earningsSummary(ambassadorId) {
  const now = new Date();
  const [earnings, referred, paidCount] = await Promise.all([
    prisma.ambassadorEarning.findMany({
      where: { ambassadorId, void: false },
      include: { payout: { select: { status: true } } },
    }),
    prisma.referral.count({ where: { ambassadorId } }),
    prisma.referral.count({ where: { ambassadorId, status: "rewarded" } }),
  ]);
  const sum = { total: 0, onHold: 0, available: 0, requested: 0, paid: 0 };
  for (const e of earnings) {
    sum.total += e.amount;
    if (e.payout && e.payout.status === "paid") sum.paid += e.amount;
    else if (e.payout && e.payout.status === "requested") sum.requested += e.amount;
    else if (e.availableAt > now) sum.onHold += e.amount;
    else sum.available += e.amount;
  }
  return { ...sum, referred, paidCount };
}

// The friend's first purchase went through: credit the ambassador their cut.
// Called from rewardReferrerForPurchase. Idempotent (referralId is unique), and
// a suspended ambassador earns nothing on it.
async function recordEarning(referral, payment) {
  const ambassador = await prisma.ambassador.findUnique({ where: { id: referral.ambassadorId } });
  if (!ambassador || ambassador.status !== "approved") return null;
  const settings = await getSettings();
  const percent = referral.commissionPercent;
  const amount = Math.round((payment.amount * percent) / 100);
  if (amount <= 0) return null;
  try {
    return await prisma.ambassadorEarning.create({
      data: {
        ambassadorId: ambassador.id,
        referralId: referral.id,
        paymentId: payment.id,
        baseAmount: payment.amount,
        percent,
        amount,
        availableAt: new Date(Date.now() + settings.holdDays * 24 * 60 * 60 * 1000),
      },
    });
  } catch (e) {
    if (e && e.code === "P2002") return null;
    throw e;
  }
}

// Turns everything currently payable into one payout request. Returns
// { ok, payout } or { ok:false, error }.
async function requestPayout(ambassador) {
  const settings = await getSettings();
  const payTo = payoutDestination(ambassador);
  if (!payTo) return { ok: false, error: "Add your UPI ID or bank details first, so we know where to pay you." };

  try {
    const payout = await prisma.$transaction(async (tx) => {
      const rows = await tx.ambassadorEarning.findMany({
        where: { ambassadorId: ambassador.id, void: false, payoutId: null, availableAt: { lte: new Date() } },
      });
      const total = rows.reduce((n, e) => n + e.amount, 0);
      if (total < settings.minPayoutRupees * 100) {
        const err = new Error("below-minimum");
        err.total = total;
        throw err;
      }
      const created = await tx.ambassadorPayout.create({ data: { ambassadorId: ambassador.id, amount: total, payTo } });
      // Only claim rows nobody else got to first (a double click / two tabs).
      const claimed = await tx.ambassadorEarning.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, payoutId: null },
        data: { payoutId: created.id },
      });
      if (claimed.count !== rows.length) throw new Error("race");
      return created;
    });
    return { ok: true, payout };
  } catch (e) {
    if (e.message === "below-minimum") {
      return { ok: false, error: `You can request a payout once ₹${settings.minPayoutRupees} is available (you have ₹${e.total / 100} right now).` };
    }
    if (e.message === "race") return { ok: false, error: "A payout was just requested — refresh to see it." };
    throw e;
  }
}

module.exports = {
  getSettings,
  saveSettings,
  effectivePercent,
  parseApplication,
  parseProfile,
  payoutDestination,
  maskAccount,
  onApproved,
  earningsSummary,
  recordEarning,
  requestPayout,
};
