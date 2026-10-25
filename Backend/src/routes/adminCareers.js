// Admin side of careers and the aptitude test: job openings (add / edit /
// close) with each role's test settings, the question bank (with bulk upload
// from Excel or CSV), the applicants list and one applicant's full attempt
// review, the status actions (shortlist, interview, select, reject), the
// export to Excel, wallet balances, and the careers settings.
const express = require("express");
const { prisma } = require("../db");
const { requireAdmin } = require("../middleware/requireAdmin");
const { FINAL_STATUSES } = require("../utils/proctorRetention");
const { queryText, isValidHttpUrl } = require("../utils/validators");
const { getCareerSettings, saveCareerSettings } = require("../utils/careerSettings");
const { addNotification, sendCareerEmail } = require("../utils/notifications");
const { readSnapshot, PENDING_PREFIX } = require("../utils/proctorStorage");
const { lapsedCredit } = require("../utils/wallet");
const {
  CATEGORIES, TECH_CATEGORIES, MAX_PER_CATEGORY, STATUS_LABELS, isCategory, normalizeCounts, shapeOpening, finalizeExpiredAttempts,
} = require("../utils/careers");

const router = express.Router();

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;
const MAX_OPTIONS = 6;

// ====================== job openings ======================
function slugify(title) {
  return String(title).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "role";
}

async function uniqueSlug(title, ignoreId) {
  const base = slugify(title);
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.jobOpening.findUnique({ where: { slug }, select: { id: true } });
    if (!taken || taken.id === ignoreId) return slug;
  }
  return `${base}-${Date.now()}`;
}

const isText = (v, max) => typeof v === "string" && v.length <= max;
const isList = (v) => Array.isArray(v) && v.length <= 30 && v.every((p) => typeof p === "string" && p.length <= 300);
const cleanList = (v) => v.map((p) => p.trim()).filter(Boolean);

// Validates the fields present in `body` and returns { data } ready for Prisma,
// or { error }. Used for both create (every field optional except title) and edit.
function openingData(body) {
  const b = body || {};
  const data = {};
  if (b.title !== undefined) {
    if (!isText(b.title, 150) || !b.title.trim()) return { error: "The title must be text (up to 150 characters)." };
    data.title = b.title.trim();
  }
  if (b.summary !== undefined) {
    if (!isText(b.summary, 2000)) return { error: "The description must be text (up to 2000 characters)." };
    data.summary = b.summary.trim();
  }
  if (b.techCategory !== undefined) {
    if (!TECH_CATEGORIES.includes(b.techCategory)) return { error: `The technical question set must be one of: ${TECH_CATEGORIES.join(", ")}.` };
    data.techCategory = b.techCategory;
  }
  for (const key of ["skills", "responsibilities", "eligibility"]) {
    if (b[key] === undefined) continue;
    if (!isList(b[key])) return { error: `${key} must be a list of up to 30 short texts.` };
    data[key] = cleanList(b[key]);
  }
  for (const key of ["stipend", "experience", "duration", "mode"]) {
    if (b[key] === undefined) continue;
    if (!isText(b[key], 190)) return { error: `${key} must be text (up to 190 characters).` };
    data[key] = b[key].trim();
  }
  if (b.status !== undefined) {
    if (b.status !== "open" && b.status !== "closed") return { error: "status must be open or closed" };
    data.status = b.status;
  }
  if (b.feeRequired !== undefined) {
    if (typeof b.feeRequired !== "boolean") return { error: "feeRequired must be true or false" };
    data.feeRequired = b.feeRequired;
  }
  if (b.audience !== undefined) {
    if (b.audience !== "general" && b.audience !== "free") return { error: "audience must be general or free" };
    data.audience = b.audience;
  }
  if (b.order !== undefined) {
    if (!Number.isInteger(b.order) || b.order < 0 || b.order > 10000) return { error: "The display order must be a whole number." };
    data.order = b.order;
  }
  // --- the role's test ---
  if (b.durationMinutes !== undefined) {
    if (!Number.isInteger(b.durationMinutes) || b.durationMinutes < 5 || b.durationMinutes > 300) return { error: "The test duration must be 5 to 300 minutes." };
    data.durationMinutes = b.durationMinutes;
  }
  if (b.questionCounts !== undefined) {
    const c = b.questionCounts;
    const keys = ["quantitative", "logical", "verbal", "technical"];
    if (!c || typeof c !== "object" || Array.isArray(c) || !keys.every((k) => Number.isInteger(c[k]) && c[k] >= 0 && c[k] <= MAX_PER_CATEGORY)) {
      return { error: `Questions per category must be whole numbers from 0 to ${MAX_PER_CATEGORY}.` };
    }
    if (keys.reduce((sum, k) => sum + c[k], 0) < 1) return { error: "The test needs at least one question." };
    data.questionCounts = Object.fromEntries(keys.map((k) => [k, c[k]]));
  }
  const number = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  if (b.marksPerQuestion !== undefined) {
    if (!number(b.marksPerQuestion, 0.25, 100)) return { error: "Marks per question must be between 0.25 and 100." };
    data.marksPerQuestion = b.marksPerQuestion;
  }
  if (b.negativeMarks !== undefined) {
    if (!number(b.negativeMarks, 0, 100)) return { error: "Negative marking must be between 0 and 100 (enter it as a positive number, e.g. 0.25)." };
    data.negativeMarks = b.negativeMarks;
  }
  if (b.cutoffScore !== undefined) {
    if (!number(b.cutoffScore, 0, 100000)) return { error: "The cut-off score must be 0 or more." };
    data.cutoffScore = b.cutoffScore;
  }
  return { data };
}

