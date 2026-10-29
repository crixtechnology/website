// Shared logic for the careers flow: job openings, the aptitude-test fee, the
// test paper and its scoring. Routes: routes/careers.js (public + candidate),
// routes/aptitudeTest.js (the test itself) and routes/adminCareers.js.
const crypto = require("crypto");
const { prisma } = require("../db");
const { safeEqual } = require("./safeCompare");
const { issueReceiptNumber } = require("./receiptNumber");
const { round2 } = require("./money");
const { creditBalance } = require("./referrals");
const { getCareerSettings, creditExpiryDate } = require("./careerSettings");
const { addNotification, sendCareerEmail } = require("./notifications");
const { generateQuestions, generatorCount } = require("./questionGenerators");
const { PENDING_PREFIX } = require("./proctorStorage");

// ---------- question bank categories ----------
const CATEGORIES = {
  quantitative: "Quantitative",
  logical: "Logical Reasoning",
  verbal: "Verbal Ability",
  quantitative_foundation: "Quantitative (foundation)",
  logical_foundation: "Logical Reasoning (foundation)",
  verbal_foundation: "Verbal Ability (foundation)",
  web: "Web Development",
  fullstack: "Full Stack Development",
  datascience: "Data Science",
  frontend: "Frontend (React & JavaScript)",
  python: "Python Programming",
  webfundamentals: "Web Fundamentals (HTML, CSS, JS, HTTP)",
  aiml: "AI / Machine Learning",
};
const GENERAL_CATEGORIES = ["quantitative", "logical", "verbal"];
// The role-specific banks; a JobOpening picks one as its techCategory.
const TECH_CATEGORIES = ["web", "fullstack", "datascience", "frontend", "python", "webfundamentals", "aiml"];
const isCategory = (c) => Object.prototype.hasOwnProperty.call(CATEGORIES, c);

// The bank a role's general section draws from. Free-internship roles are open
// to students of every field, so they get the gentler "foundation" banks
// (buildPaper falls back to the standard bank if the admin has emptied one).
const generalBankFor = (opening, section) => (opening && opening.audience === "free" ? `${section}_foundation` : section);

// How many questions of each kind a role's test asks, when the admin hasn't said.
const DEFAULT_COUNTS = { quantitative: 10, logical: 10, verbal: 10, technical: 10 };
const MAX_PER_CATEGORY = 60;

function normalizeCounts(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const key of Object.keys(DEFAULT_COUNTS)) {
    const n = Number(src[key]);
    out[key] = Number.isInteger(n) && n >= 0 && n <= MAX_PER_CATEGORY ? n : DEFAULT_COUNTS[key];
  }
  return out;
}

const STATUS_LABELS = {
  payment_pending: "Payment pending",
  test_pending: "Test pending",
  submitted: "Submitted",
  shortlisted: "Shortlisted",
  not_shortlisted: "Not shortlisted",
  interview_scheduled: "Interview scheduled",
  selected: "Selected",
  rejected: "Rejected",
};

const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);

// Add to a jobOpening query (include) so shapeOpening can tell how many of the
// role's positions are filled: one per applicant marked "selected".
const OPENING_COUNTS = { _count: { select: { applications: { where: { status: "selected" } } } } };

// { positions, filled, left } for a role, or null when it doesn't state a number.
// `filled` needs the query to have included OPENING_COUNTS.
function positionsOf(o) {
  if (!o || !Number.isInteger(o.positions) || o.positions < 1) return null;
  const filled = (o._count && o._count.applications) || 0;
  return { total: o.positions, filled, left: Math.max(o.positions - filled, 0) };
}

