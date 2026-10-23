const { setupTestDb, teardownTestDb } = require("./testDb");

// The weekly email of questions the help agent couldn't answer: sent at most once
// a week, only when there is something to teach, and retried if the email fails.
jest.mock("../src/utils/mailer", () => ({ ...jest.requireActual("../src/utils/mailer"), sendBotDigestEmail: jest.fn(async () => ({ sent: true })) }));
const mailer = require("../src/utils/mailer");

let prisma, sendBotDigestIfDue;
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  await setupTestDb();
  ({ prisma } = require("../src/db"));
  ({ sendBotDigestIfDue } = require("../src/utils/botDigest"));
}, 60000);
afterAll(async () => { await teardownTestDb(); });
beforeEach(async () => {
  mailer.sendBotDigestEmail.mockClear();
  await prisma.setting.deleteMany({ where: { key: "botDigest" } });
  await prisma.botQuestion.deleteMany();
});

it("sends nothing in a week with no open questions, but still waits a week to check again", async () => {
  const now = new Date("2026-10-23T09:00:00Z");
  expect(await sendBotDigestIfDue(now)).toEqual({ sent: false, reason: "nothing to answer" });
  expect(mailer.sendBotDigestEmail).not.toHaveBeenCalled();
  expect((await sendBotDigestIfDue(new Date(now.getTime() + DAY))).reason).toBe("not due");
});

it("lists the most-asked open questions, then waits a week", async () => {
  await prisma.botQuestion.createMany({
    data: [
      { question: "is there a weekend batch?", timesAsked: 9 },
      { question: "do you give placement?", timesAsked: 4 },
      { question: "already answered one", timesAsked: 30, handled: true },
    ],
  });
  const now = new Date("2026-10-23T09:00:00Z");
  expect(await sendBotDigestIfDue(now)).toEqual({ sent: true, count: 2 });
  expect(mailer.sendBotDigestEmail).toHaveBeenCalledWith({
    total: 2,
    questions: [{ question: "is there a weekend batch?", timesAsked: 9 }, { question: "do you give placement?", timesAsked: 4 }],
  });

  expect((await sendBotDigestIfDue(new Date(now.getTime() + 6 * DAY))).reason).toBe("not due");
  expect((await sendBotDigestIfDue(new Date(now.getTime() + 7 * DAY))).sent).toBe(true);
  expect(mailer.sendBotDigestEmail).toHaveBeenCalledTimes(2);
});

it("tries again next time when the email fails, instead of skipping the week", async () => {
  await prisma.botQuestion.create({ data: { question: "do you offer emi?", timesAsked: 2 } });
  mailer.sendBotDigestEmail.mockRejectedValueOnce(new Error("Brevo down"));
  const now = new Date("2026-10-23T09:00:00Z");
  await expect(sendBotDigestIfDue(now)).rejects.toThrow("Brevo down");
  expect((await sendBotDigestIfDue(new Date(now.getTime() + 6 * 60 * 60 * 1000))).sent).toBe(true);
});