// How many active questions each bank holds — shown beside a role's test
// settings so the admin can see when a bank is too small for what it asks.
async function bankCounts() {
  const rows = await prisma.testQuestion.groupBy({ by: ["category"], where: { active: true }, _count: { _all: true } });
  const counts = Object.fromEntries(Object.keys(CATEGORIES).map((c) => [c, 0]));
  for (const r of rows) counts[r.category] = r._count._all;
  return counts;
}

router.get("/admin/job-openings", requireAdmin, async (req, res, next) => {
  try {
    const [openings, applicants, bank] = await Promise.all([
      prisma.jobOpening.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
      prisma.jobApplication.groupBy({ by: ["openingId"], _count: { _all: true } }),
      bankCounts(),
    ]);
    const countByOpening = new Map(applicants.map((a) => [a.openingId, a._count._all]));
    res.json({
      ok: true,
      bank,
      openings: openings.map((o) => ({ ...shapeOpening(o, { admin: true }), applicants: countByOpening.get(o.id) || 0 })),
    });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/job-openings", requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = openingData(req.body);
    if (error) return res.status(400).json({ ok: false, error });
    if (!data.title) return res.status(400).json({ ok: false, error: "The title is required." });

    let order = data.order;
    if (order === undefined) {
      const last = await prisma.jobOpening.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
      order = (last ? last.order : 0) + 1;
    }
    const opening = await prisma.jobOpening.create({
      data: {
        ...data,
        slug: await uniqueSlug(data.title),
        summary: data.summary || "",
        questionCounts: data.questionCounts || normalizeCounts(null),
        order,
      },
    });
    res.status(201).json({ ok: true, opening: shapeOpening(opening, { admin: true }) });
  } catch (e) {
    next(e);
  }
});

// Editing never changes the slug: links to the role, and the "remembered role"
// of someone part-way through signing up, keep working.
router.put("/admin/job-openings/:id", requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = openingData(req.body);
    if (error) return res.status(400).json({ ok: false, error });
    const existing = await prisma.jobOpening.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ ok: false, error: "Opening not found" });
    const opening = await prisma.jobOpening.update({ where: { id: req.params.id }, data });
    res.json({ ok: true, opening: shapeOpening(opening, { admin: true }) });
  } catch (e) {
    next(e);
  }
});

// A role people have applied for is closed, never deleted — its applications
// (and their payments and test results) hang off it.
router.delete("/admin/job-openings/:id", requireAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.jobOpening.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ ok: false, error: "Opening not found" });
    const applicants = await prisma.jobApplication.count({ where: { openingId: req.params.id } });
    if (applicants > 0) {
      return res.status(409).json({ ok: false, error: `This role has ${applicants} application${applicants === 1 ? "" : "s"}. Close it instead of deleting it.` });
    }
    await prisma.jobOpening.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ====================== question bank ======================
// Returns { data } or { error }. `partial` = an edit, where only what was sent is checked.
function questionData(body, partial = false) {
  const b = body || {};
  const data = {};
  if (b.category !== undefined || !partial) {
    if (!isCategory(b.category)) return { error: `The category must be one of: ${Object.keys(CATEGORIES).join(", ")}.` };
    data.category = b.category;
  }
  if (b.text !== undefined || !partial) {
    if (!isText(b.text, 2000) || !b.text.trim()) return { error: "The question must be text (up to 2000 characters)." };
    data.text = b.text.trim();
  }
  if (b.options !== undefined || !partial) {
    if (!Array.isArray(b.options) || b.options.some((o) => typeof o !== "string" || o.length > 500)) return { error: "The options must be a list of short texts." };
    const options = b.options.map((o) => o.trim());
    if (options.length < 2 || options.length > MAX_OPTIONS || options.some((o) => !o)) return { error: `A question needs 2 to ${MAX_OPTIONS} options, none of them empty.` };
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { error: "Two options are the same." };
    data.options = options;
  }
  if (b.correctIndex !== undefined || !partial) {
    if (!Number.isInteger(b.correctIndex) || b.correctIndex < 0) return { error: "Choose which option is the correct answer." };
    data.correctIndex = b.correctIndex;
  }
  if (b.active !== undefined) {
    if (typeof b.active !== "boolean") return { error: "active must be true or false" };
    data.active = b.active;
  }
  return { data };
}