// A job opening as the public site sees it. The cut-off score is the admin's.
function shapeOpening(o, { admin = false } = {}) {
  const counts = normalizeCounts(o.questionCounts);
  return {
    _id: o.id,
    slug: o.slug,
    title: o.title,
    summary: o.summary,
    techCategory: o.techCategory,
    skills: list(o.skills),
    responsibilities: list(o.responsibilities),
    eligibility: list(o.eligibility),
    stipend: o.stipend,
    experience: o.experience,
    duration: o.duration,
    mode: o.mode,
    positions: positionsOf(o),
    status: o.status,
    order: o.order,
    feeRequired: o.feeRequired !== false,
    waiveFee: !!o.waiveFee,
    audience: o.audience || "general",
    createdAt: o.createdAt,
    test: {
      durationMinutes: o.durationMinutes,
      questions: Object.values(counts).reduce((a, b) => a + b, 0),
      marksPerQuestion: o.marksPerQuestion,
      negativeMarks: o.negativeMarks,
      ...(admin ? { questionCounts: counts, cutoffScore: o.cutoffScore } : {}),
    },
  };
}

// ---------- paying the test fee ----------
// What one role's test costs, in rupees (0 = it unlocks without payment): a
// free-internship role takes the processing fee, any other role the test fee
// when it has one. Both come back in full as wallet credit.
function testFeeFor(opening, settings) {
  if (!opening) return 0;
  // A free internship charges the processing fee unless the admin waived it for this role.
  if (opening.audience === "free") return opening.waiveFee ? 0 : settings.processingFeeRupees || 0;
  return opening.feeRequired === false ? 0 : settings.testFeeRupees;
}
const feeName = (opening) => (opening && opening.audience === "free" ? "Test processing fee" : "Aptitude test fee");

// Marks a test-fee payment paid and does everything that follows from it:
// unlocks the test (payment_pending -> test_pending), returns the fee to the
// wallet as credit, mints the receipt, and emails it. Idempotent and safe to
// call from BOTH /careers/verify and the Razorpay webhook: every step is either
// a compare-and-swap or guarded by a unique key, so whichever confirmation lands
// first does the work and the other changes nothing — in particular the same
// payment can never credit the wallet twice (CreditEntry's unique
// [paymentId, kind]). Returns the JobApplication, or null.
async function grantTestForPayment(payment, razorpayPaymentId) {
  if (payment.status !== "paid" || payment.razorpayPaymentId !== razorpayPaymentId) {
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "paid", razorpayPaymentId },
    });
  }
  const application = payment.jobApplicationId
    ? await prisma.jobApplication.findUnique({
        where: { id: payment.jobApplicationId },
        include: { user: true, opening: true },
      })
    : null;
  if (!application || !application.user) return null;
  const { user, opening } = application;

  // Unlock the test. Only an application still waiting for payment moves; one
  // that is already unlocked (the other confirmation got here first, or a
  // second order was somehow paid) is left exactly as it is.
  await prisma.jobApplication.updateMany({
    where: { id: application.id, status: "payment_pending" },
    data: { status: "test_pending", paymentId: payment.id, paidAt: new Date() },
  });

  // The whole fee comes back as wallet credit: 1 credit per rupee paid.
  const settings = await getCareerSettings();
  try {
    await prisma.creditEntry.create({
      data: {
        userId: user.id,
        amount: payment.amount,
        kind: "test_fee_credit",
        paymentId: payment.id,
        note: `${feeName(opening)} — ${opening.title}`,
        expiresAt: creditExpiryDate(settings.creditExpiryMonths),
      },
    });
  } catch (e) {
    if (!(e && e.code === "P2002")) throw e;
  }

  await attachTestReceipt(payment, user, opening, settings);
  return application;
}

