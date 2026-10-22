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
    // Only the text and counters are kept — no name, account or address (the
    // other columns are the answer an admin may teach later, empty for now).
    expect(Object.keys(stored[0]).sort()).toEqual(["answer", "answeredAt", "dept", "firstAskedAt", "handled", "id", "keywords", "lastAskedAt", "linkLabel", "linkTo", "question", "timesAsked"]);
    expect(stored[0]).toMatchObject({ answer: null, keywords: "", linkTo: "", dept: "" });
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
    expect(res.body.summary).toEqual({ open: 3, handled: 1, answered: 0 });
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
    expect((await admin(request(app).get("/api/admin/bot-questions"))).body.summary).toEqual({ open: 2, handled: 2, answered: 0 });

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

describe("teaching the help agent an answer", () => {
  const answers = async () => (await request(app).get("/api/bot/answers")).body.answers;
  let weekend;
  beforeAll(async () => {
    await prisma.botQuestion.deleteMany();
    weekend = await prisma.botQuestion.create({ data: { question: "is there a weekend batch?", timesAsked: 5 } });
  });

  it("publishes nothing until an admin writes an answer", async () => {
    expect(await answers()).toEqual([]);
  });

  it("lets an admin answer a visitor's question, which marks it handled and publishes it", async () => {
    const res = await admin(request(app).put(`/api/admin/bot-questions/${weekend.id}/answer`)).send({
      answer: "Yes — weekend batches run on Saturdays and Sundays.", keywords: "saturday sunday", linkTo: "/programs", linkLabel: "See programs", dept: "programs",
    });
    expect(res.status).toBe(200);
    expect(res.body.question).toMatchObject({ handled: true, linkTo: "/programs", dept: "programs" });
    expect(await answers()).toEqual([{ q: "is there a weekend batch?", a: "Yes — weekend batches run on Saturdays and Sundays.", keywords: "saturday sunday", linkTo: "/programs", linkLabel: "See programs", dept: "programs" }]);
    const list = await admin(request(app).get("/api/admin/bot-questions?status=answered"));
    expect(list.body.questions.map((q) => q.question)).toEqual(["is there a weekend batch?"]);
    expect(list.body.summary.answered).toBe(1);
  });

  it("only links inside the site, and checks every field", async () => {
    const put = (body) => admin(request(app).put(`/api/admin/bot-questions/${weekend.id}/answer`)).send({ answer: "Yes.", ...body });
    expect((await put({ answer: "" })).status).toBe(400);
    expect((await put({ answer: "x".repeat(1501) })).status).toBe(400);
    for (const linkTo of ["https://evil.example", "//evil", "javascript:alert(1)", "programs"]) expect((await put({ linkTo })).status).toBe(400);
    expect((await put({ dept: "sales" })).status).toBe(400);
    expect((await admin(request(app).put("/api/admin/bot-questions/nope/answer")).send({ answer: "Yes." })).status).toBe(404);
  });

  it("lets an admin add a question nobody asked yet, and remove an answer again", async () => {
    const res = await admin(request(app).post("/api/admin/bot-questions")).send({ question: "Do you offer EMI?", answer: "Not yet — pay in full at checkout." });
    expect(res.status).toBe(201);
    expect(res.body.question).toMatchObject({ question: "do you offer emi?", timesAsked: 0, handled: true });
    expect((await answers()).map((a) => a.q)).toContain("do you offer emi?");
    expect((await admin(request(app).post("/api/admin/bot-questions")).send({ question: "x", answer: "y" })).status).toBe(400);

    expect((await admin(request(app).delete(`/api/admin/bot-questions/${res.body.question._id}/answer`))).status).toBe(200);
    expect((await answers()).map((a) => a.q)).not.toContain("do you offer emi?");
  });

  it("keeps the teaching endpoints admin-only", async () => {
    expect((await request(app).put(`/api/admin/bot-questions/${weekend.id}/answer`).send({ answer: "Hacked" })).status).toBe(401);
    expect((await request(app).post("/api/admin/bot-questions").set("Authorization", `Bearer ${studentToken}`).send({ question: "abc", answer: "x" })).status).toBeGreaterThanOrEqual(401);
  });
});

describe("abuse limits", () => {
  it("rate limits the public endpoint", async () => {
    const statuses = [];
    for (let i = 0; i < 25; i++) statuses.push((await report(`spam question number ${i}`)).status);
    expect(statuses).toContain(429);
  });
});