const shapeQuestion = (q) => ({ _id: q.id, category: q.category, categoryLabel: CATEGORIES[q.category] || q.category, text: q.text, options: q.options, correctIndex: q.correctIndex, active: q.active, createdAt: q.createdAt });

router.get("/admin/test-questions", requireAdmin, async (req, res, next) => {
  try {
    const q = queryText(req.query.q);
    const category = queryText(req.query.category);
    const active = queryText(req.query.active);
    const where = {
      ...(isCategory(category) ? { category } : {}),
      ...(active === "true" ? { active: true } : active === "false" ? { active: false } : {}),
      ...(q ? { text: { contains: q } } : {}),
    };
    const [questions, total, bank] = await Promise.all([
      prisma.testQuestion.findMany({ where, orderBy: [{ category: "asc" }, { createdAt: "desc" }], take: 500 }),
      prisma.testQuestion.count({ where }),
      bankCounts(),
    ]);
    res.json({ ok: true, total, bank, categories: CATEGORIES, questions: questions.map(shapeQuestion) });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/test-questions", requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = questionData(req.body);
    if (error) return res.status(400).json({ ok: false, error });
    if (data.correctIndex >= data.options.length) return res.status(400).json({ ok: false, error: "Choose which option is the correct answer." });
    const question = await prisma.testQuestion.create({ data });
    res.status(201).json({ ok: true, question: shapeQuestion(question) });
  } catch (e) {
    next(e);
  }
});

// Editing or deleting a question never changes a test already taken or under
// way: each attempt keeps its own copy of the questions it was given.
router.put("/admin/test-questions/:id", requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = questionData(req.body, true);
    if (error) return res.status(400).json({ ok: false, error });
    const existing = await prisma.testQuestion.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ ok: false, error: "Question not found" });
    const options = data.options || existing.options;
    const correctIndex = data.correctIndex !== undefined ? data.correctIndex : existing.correctIndex;
    if (correctIndex >= options.length) return res.status(400).json({ ok: false, error: "Choose which option is the correct answer." });
    const question = await prisma.testQuestion.update({ where: { id: req.params.id }, data });
    res.json({ ok: true, question: shapeQuestion(question) });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/test-questions/:id", requireAdmin, async (req, res, next) => {
  try {
    const question = await prisma.testQuestion.delete({ where: { id: req.params.id } }).catch(() => null);
    if (!question) return res.status(404).json({ ok: false, error: "Question not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- bulk upload (Excel .xlsx or CSV) ----------
// A small RFC 4180 reader: quoted fields, "" for a quote, commas and line
// breaks inside quotes. Returns rows of strings.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function parseXlsx(buffer) {
  const ExcelJS = require("exceljs"); // lazily: only this route and the export need it
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells = [];
    for (let c = 1; c <= row.cellCount; c++) cells.push(String(row.getCell(c).text ?? "").trim());
    rows.push(cells);
  });
  return rows;
}

// "Logical Reasoning", "logical", "Data Science", "datascience"... -> the category key.
function categoryFromText(value) {
  const norm = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!norm) return null;
  for (const [key, label] of Object.entries(CATEGORIES)) {
    if (norm === key || norm === label.toLowerCase().replace(/[^a-z]/g, "")) return key;
  }
  const aliases = { quant: "quantitative", aptitude: "quantitative", reasoning: "logical", english: "verbal", verbalability: "verbal", webdev: "web", fullstackdevelopment: "fullstack", ds: "datascience", react: "frontend", py: "python", ai: "aiml", ml: "aiml", machinelearning: "aiml" };
  return aliases[norm] || null;
}

// The "correct" column: an option number (1-6), a letter (A-F), or the option's own text.
function correctFromText(value, options) {
  const v = String(value || "").trim();
  if (/^[1-9]$/.test(v)) return Number(v) - 1;
  if (/^[a-f]$/i.test(v)) return v.toUpperCase().charCodeAt(0) - 65;
  const at = options.findIndex((o) => o.toLowerCase() === v.toLowerCase());
  return at;
}