// The receipt for a test fee, on the same Payment columns and with the same
// race-safe "only one caller mints it" UPDATE as a course receipt
// (routes/payments.js attachReceipt). The winner also sends the confirmation
// email and the dashboard notification, so those go out exactly once.
async function attachTestReceipt(payment, user, opening, settings) {
  if (payment.receiptNumber) return;
  const totalPaid = round2((payment.amount || 0) / 100);
  // A plain hyphen: the receipt PDF's built-in font has no long dash.
  const itemTitle = opening.audience === "free" ? `Test Processing Fee - ${opening.title}` : `Aptitude Test Fee - ${opening.title}`;

  // Same shared counter as every other receipt (utils/receiptNumber.js).
  // null: the other concurrent caller (verify vs webhook) got there first.
  const issued = await issueReceiptNumber(payment.id, {
    userId: user.id,
    receiptBuyerName: user.name || "",
    receiptBuyerEmail: user.email || "",
    receiptBuyerPhone: user.phone || "",
    receiptItemType: "aptitude_test",
    receiptItemTitle: itemTitle,
    receiptBasePrice: totalPaid,
    receiptDiscountPercent: 0,
    receiptDiscountAmount: 0,
    receiptTotalPaid: totalPaid,
    receiptPaymentMode: "Razorpay (Online)",
  });
  if (!issued) return;
  const { receiptNumber, issuedAt } = issued;

  const credits = Math.round((payment.amount || 0) / 100);
  await addNotification(user.id, {
    title: "Payment received — your test is unlocked",
    body: `We received ₹${totalPaid} for the ${opening.title} aptitude test. ${credits} credits were added to your wallet, and you can take the test now.`,
    link: "/dashboard?tab=apply",
  });

  // Best-effort — a failed/unconfigured email must never undo the payment.
  try {
    const mailer = require("./mailer");
    if (typeof mailer.sendTestPaymentEmail !== "function") return;
    const { buildReceiptPdfBuffer } = require("./receiptPdf");
    const pdfBuffer = buildReceiptPdfBuffer({
      receiptNumber,
      issuedAt,
      buyerName: user.name || "",
      buyerEmail: user.email || "",
      buyerPhone: user.phone || "",
      itemType: "aptitude_test",
      itemTitle,
      basePrice: totalPaid,
      discountPercent: 0,
      discountAmount: 0,
      totalPaid,
      paymentMode: "Razorpay (Online)",
      razorpay_payment_id: payment.razorpayPaymentId,
    });
    await mailer.sendTestPaymentEmail({
      to: user.email,
      name: user.name,
      roleTitle: opening.title,
      amount: totalPaid,
      credits,
      balance: (await creditBalance(user.id)) / 100,
      expiryMonths: settings.creditExpiryMonths,
      receiptNumber,
      pdfBuffer,
    });
  } catch (mailErr) {
    console.error("[careers] test payment email failed:", mailErr.message);
  }
}

