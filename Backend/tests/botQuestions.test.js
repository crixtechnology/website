const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// Everything else the app does by email is irrelevant here; keep the mailer quiet.
jest.mock("../src/utils/mailer", () => ({
  sendApplicationEmail: jest.fn(async () => ({})),
  sendAccountExistsEmail: jest.fn(async () => ({})),
  sendReceiptEmail: jest.fn(async () => ({})),
  sendContactEmail: jest.fn(async () => ({})),
  sendWalletCreditEmail: jest.fn(async () => ({})),
}));

let app, prisma, adminToken, studentToken;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
  const student = await prisma.user.create({ data: { name: "Student", email: "student@test.com", passwordHash: "x", role: "student" } });
  studentToken = signToken({ sub: student.id, role: "student", email: student.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const report = (question) => request(app).post("/api/bot/unanswered").send({ question });
const rows = () => prisma.botQuestion.findMany({ orderBy: { firstAskedAt: "asc" } });
const admin = (req) => req.set("Authorization", `Bearer ${adminToken}`);

describe("the help bot reports a question it couldn't answer", () => {
  it("stores it without a login, and counts repeats (any case or spacing) as one question", async () => {
    expect((await report("Do you teach Rust?")).body).toEqual({ ok: true });
    await report("do you   teach rust?");
    await report("DO YOU TEACH RUST?  ");
    const stored = await prisma.botQuestion.findMany({ where: { question: "do you teach rust?" } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ timesAsked: 3, handled: false });
    // Only the text and counters are kept — no name, account or address.
    expect(Object.keys(stored[0]).sort()).toEqual(["firstAskedAt", "handled", "id", "lastAskedAt", "question", "timesAsked"]);
  });

  it("masks emails, phone numbers and links before saving", async () => {
    await report("call me on +91 98765 43210 about the discount");
    await report("my email is asha.k@example.com can you reply? see https://example.com/x?y=1");
    const all = (await rows()).map((r) => r.question);
    expect(all).toContain("call me on [number] about the discount");
    expect(all).toContain("my email is [email] can you reply? see [link]");
    const text = all.join("\n");
    expect(text).not.toMatch(/98765|asha\.k|example\.com/);
  });

  it("refuses things that aren't a question worth keeping", async () => {
    const before = (await rows()).length;
    expect((await request(app).post("/api/bot/unanswered").send({})).status).toBe(400);
    expect((await report(12345)).status).toBe(400);
    expect((await report("   ")).status).toBe(400);
    expect((await report("x".repeat(500))).status).toBe(400);
    expect((await rows()).length).toBe(before);
  });

  it("copes with the same new question arriving at the same instant", async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => report("is there a hindi batch?")));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    const stored = await prisma.botQuestion.findMany({ where: { question: "is there a hindi batch?" } });
    expect(stored).toHaveLength(1);
    expect(stored[0].timesAsked).toBe(4);
  });
});

describe("the admin's review list", () => {
  beforeAll(async () => {
    await prisma.botQuestion.deleteMany();
    await prisma.botQuestion.createMany({
      data: [
        { question: "is there a weekend batch?", timesAsked: 9 },
        { question: "do you give placement?", timesAsked: 4 },
        { question: "what laptop do i need?", timesAsked: 4, lastAskedAt: new Date(Date.now() + 60000) },
        { question: "old question already answered", timesAsked: 20, handled: true },
      ],
    });
  });

  it("is for admins only", async () => {
    expect((await request(app).get("/api/admin/bot-questions")).status).toBe(401);
    expect((await request(app).get("/api/admin/bot-questions").set("Authorization", `Bearer ${studentToken}`)).status).toBeGreaterThanOrEqual(401);
    const id = (await prisma.botQuestion.findFirst()).id;
    expect((await request(app).patch(`/api/admin/bot-questions/${id}`).send({ handled: true })).status).toBe(401);
    expect((await request(app).delete(`/api/admin/bot-questions/${id}`)).status).toBe(401);
  });

  it("lists open questions most-asked first (ties: most recent), with counts of both kinds", async () => {
    const res = await admin(request(app).get("/api/admin/bot-questions"));
    expect(res.status).toBe(200);
    expect(res.body.questions.map((q) => q.question)).toEqual([
      "is there a weekend batch?", "what laptop do i need?", "do you give placement?",
    ]);
    expect(res.body.questions[0]).toMatchObject({ timesAsked: 9, handled: false });
    expect(res.body.questions[0]._id).toBeTruthy();
    expect(res.body.summary).toEqual({ open: 3, handled: 1 });
  });

  it("filters by status and searches the text", async () => {
    const handled = await admin(request(app).get("/api/admin/bot-questions?status=handled"));
    expect(handled.body.questions.map((q) => q.question)).toEqual(["old question already answered"]);
    const all = await admin(request(app).get("/api/admin/bot-questions?status=all"));
    expect(all.body.questions).toHaveLength(4);
    const found = await admin(request(app).get("/api/admin/bot-questions?status=all&q=laptop"));
    expect(found.body.questions.map((q) => q.question)).toEqual(["what laptop do i need?"]);
    // A non-text ?q must not blow up.
    expect((await admin(request(app).get("/api/admin/bot-questions?q[]=a&q[x]=y"))).status).toBe(200);
  });

  it("marks a question handled, and asking it again reopens it", async () => {
    const target = await prisma.botQuestion.findFirst({ where: { question: "do you give placement?" } });
    const done = await admin(request(app).patch(`/api/admin/bot-questions/${target.id}`)).send({ handled: true });
    expect(done.status).toBe(200);
    expect(done.body.question.handled).toBe(true);
    expect((await admin(request(app).get("/api/admin/bot-questions"))).body.summary).toEqual({ open: 2, handled: 2 });

    await report("Do you give placement?");
    const reopened = await prisma.botQuestion.findUnique({ where: { id: target.id } });
    expect(reopened).toMatchObject({ handled: false, timesAsked: 5 });
  });

  it("rejects a bad update, 404s unknown ids, and deletes", async () => {
    const target = await prisma.botQuestion.findFirst({ where: { question: "what laptop do i need?" } });
    expect((await admin(request(app).patch(`/api/admin/bot-questions/${target.id}`)).send({ handled: "yes" })).status).toBe(400);
    expect((await admin(request(app).patch("/api/admin/bot-questions/nope")).send({ handled: true })).status).toBe(404);
    expect((await admin(request(app).delete("/api/admin/bot-questions/nope"))).status).toBe(404);
    expect((await admin(request(app).delete(`/api/admin/bot-questions/${target.id}`))).status).toBe(200);
    expect(await prisma.botQuestion.findUnique({ where: { id: target.id } })).toBeNull();
  });
});

describe("abuse limits", () => {
  it("rate limits the public endpoint", async () => {
    const statuses = [];
    for (let i = 0; i < 25; i++) statuses.push((await report(`spam question number ${i}`)).status);
    expect(statuses).toContain(429);
  });
});