// Body: the file itself (Content-Type of the file, or application/octet-stream).
// First row = headers: category, question, option1..option6 (or A..F), correct.
// Good rows are added; each bad row is reported with its row number and reason.
router.post(
  "/admin/test-questions/import",
  requireAdmin,
  express.raw({ type: () => true, limit: MAX_IMPORT_BYTES }),
  async (req, res, next) => {
    try {
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ ok: false, error: "Choose an Excel (.xlsx) or CSV file to upload." });

      let rows;
      try {
        // An .xlsx file is a zip archive, which starts with "PK".
        rows = body[0] === 0x50 && body[1] === 0x4b ? await parseXlsx(body) : parseCsv(body.toString("utf8"));
      } catch (parseErr) {
        return res.status(400).json({ ok: false, error: "That file couldn't be read. Upload an Excel (.xlsx) or CSV file." });
      }
      rows = rows.filter((r) => r.some((c) => String(c).trim()));
      if (rows.length < 2) return res.status(400).json({ ok: false, error: "The file needs a header row and at least one question." });
      if (rows.length - 1 > MAX_IMPORT_ROWS) return res.status(400).json({ ok: false, error: `Upload at most ${MAX_IMPORT_ROWS} questions at a time.` });

      const header = rows[0].map((h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, ""));
      const col = (...names) => header.findIndex((h) => names.includes(h));
      const categoryCol = col("category", "section");
      const textCol = col("question", "text", "questiontext");
      const correctCol = col("correct", "answer", "correctanswer", "correctoption");
      const optionCols = [];
      for (let n = 1; n <= MAX_OPTIONS; n++) {
        const at = col(`option${n}`, `opt${n}`, String.fromCharCode(96 + n), `option${String.fromCharCode(96 + n)}`);
        if (at >= 0) optionCols.push(at);
      }
      if (categoryCol < 0 || textCol < 0 || correctCol < 0 || optionCols.length < 2) {
        return res.status(400).json({ ok: false, error: "The header row needs these columns: category, question, option1, option2 (up to option6), correct." });
      }

      const good = [];
      const errors = [];
      rows.slice(1).forEach((r, i) => {
        const rowNumber = i + 2;
        const cell = (at) => String(r[at] ?? "").trim();
        // Blank cells are allowed only at the end: a gap would shift every later
        // option, and an answer given as a number or letter would then point at
        // the wrong one.
        const cells = optionCols.map(cell);
        while (cells.length && !cells[cells.length - 1]) cells.pop();
        const gap = cells.findIndex((c) => !c);
        if (gap >= 0) { errors.push({ row: rowNumber, error: `Option ${gap + 1} is empty but a later option isn't` }); return; }
        const options = cells;
        const category = categoryFromText(cell(categoryCol));
        if (!category) { errors.push({ row: rowNumber, error: `Unknown category "${cell(categoryCol)}"` }); return; }
        const checked = questionData({ category, text: cell(textCol), options, correctIndex: correctFromText(cell(correctCol), options) });
        if (checked.error) { errors.push({ row: rowNumber, error: checked.error }); return; }
        if (checked.data.correctIndex >= checked.data.options.length) { errors.push({ row: rowNumber, error: "The correct answer doesn't match any option" }); return; }
        good.push(checked.data);
      });

      if (good.length) await prisma.testQuestion.createMany({ data: good });
      res.status(good.length ? 201 : 400).json({
        ok: good.length > 0,
        created: good.length,
        errors: errors.slice(0, 100),
        ...(good.length ? {} : { error: "No questions could be added — see the problems listed for each row." }),
      });
    } catch (e) {
      next(e);
    }
  }
);

// ====================== applicants ======================
const USER_SUMMARY = { id: true, name: true, email: true, phone: true, college: true, course: true, department: true, semester: true, passingYear: true };
const ATTEMPT_SUMMARY = {
  id: true, status: true, startedAt: true, endsAt: true, submittedAt: true, submitReason: true,
  score: true, maxScore: true, passed: true, correctCount: true, wrongCount: true, categoryScores: true, violationCount: true,
};
const OPENING_SUMMARY = { id: true, title: true, slug: true, feeRequired: true, audience: true };
const LIST_INCLUDE = { user: { select: USER_SUMMARY }, opening: { select: OPENING_SUMMARY }, attempt: { select: ATTEMPT_SUMMARY } };

