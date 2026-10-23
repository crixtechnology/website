// A weekly email to the site owner listing the questions visitors asked the
// help agent that it couldn't answer (BotQuestion, handled = false), most asked
// first — so the answers worth teaching (Admin → Help agent questions) don't
// depend on someone remembering to look.
//
// The host can sleep and restart at any time, so this doesn't rely on a
// week-long timer: it checks every few hours and sends only when a week has
// passed since the last one, remembered in the Setting table. Nothing is sent
// in a week with no open questions.
const { prisma } = require("../db");
const { sendBotDigestEmail } = require("./mailer");

const SETTING_KEY = "botDigest";
const EVERY_DAYS = 7;
const TOP = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

async function lastSentAt() {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const at = row && row.value && row.value.lastSentAt;
  return at ? new Date(at) : null;
}

async function markSent(now) {
  const value = { lastSentAt: now.toISOString() };
  await prisma.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value }, update: { value } });
}

// Sends the digest if a week has passed. Returns { sent, reason?, count? }.
// The date is recorded only after a successful send (or a week with nothing to
// send), so a failed email is retried on the next check instead of skipped.
async function sendBotDigestIfDue(now = new Date()) {
  const last = await lastSentAt();
  if (last && now - last < EVERY_DAYS * DAY_MS) return { sent: false, reason: "not due" };

  const [questions, total] = await Promise.all([
    prisma.botQuestion.findMany({
      where: { handled: false },
      orderBy: [{ timesAsked: "desc" }, { lastAskedAt: "desc" }],
      take: TOP,
      select: { question: true, timesAsked: true },
    }),
    prisma.botQuestion.count({ where: { handled: false } }),
  ]);
  if (!questions.length) {
    await markSent(now);
    return { sent: false, reason: "nothing to answer" };
  }
  await sendBotDigestEmail({ questions, total });
  await markSent(now);
  return { sent: true, count: questions.length };
}

function startBotDigest() {
  const run = () => sendBotDigestIfDue().catch((e) => console.error("[help agent] weekly digest failed (will retry):", e.message));
  const first = setTimeout(run, 2 * 60 * 1000);
  const every = setInterval(run, 6 * 60 * 60 * 1000);
  first.unref();
  every.unref();
}

module.exports = { sendBotDigestIfDue, startBotDigest, EVERY_DAYS, TOP };
