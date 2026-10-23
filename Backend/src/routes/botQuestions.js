const express = require("express");
const rateLimit = require("express-rate-limit");
const { prisma } = require("../db");
const { requireAdmin } = require("../middleware/requireAdmin");
const { serialize } = require("../utils/serialize");
const { queryText } = require("../utils/validators");
const { cleanQuestion, MAX_STORED_LENGTH } = require("../utils/botQuestionText");

const router = express.Router();

// Its own limiter (not the shared public one) so a chatty visitor can't use up the
// quota the contact and apply forms depend on.
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please try again in a few minutes." },
});

// A public endpoint that writes rows could otherwise be used to fill the table with
// junk; past this many distinct questions, new ones are quietly dropped (known
// questions still count up).
const MAX_ROWS = 5000;

// ---------- public: the help bot reports a question it couldn't answer ----------
// Anonymous by design: only the (masked) text is stored — no name, account or IP.
router.post("/bot/unanswered", reportLimiter, async (req, res, next) => {
  try {
    const question = cleanQuestion((req.body || {}).question);
    if (!question) return res.status(400).json({ ok: false, error: "Nothing to record." });

    const known = await prisma.botQuestion.findUnique({ where: { question }, select: { id: true } });
    if (!known && (await prisma.botQuestion.count()) >= MAX_ROWS) return res.json({ ok: true });

    const again = { timesAsked: { increment: 1 }, lastAskedAt: new Date(), handled: false };
    try {
      await prisma.botQuestion.upsert({ where: { question }, create: { question }, update: again });
    } catch (e) {
      // Two visitors asked the same new question at the same instant: the other one won
      // the insert, so this one is just another "asked again".
      if (!(e && e.code === "P2002")) throw e;
      await prisma.botQuestion.update({ where: { question }, data: again });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- public: the answers admins taught the help agent ----------
// The site's agent loads these when its chat opens and matches visitors'
// messages against them. Only what the agent shows is sent.
const answersLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please try again in a minute." },
});
router.get("/bot/answers", answersLimiter, async (req, res, next) => {
  try {
    const rows = await prisma.botQuestion.findMany({
      where: { answer: { not: null } },
      select: { question: true, answer: true, keywords: true, linkTo: true, linkLabel: true, dept: true },
      orderBy: { timesAsked: "desc" },
      take: 500,
    });
    res.set("Cache-Control", "public, max-age=120");
    res.json({ ok: true, answers: rows.map((r) => ({ q: r.question, a: r.answer, keywords: r.keywords, linkTo: r.linkTo, linkLabel: r.linkLabel, dept: r.dept })) });
  } catch (e) {
    next(e);
  }
});

// Validates an admin's answer. Returns { data } ready for Prisma, or { error }.
// The link may only point inside this site, so a taught answer can't send
// visitors somewhere else.
const DEPTS = ["", "programs", "it", "both"];
function answerData(body) {
  const b = body || {};
  const answer = typeof b.answer === "string" ? b.answer.trim() : "";
  if (!answer) return { error: "Write the answer the help agent should give." };
  if (answer.length > 1500) return { error: "Keep the answer under 1500 characters." };
  const keywords = typeof b.keywords === "string" ? b.keywords.trim().slice(0, 300) : "";
  const linkTo = typeof b.linkTo === "string" ? b.linkTo.trim() : "";
  if (linkTo && (!/^\/[a-z0-9\-/]{0,118}$/.test(linkTo) || linkTo.startsWith("//"))) return { error: "The link must be a page on this site, like /programs or /careers." };
  const linkLabel = typeof b.linkLabel === "string" ? b.linkLabel.trim().slice(0, 60) : "";
  const dept = typeof b.dept === "string" ? b.dept : "";
  if (!DEPTS.includes(dept)) return { error: "Choose which team's number to show, or none." };
  return { data: { answer, keywords, linkTo, linkLabel: linkTo ? linkLabel : "", dept, handled: true, answeredAt: new Date() } };
}

// ---------- admin: review them ----------
// ?status=open (default) | handled | answered | all, optional ?q= search. Most-asked first.
router.get("/admin/bot-questions", requireAdmin, async (req, res, next) => {
  try {
    const status = ["open", "handled", "answered", "all"].includes(req.query.status) ? req.query.status : "open";
    const q = queryText(req.query.q);
    const where = {
      ...(status === "open" ? { handled: false } : status === "handled" ? { handled: true } : status === "answered" ? { answer: { not: null } } : {}),
      ...(q ? { question: { contains: q } } : {}),
    };
    const [questions, open, handled, answered] = await Promise.all([
      prisma.botQuestion.findMany({ where, orderBy: [{ timesAsked: "desc" }, { lastAskedAt: "desc" }], take: 500 }),
      prisma.botQuestion.count({ where: { handled: false } }),
      prisma.botQuestion.count({ where: { handled: true } }),
      prisma.botQuestion.count({ where: { answer: { not: null } } }),
    ]);
    res.json({ ok: true, questions: serialize(questions), summary: { open, handled, answered } });
  } catch (e) {
    next(e);
  }
});

router.patch("/admin/bot-questions/:id", requireAdmin, async (req, res, next) => {
  try {
    const { handled } = req.body || {};
    if (typeof handled !== "boolean") return res.status(400).json({ ok: false, error: "handled must be true or false" });
    const question = await prisma.botQuestion.update({ where: { id: req.params.id }, data: { handled } }).catch(() => null);
    if (!question) return res.status(404).json({ ok: false, error: "Question not found" });
    res.json({ ok: true, question: serialize(question) });
  } catch (e) {
    next(e);
  }
});

// Teach (or change) the answer to a question visitors asked; marks it handled.
router.put("/admin/bot-questions/:id/answer", requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = answerData(req.body);
    if (error) return res.status(400).json({ ok: false, error });
    const question = await prisma.botQuestion.update({ where: { id: req.params.id }, data }).catch(() => null);
    if (!question) return res.status(404).json({ ok: false, error: "Question not found" });
    res.json({ ok: true, question: serialize(question) });
  } catch (e) {
    next(e);
  }
});