function shapeApplicant(a) {
  return {
    _id: a.id,
    user: a.user
      ? {
          _id: a.user.id, name: a.user.name, email: a.user.email, phone: a.user.phone,
          education: { college: a.user.college, course: a.user.course, department: a.user.department, semester: a.user.semester, passingYear: a.user.passingYear },
        }
      : null,
    opening: a.opening ? { _id: a.opening.id, title: a.opening.title, slug: a.opening.slug, feeRequired: a.opening.feeRequired !== false, audience: a.opening.audience || "general" } : null,
    cv: a.cvKey ? { fileName: a.cvFileName, uploadedAt: a.cvUploadedAt } : null,
    // As it was when they applied (free internships); null for other roles.
    education: a.education || null,
    status: a.status,
    statusLabel: STATUS_LABELS[a.status] || a.status,
    paymentStatus: a.paidAt ? "paid" : a.opening && a.opening.feeRequired === false ? "free" : "pending",
    paidAt: a.paidAt,
    interviewAt: a.interviewAt,
    interviewLink: a.interviewLink,
    adminNote: a.adminNote,
    createdAt: a.createdAt,
    attempt: a.attempt
      ? {
          _id: a.attempt.id, status: a.attempt.status, startedAt: a.attempt.startedAt, submittedAt: a.attempt.submittedAt,
          submitReason: a.attempt.submitReason, score: a.attempt.score, maxScore: a.attempt.maxScore, passed: a.attempt.passed,
          correctCount: a.attempt.correctCount, wrongCount: a.attempt.wrongCount, categoryScores: a.attempt.categoryScores,
          violationCount: a.attempt.violationCount,
        }
      : null,
  };
}

function applicantFilter(query) {
  const q = queryText(query.q);
  const status = queryText(query.status);
  const openingId = queryText(query.openingId);
  return {
    ...(Object.prototype.hasOwnProperty.call(STATUS_LABELS, status) ? { status } : {}),
    ...(openingId ? { openingId } : {}),
    ...(q ? { user: { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] } } : {}),
  };
}

const SHORTLISTED_STATUSES = ["shortlisted", "interview_scheduled", "selected"];