// ---------- the paper ----------
function shuffle(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Draws this candidate's questions: a random pick from each category the role's
// test asks for, each with its options in a random order. `correct` is the
// position of the right answer AFTER shuffling. The result is stored on the
// attempt, so the same paper comes back on every refresh.
//
// Part of each category (settings.generatedQuestionsPercent) is not taken from
// the bank at all but written on the spot with fresh values by
// utils/questionGenerators.js, so those questions differ for every candidate.
// They are stored on the attempt exactly like bank questions — with their
// answer — so scoring and the admin review treat both kinds the same.
async function buildPaper(opening, settings = {}) {
  const share = Math.min(100, Math.max(0, Number(settings.generatedQuestionsPercent) || 0));
  const counts = normalizeCounts(opening.questionCounts);
  const plan = [
    ...GENERAL_CATEGORIES.map((section) => [generalBankFor(opening, section), counts[section], section]),
    [TECH_CATEGORIES.includes(opening.techCategory) ? opening.techCategory : "web", counts.technical],
  ];
  const paper = [];
  for (let [category, wanted, standard] of plan) {
    if (!wanted) continue;
    let rows = await prisma.testQuestion.findMany({ where: { category, active: true } });
    if (!rows.length && standard && category !== standard) {
      category = standard;
      rows = await prisma.testQuestion.findMany({ where: { category, active: true } });
    }
    // Generated questions take their share; a bank too small for the rest is topped up with more of them.
    const fromGenerators = Math.min(generatorCount(category), Math.max(Math.round((wanted * share) / 100), share > 0 ? wanted - rows.length : 0));
    const section = generateQuestions(category, fromGenerators).map((g) => ({
      qid: `gen_${crypto.randomBytes(8).toString("hex")}`, category, text: g.text, options: g.options, correct: g.correct, generated: true,
    }));
    for (const q of shuffle(rows).slice(0, wanted - section.length)) {
      const options = Array.isArray(q.options) ? q.options.map(String) : [];
      if (options.length < 2 || q.correctIndex < 0 || q.correctIndex >= options.length) continue;
      const order = shuffle(options.map((_, i) => i));
      section.push({ qid: q.id, category, text: q.text, options: order.map((i) => options[i]), correct: order.indexOf(q.correctIndex) });
    }
    // Mixed together, so generated questions are not always first in a section.
    paper.push(...shuffle(section));
  }
  return paper;
}

// The paper as the browser gets it: no `correct`, ever.
function publicPaper(paper) {
  return (Array.isArray(paper) ? paper : []).map((q) => ({
    id: q.qid,
    category: q.category,
    categoryLabel: CATEGORIES[q.category] || q.category,
    text: q.text,
    options: q.options,
  }));
}

// Scores a paper against the saved answers, by the rules the attempt started
// with. A wrong answer costs `negativeMarks`; an unanswered one costs nothing.
function scorePaper(paper, answers, settings) {
  const marks = Number(settings.marksPerQuestion) || 1;
  const negative = Math.abs(Number(settings.negativeMarks) || 0);
  const chosen = new Map(answers.map((a) => [a.questionId, a.selected]));
  const byCategory = {};
  let correctCount = 0;
  let wrongCount = 0;
  for (const q of paper) {
    const cat = (byCategory[q.category] = byCategory[q.category] || { label: CATEGORIES[q.category] || q.category, total: 0, correct: 0, wrong: 0, skipped: 0, score: 0, max: 0 });
    cat.total += 1;
    cat.max += marks;
    const pick = chosen.get(q.qid);
    if (pick === null || pick === undefined) cat.skipped += 1;
    else if (pick === q.correct) { cat.correct += 1; cat.score += marks; correctCount += 1; }
    else { cat.wrong += 1; cat.score -= negative; wrongCount += 1; }
  }
  for (const cat of Object.values(byCategory)) { cat.score = round2(cat.score); cat.max = round2(cat.max); }
  const score = round2(Object.values(byCategory).reduce((s, c) => s + c.score, 0));
  const maxScore = round2(paper.length * marks);
  return { score, maxScore, correctCount, wrongCount, categoryScores: byCategory, passed: score >= (Number(settings.cutoffScore) || 0) };
}

// A test that ran at least this long should have sent a webcam photo (the page
// takes its first one a few seconds in, then one every 20 seconds or more).
const NO_PHOTO_AFTER_MS = 60 * 1000;

// Ends an attempt and scores it. `reason`: "manual" | "time_up" | "violations".
// Safe to call any number of times and from racing requests — the attempt's row
// is locked, and only an attempt still in progress is touched. Returns the
// attempt as it now stands (or null if there is no such attempt).
async function finalizeAttempt(attemptId, reason) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM test_attempts WHERE id = ${attemptId} FOR UPDATE`;
    const attempt = await tx.testAttempt.findUnique({ where: { id: attemptId }, include: { answers: true } });
    if (!attempt) return { attempt: null, changed: false };
    if (attempt.status !== "in_progress") return { attempt, changed: false };

    const now = new Date();
    const outcome = scorePaper(attempt.paper, attempt.answers, attempt.settings || {});
    const updated = await tx.testAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "submitted",
        submitReason: reason,
        // A test that ran out of time ended when its clock did, whenever we noticed.
        submittedAt: now > attempt.endsAt ? attempt.endsAt : now,
        score: outcome.score,
        maxScore: outcome.maxScore,
        correctCount: outcome.correctCount,
        wrongCount: outcome.wrongCount,
        categoryScores: outcome.categoryScores,
        passed: outcome.passed,
        sessionId: null,
      },
    });
    await tx.jobApplication.updateMany({
      where: { id: attempt.applicationId, status: "test_pending" },
      data: { status: "submitted" },
    });
    // The webcam is checked only by the test page, so a candidate could block
    // the photos and carry on. When the webcam was required and the test ran
    // long enough for photos to be taken but none arrived, say so on the
    // review (logged for the admin, not counted toward the auto-submit limit).
    const ranMs = updated.submittedAt.getTime() - attempt.startedAt.getTime();
    if (attempt.settings && attempt.settings.requireWebcam && ranMs >= NO_PHOTO_AFTER_MS) {
      const photos = await tx.testSnapshot.count({ where: { attemptId: attempt.id, NOT: { storageKey: { startsWith: PENDING_PREFIX } } } });
      if (photos === 0) {
        await tx.testViolation.create({ data: { attemptId: attempt.id, type: "webcam_off", detail: "No webcam photos were received during this test", counted: false } });
      }
    }
    return { attempt: updated, changed: true };
  });

  if (result.changed) {
    try {
      const application = await prisma.jobApplication.findUnique({
        where: { id: result.attempt.applicationId },
        include: { user: { select: { id: true, name: true, email: true } }, opening: { select: { title: true } } },
      });
      if (application && application.user) {
        await addNotification(application.user.id, {
          title: "Test submitted",
          body: `Your ${application.opening.title} aptitude test was submitted. You'll get your shortlisting result within 7 days.`,
          link: "/dashboard?tab=applications",
        });
        sendCareerEmail("sendTestSubmittedEmail", {
          to: application.user.email, name: application.user.name, roleTitle: application.opening.title, reason,
        });
      }
    } catch (err) {
      console.error("[careers] test-submitted notice failed:", err.message);
    }
  }
  return result.attempt;
}

