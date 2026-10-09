const express = require("express");
const rateLimit = require("express-rate-limit");
const { prisma } = require("../db");
const { requireAdmin } = require("../middleware/requireAdmin");
const { serialize } = require("../utils/serialize");
const { queryText } = require("../utils/validators");
const { cleanQuestion } = require("../utils/botQuestionText");

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

// ---------- admin: review them ----------
// ?status=open (default) | handled | all, optional ?q= search. Most-asked first.
router.get("/admin/bot-questions", requireAdmin, async (req, res, next) => {
  try {
    const status = ["open", "handled", "all"].includes(req.query.status) ? req.query.status : "open";
    const q = queryText(req.query.q);
    const where = {
      ...(status === "open" ? { handled: false } : status === "handled" ? { handled: true } : {}),
      ...(q ? { question: { contains: q } } : {}),
    };
    const [questions, open, handled] = await Promise.all([
      prisma.botQuestion.findMany({ where, orderBy: [{ timesAsked: "desc" }, { lastAskedAt: "desc" }], take: 500 }),
      prisma.botQuestion.count({ where: { handled: false } }),
      prisma.botQuestion.count({ where: { handled: true } }),
    ]);
    res.json({ ok: true, questions: serialize(questions), summary: { open, handled } });
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