// Stop giving a taught answer (the question itself stays in the list).
router.delete("/admin/bot-questions/:id/answer", requireAdmin, async (req, res, next) => {
  try {
    const question = await prisma.botQuestion.update({
      where: { id: req.params.id },
      data: { answer: null, keywords: "", linkTo: "", linkLabel: "", dept: "", answeredAt: null },
    }).catch(() => null);
    if (!question) return res.status(404).json({ ok: false, error: "Question not found" });
    res.json({ ok: true, question: serialize(question) });
  } catch (e) {
    next(e);
  }
});

// Teach an answer to a question nobody has asked yet.
router.post("/admin/bot-questions", requireAdmin, async (req, res, next) => {
  try {
    const raw = typeof (req.body || {}).question === "string" ? req.body.question.replace(/\s+/g, " ").trim() : "";
    if (raw.length < 3 || raw.length > MAX_STORED_LENGTH) return res.status(400).json({ ok: false, error: `Write the question (3 to ${MAX_STORED_LENGTH} characters).` });
    const { data, error } = answerData(req.body);
    if (error) return res.status(400).json({ ok: false, error });
    const question = raw.toLowerCase();
    const existing = await prisma.botQuestion.findUnique({ where: { question }, select: { id: true } });
    const row = existing
      ? await prisma.botQuestion.update({ where: { id: existing.id }, data })
      : await prisma.botQuestion.create({ data: { question, timesAsked: 0, ...data } });
    res.status(existing ? 200 : 201).json({ ok: true, question: serialize(row) });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/bot-questions/:id", requireAdmin, async (req, res, next) => {
  try {
    const question = await prisma.botQuestion.delete({ where: { id: req.params.id } }).catch(() => null);
    if (!question) return res.status(404).json({ ok: false, error: "Question not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