// Auto-submit: closes every attempt whose time has run out but that nobody has
// called in about since (the candidate closed the tab, lost power...). Run
// before any listing that shows attempts; `where` narrows it (e.g. one user).
async function finalizeExpiredAttempts(where = {}) {
  const overdue = await prisma.testAttempt.findMany({
    where: { ...where, status: "in_progress", endsAt: { lt: new Date() } },
    select: { id: true },
    take: 200,
  });
  for (const a of overdue) {
    await finalizeAttempt(a.id, "time_up").catch((err) => console.error("[careers] auto-submit failed:", err.message));
  }
  return overdue.length;
}

// ---------- device details recorded with each attempt ----------
function describeUserAgent(ua) {
  const s = String(ua || "");
  const browser =
    /Edg\//.test(s) ? "Edge" :
    /OPR\/|Opera/.test(s) ? "Opera" :
    /Firefox\//.test(s) ? "Firefox" :
    /Chrome\//.test(s) ? "Chrome" :
    /Safari\//.test(s) ? "Safari" : "Unknown";
  const os =
    /Windows/.test(s) ? "Windows" :
    /Android/.test(s) ? "Android" :
    /iPhone|iPad|iPod/.test(s) ? "iOS" :
    /Mac OS X/.test(s) ? "macOS" :
    /Linux/.test(s) ? "Linux" : "Unknown";
  const kind = /Mobi|Android|iPhone|iPod/.test(s) ? "Mobile" : /iPad|Tablet/.test(s) ? "Tablet" : "Desktop";
  return { browser, device: `${kind} · ${os}` };
}

// ---------- desktop lockdown app ----------
// The test page can later run inside a desktop lockdown app. That app proves
// itself with a token it derives from a shared secret (LOCKDOWN_APP_SECRET):
//   "<unix-ms>.<hex hmac-sha256 of '<userId>.<unix-ms>'>"
// valid for 12 hours. With no secret configured nothing can verify.
const APP_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
function verifyDesktopAppToken(token, userId) {
  const secret = process.env.LOCKDOWN_APP_SECRET || "";
  if (!secret || typeof token !== "string") return false;
  const [ts, sig] = token.split(".");
  const at = Number(ts);
  if (!sig || !Number.isFinite(at) || Math.abs(Date.now() - at) > APP_TOKEN_TTL_MS) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${userId}.${ts}`).digest("hex");
  return safeEqual(expected, sig);
}

module.exports = {
  testFeeFor,
  CATEGORIES,
  GENERAL_CATEGORIES,
  TECH_CATEGORIES,
  generalBankFor,
  DEFAULT_COUNTS,
  MAX_PER_CATEGORY,
  STATUS_LABELS,
  isCategory,
  normalizeCounts,
  shapeOpening,
  positionsOf,
  OPENING_COUNTS,
  grantTestForPayment,
  shuffle,
  buildPaper,
  publicPaper,
  scorePaper,
  finalizeAttempt,
  finalizeExpiredAttempts,
  describeUserAgent,
  verifyDesktopAppToken,
};