router.get("/admin/job-applications", requireAdmin, async (req, res, next) => {
  try {
    // Tests whose time ran out with the tab closed are submitted before they are listed.
    await finalizeExpiredAttempts();
    const [applications, total, byStatus, payments, scores] = await Promise.all([
      prisma.jobApplication.findMany({ where: applicantFilter(req.query), include: LIST_INCLUDE, orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.jobApplication.count(),
      prisma.jobApplication.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.payment.aggregate({ where: { status: "paid", jobApplicationId: { not: null } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.testAttempt.aggregate({ where: { status: "submitted" }, _avg: { score: true }, _count: { _all: true } }),
    ]);
    const count = (...statuses) => byStatus.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s._count._all, 0);
    res.json({
      ok: true,
      summary: {
        totalApplicants: total,
        paymentsReceived: payments._count._all,
        amountReceived: (payments._sum.amount || 0) / 100,
        testsSubmitted: scores._count._all,
        averageScore: scores._avg.score === null ? null : Math.round(scores._avg.score * 100) / 100,
        shortlisted: count(...SHORTLISTED_STATUSES),
        selected: count("selected"),
      },
      statuses: STATUS_LABELS,
      applications: applications.map(shapeApplicant),
    });
  } catch (e) {
    next(e);
  }
});

// Times in the export are shown in IST (they are stored in UTC).
const ist = (d) => (d ? new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "");

// ---------- export applicants and results to Excel ----------
// Declared before "/admin/job-applications/:id" so "export" isn't read as an id.
router.get("/admin/job-applications/export", requireAdmin, async (req, res, next) => {
  try {
    await finalizeExpiredAttempts();
    const applications = await prisma.jobApplication.findMany({ where: applicantFilter(req.query), include: LIST_INCLUDE, orderBy: { createdAt: "desc" }, take: 5000 });

    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Crix Technology";
    const sheet = workbook.addWorksheet("Applicants");
    const categoryKeys = Object.keys(CATEGORIES);
    sheet.columns = [
      { header: "Name", key: "name", width: 24 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "College", key: "college", width: 30 },
      { header: "Course", key: "course", width: 14 },
      { header: "Branch / department", key: "department", width: 22 },
      { header: "Semester", key: "semester", width: 11 },
      { header: "Year of passing", key: "passingYear", width: 14 },
      { header: "Role", key: "role", width: 28 },
      { header: "Status", key: "status", width: 20 },
      { header: "Payment", key: "payment", width: 10 },
      { header: "Paid at (IST)", key: "paidAt", width: 22 },
      { header: "Score", key: "score", width: 9 },
      { header: "Out of", key: "maxScore", width: 9 },
      { header: "Cleared cut-off", key: "passed", width: 14 },
      { header: "Correct", key: "correct", width: 9 },
      { header: "Wrong", key: "wrong", width: 9 },
      ...categoryKeys.map((c) => ({ header: CATEGORIES[c], key: `cat_${c}`, width: 16 })),
      { header: "Violations", key: "violations", width: 11 },
      { header: "Submitted at (IST)", key: "submittedAt", width: 22 },
      { header: "How it ended", key: "ended", width: 16 },
      { header: "Interview (IST)", key: "interviewAt", width: 22 },
      { header: "Interview link", key: "interviewLink", width: 34 },
      { header: "Applied at (IST)", key: "appliedAt", width: 22 },
    ];
    sheet.getRow(1).font = { bold: true };
    const ENDED = { manual: "Submitted", time_up: "Time ran out", violations: "Too many violations" };
    // A cell starting with = + - @ would be run as a formula by Excel: keep typed text as text.
    const safe = (v) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
    for (const a of applications) {
      const t = a.attempt;
      const cats = (t && t.categoryScores) || {};
      // The copy taken when they applied, else the profile as it is now.
      const edu = a.education || a.user || {};
      sheet.addRow({
        name: safe(a.user ? a.user.name : ""),
        email: safe(a.user ? a.user.email : ""),
        phone: safe(a.user ? a.user.phone : ""),
        college: safe(edu.college || ""),
        course: safe(edu.course || ""),
        department: safe(edu.department || ""),
        semester: edu.semester ? (edu.semester === "graduated" ? "Graduated" : edu.semester) : "",
        passingYear: edu.passingYear || "",
        role: safe(a.opening ? a.opening.title : ""),
        status: STATUS_LABELS[a.status] || a.status,
        payment: a.paidAt ? "Paid" : a.opening && a.opening.feeRequired === false ? "Free role" : "Pending",
        paidAt: ist(a.paidAt),
        score: t && t.score !== null ? t.score : "",
        maxScore: t && t.maxScore !== null ? t.maxScore : "",
        passed: t && t.passed !== null ? (t.passed ? "Yes" : "No") : "",
        correct: t && t.correctCount !== null ? t.correctCount : "",
        wrong: t && t.wrongCount !== null ? t.wrongCount : "",
        ...Object.fromEntries(categoryKeys.map((c) => [`cat_${c}`, cats[c] ? `${cats[c].score} / ${cats[c].max}` : ""])),
        violations: t ? t.violationCount : "",
        submittedAt: t ? ist(t.submittedAt) : "",
        ended: t && t.status === "submitted" ? ENDED[t.submitReason] || "" : "",
        interviewAt: ist(a.interviewAt),
        interviewLink: safe(a.interviewLink),
        appliedAt: ist(a.createdAt),
      });
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="crix-applicants-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    });
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

// ---------- one applicant: the full attempt review ----------
router.get("/admin/job-applications/:id", requireAdmin, async (req, res, next) => {
  try {
    await finalizeExpiredAttempts({ applicationId: req.params.id });
    const application = await prisma.jobApplication.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: USER_SUMMARY },
        opening: { select: OPENING_SUMMARY },
        attempt: { include: { answers: true, violations: { orderBy: { createdAt: "asc" } }, snapshots: { where: { NOT: { storageKey: { startsWith: PENDING_PREFIX } } }, orderBy: { createdAt: "asc" }, select: { id: true, flag: true, createdAt: true } } } },
      },
    });
    if (!application) return res.status(404).json({ ok: false, error: "Application not found" });

    const payment = application.paymentId
      ? await prisma.payment.findUnique({ where: { id: application.paymentId }, select: { id: true, amount: true, receiptNumber: true, razorpayPaymentId: true } })
      : null;

    const t = application.attempt;
    let review = null;
    if (t) {
      const chosen = new Map(t.answers.map((a) => [a.questionId, a]));
      review = {
        startedAt: t.startedAt,
        endsAt: t.endsAt,
        ip: t.ip,
        device: t.device,
        browser: t.browser,
        userAgent: t.userAgent,
        viaDesktopApp: t.viaDesktopApp,
        // The lobby's "rules + webcam monitoring" box is required to start, so
        // it was ticked at the moment the attempt began.
        consentAt: t.webcamConsent ? t.startedAt : null,
        adultConfirmedAt: application.adultConfirmedAt,
        settings: t.settings,
        // Each question as this candidate saw it, with what they picked.
        questions: (Array.isArray(t.paper) ? t.paper : []).map((q, i) => {
          const a = chosen.get(q.qid);
          const selected = a ? a.selected : null;
          return {
            number: i + 1, category: q.category, categoryLabel: CATEGORIES[q.category] || q.category, text: q.text, options: q.options,
            correct: q.correct, selected, marked: !!(a && a.marked), generated: !!q.generated,
            outcome: selected === null || selected === undefined ? "skipped" : selected === q.correct ? "correct" : "wrong",
          };
        }),
        violations: t.violations.map((v) => ({ _id: v.id, type: v.type, detail: v.detail, counted: v.counted, at: v.createdAt })),
        snapshots: t.snapshots.map((s) => ({ _id: s.id, flag: s.flag, at: s.createdAt })),
      };
    }
    res.json({
      ok: true,
      application: shapeApplicant(application),
      payment: payment ? { _id: payment.id, amount: payment.amount / 100, receiptNumber: payment.receiptNumber, razorpay_payment_id: payment.razorpayPaymentId } : null,
      review,
    });
  } catch (e) {
    next(e);
  }
});

// ---------- an applicant's CV (free internships) ----------
router.get("/admin/job-applications/:id/cv", requireAdmin, async (req, res, next) => {
  try {
    const application = await prisma.jobApplication.findUnique({ where: { id: req.params.id }, select: { cvKey: true, cvFileName: true } });
    if (!application || !application.cvKey) return res.status(404).json({ ok: false, error: "This application has no CV." });
    let file;
    try {
      file = await readSnapshot(application.cvKey);
    } catch (readErr) {
      console.error("[careers] CV read failed:", readErr.message);
      return res.status(404).json({ ok: false, error: "This CV's file is no longer available." });
    }
    const name = (application.cvFileName || "cv.pdf").replace(/[^\w .()-]/g, "");
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "no-store" });
    res.send(file);
  } catch (e) {
    next(e);
  }
});

// ---------- one webcam snapshot (the image itself) ----------
router.get("/admin/test-snapshots/:id", requireAdmin, async (req, res, next) => {
  try {
    const snapshot = await prisma.testSnapshot.findUnique({ where: { id: req.params.id } });
    if (!snapshot) return res.status(404).json({ ok: false, error: "Snapshot not found" });
    let image;
    try {
      image = await readSnapshot(snapshot.storageKey);
    } catch (readErr) {
      console.error("[careers] snapshot read failed:", readErr.message);
      return res.status(404).json({ ok: false, error: "This snapshot's file is no longer available." });
    }
    res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" });
    res.send(image);
  } catch (e) {
    next(e);
  }
});

// ---------- status actions ----------
// Which statuses each action may be taken from, and where it leads.
const ACTIONS = {
  shortlist: { from: ["submitted", "not_shortlisted"], to: "shortlisted" },
  not_shortlist: { from: ["submitted"], to: "not_shortlisted" },
  schedule_interview: { from: ["submitted", "shortlisted", "interview_scheduled"], to: "interview_scheduled" },
  select: { from: ["shortlisted", "interview_scheduled"], to: "selected" },
  reject: { from: ["shortlisted", "interview_scheduled"], to: "rejected" },
};

// What the candidate is told, on the dashboard, for each status they can be moved to.
function statusNotice(status, roleTitle, interviewText) {
  switch (status) {
    case "shortlisted":
      return { title: "You've been shortlisted", body: `Congratulations — you're shortlisted for ${roleTitle}. We'll share your interview details soon.` };
    case "not_shortlisted":
      return { title: "Your aptitude test result", body: `Thank you for taking the ${roleTitle} test. You weren't shortlisted this time.` };
    case "interview_scheduled":
      return { title: "Your interview is scheduled", body: `Your online interview for ${roleTitle} is on ${interviewText}. The meeting link is in My Applications.` };
    case "selected":
      return { title: "You're selected", body: `Congratulations — you've been selected for ${roleTitle}. Your offer letter is on its way by email.` };
    default:
      return { title: "An update on your application", body: `Thank you for interviewing for ${roleTitle}. We won't be moving forward with your application this time.` };
  }
}

// Body: { action, interviewAt?, interviewLink?, note? }. The candidate gets an
// email and a dashboard notification for every change.
router.post("/admin/job-applications/:id/status", requireAdmin, async (req, res, next) => {
  try {
    const { action, interviewAt, interviewLink, note } = req.body || {};
    const rule = typeof action === "string" ? ACTIONS[action] : null;
    if (!rule) return res.status(400).json({ ok: false, error: `action must be one of: ${Object.keys(ACTIONS).join(", ")}` });
    if (note !== undefined && (typeof note !== "string" || note.length > 500)) {
      return res.status(400).json({ ok: false, error: "Keep the note under 500 characters." });
    }

    const data = {
      status: rule.to,
      // Closed (or reopened): starts / stops the webcam-photo retention clock.
      closedAt: FINAL_STATUSES.includes(rule.to) ? new Date() : null,
      ...(note !== undefined ? { adminNote: note.trim() } : {}),
    };
    if (action === "schedule_interview") {
      const when = typeof interviewAt === "string" ? new Date(interviewAt) : null;
      if (!when || Number.isNaN(when.getTime())) return res.status(400).json({ ok: false, error: "Enter the interview date and time." });
      if (when.getTime() < Date.now() - 5 * 60 * 1000) return res.status(400).json({ ok: false, error: "The interview time is in the past." });
      if (typeof interviewLink !== "string" || interviewLink.length > 500 || !isValidHttpUrl(interviewLink.trim())) {
        return res.status(400).json({ ok: false, error: "Enter the meeting link (it must start with http:// or https://)." });
      }
      data.interviewAt = when;
      data.interviewLink = interviewLink.trim();
    }

    // A free internship has no interview round: it can be decided straight from the test.
    let from = rule.from;
    if (action === "select") {
      const target = await prisma.jobApplication.findUnique({ where: { id: req.params.id }, select: { opening: { select: { audience: true } } } });
      if (target && target.opening && target.opening.audience === "free") from = ["submitted", ...from];
    }
    // Compare-and-swap on the current status: two admins acting at once can't both win.
    const changed = await prisma.jobApplication.updateMany({ where: { id: req.params.id, status: { in: from } }, data });
    if (changed.count === 0) {
      const existing = await prisma.jobApplication.findUnique({ where: { id: req.params.id }, select: { status: true } });
      if (!existing) return res.status(404).json({ ok: false, error: "Application not found" });
      return res.status(400).json({ ok: false, error: `That isn't possible while the application is "${STATUS_LABELS[existing.status] || existing.status}".` });
    }

    const application = await prisma.jobApplication.findUnique({ where: { id: req.params.id }, include: LIST_INCLUDE });
    console.log(`[admin] ${req.admin.sub} moved job application ${application.id} to ${application.status}`);

    if (application.user) {
      const roleTitle = application.opening ? application.opening.title : "the role";
      const notice = statusNotice(application.status, roleTitle, `${ist(application.interviewAt)} IST`);
      await addNotification(application.user.id, { ...notice, link: "/dashboard?tab=applications" });
      sendCareerEmail("sendApplicationStatusEmail", {
        to: application.user.email,
        name: application.user.name,
        roleTitle,
        status: application.status,
        interviewAt: application.interviewAt,
        interviewLink: application.interviewLink,
        free: !!application.opening && application.opening.feeRequired === false,
      });
    }
    res.json({ ok: true, application: shapeApplicant(application) });
  } catch (e) {
    next(e);
  }
});

// ====================== wallets ======================
// Every student who holds (or has held) credit, with their balance.
router.get("/admin/wallets", requireAdmin, async (req, res, next) => {
  try {
    const q = queryText(req.query.q);
    const sums = await prisma.creditEntry.groupBy({ by: ["userId"], _sum: { amount: true } });
    const balanceByUser = new Map(sums.map((s) => [s.userId, s._sum.amount || 0]));
    // Lapsed credit is only written off when its owner next uses their wallet,
    // so take it off here too: students who haven't been back since their
    // credit expired don't hold it any more.
    const lapsing = await prisma.creditEntry.findMany({ where: { amount: { gt: 0 }, expiresAt: { lte: new Date() } }, distinct: ["userId"], select: { userId: true } });
    if (lapsing.length) {
      const entries = await prisma.creditEntry.findMany({ where: { userId: { in: lapsing.map((l) => l.userId) } } });
      const byUser = new Map();
      for (const e of entries) byUser.set(e.userId, [...(byUser.get(e.userId) || []), e]);
      for (const [userId, list] of byUser) balanceByUser.set(userId, (balanceByUser.get(userId) || 0) - lapsedCredit(list));
    }
    const users = await prisma.user.findMany({
      where: {
        id: { in: [...balanceByUser.keys()] },
        ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
      },
      select: USER_SUMMARY,
    });
    const wallets = users
      .map((u) => ({ _id: u.id, name: u.name, email: u.email, phone: u.phone, balance: (balanceByUser.get(u.id) || 0) / 100 }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 500);
    const outstanding = [...balanceByUser.values()].reduce((a, b) => a + b, 0) / 100;
    res.json({ ok: true, summary: { holders: balanceByUser.size, outstanding }, wallets });
  } catch (e) {
    next(e);
  }
});

// ====================== settings ======================
router.get("/admin/careers/settings", requireAdmin, async (req, res, next) => {
  try {
    res.json({ ok: true, settings: await getCareerSettings() });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/careers/settings", requireAdmin, async (req, res, next) => {
  try {
    const result = await saveCareerSettings(req.body);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    console.log(`[admin] ${req.admin.sub} changed the careers settings`);
    res.json({ ok: true, settings: result.settings });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
