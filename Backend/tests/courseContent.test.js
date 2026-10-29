const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// The richer course page: "What you'll learn", "Who it's for", prerequisites and FAQs are
// entered by the admin per course/internship and served on the public course endpoint.

let app, prisma, adminToken, studentToken;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "content-admin@test.com", passwordHash: "x", role: "admin" } });
  const student = await prisma.user.create({ data: { name: "Student", email: "content-student@test.com", passwordHash: "x", role: "student" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
  studentToken = signToken({ sub: student.id, role: "student", email: student.email }, { expiresIn: "1h" });
}, 90000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req, t = adminToken) => req.set("Authorization", `Bearer ${t}`);
let n = 0;
const create = (body = {}) =>
  authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: `Rich Content ${Date.now()}-${++n}`, ...body });
const update = (id, body) => authed(request(app).put(`/api/admin/courses/${id}`)).send(body);

describe("rich course content", () => {
  it("starts empty for a course created without any (so the page shows no empty sections)", async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.course).toMatchObject({ outcomes: [], audience: [], prerequisites: [], faqs: [] });
  });

  it("is saved on create and served, unauthenticated, on the public course endpoint", async () => {
    const res = await create({
      outcomes: ["Build a REST API", "Deploy to production"],
      audience: ["Final-year students"],
      prerequisites: ["Basic JavaScript"],
      faqs: [{ q: "Is there a certificate?", a: "Yes, on completion." }],
    });
    expect(res.status).toBe(201);
    const pub = await request(app).get(`/api/courses/${res.body.course.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.course).toMatchObject({
      outcomes: ["Build a REST API", "Deploy to production"],
      audience: ["Final-year students"],
      prerequisites: ["Basic JavaScript"],
      faqs: [{ q: "Is there a certificate?", a: "Yes, on completion." }],
    });
    const list = await request(app).get("/api/courses?type=internship");
    expect(list.body.courses.find((c) => c.slug === res.body.course.slug).outcomes).toHaveLength(2);
  });

  it("trims text and drops blank rows left in by the form", async () => {
    const res = await create({ outcomes: ["  Learn React  ", "", "   "], faqs: [{ q: "  Q?  ", a: "  A.  " }, { q: "", a: "" }, { q: "  ", a: "" }] });
    expect(res.body.course.outcomes).toEqual(["Learn React"]);
    expect(res.body.course.faqs).toEqual([{ q: "Q?", a: "A." }]);
  });

  it("changes only the lists an update mentions, and [] clears one", async () => {
    const made = (await create({ outcomes: ["One"], audience: ["Students"], faqs: [{ q: "Q?", a: "A." }] })).body.course;
    const a = await update(made._id, { title: "Renamed" }); // mentions none of them
    expect(a.body.course).toMatchObject({ outcomes: ["One"], audience: ["Students"], faqs: [{ q: "Q?", a: "A." }] });
    const b = await update(made._id, { outcomes: ["Two", "Three"] });
    expect(b.body.course).toMatchObject({ outcomes: ["Two", "Three"], audience: ["Students"] });
    const c = await update(made._id, { faqs: [] });
    expect(c.body.course.faqs).toEqual([]);
    expect(c.body.course.outcomes).toEqual(["Two", "Three"]);
  });

  it("works on a course (with plans) as well as an internship", async () => {
    const res = await create({ type: "course", tiers: [{ tier: "basic", price: 999 }], outcomes: ["Ship a project"] });
    expect(res.status).toBe(201);
    expect(res.body.course.outcomes).toEqual(["Ship a project"]);
  });

  it("rejects bad input with a clear message, and changes nothing", async () => {
    const made = (await create({ outcomes: ["Keep me"] })).body.course;
    const tooMany = Array.from({ length: 13 }, (_, i) => `item ${i}`);
    const cases = [
      [{ outcomes: "not a list" }, /What you'll learn must be a list/],
      [{ outcomes: [1, 2] }, /must be a list/],
      [{ outcomes: tooMany }, /at most 12/],
      [{ audience: ["x".repeat(201)] }, /at most 200 characters/],
      [{ prerequisites: Array.from({ length: 9 }, (_, i) => `p${i}`) }, /at most 8/],
      [{ faqs: "nope" }, /must be a list of questions/],
      [{ faqs: [{ q: "Only a question" }] }, /both a question and an answer/],
      [{ faqs: [{ q: "q", a: "a".repeat(1501) }] }, /at most 1500 characters/],
      [{ faqs: [{ q: "q".repeat(201), a: "a" }] }, /at most 200 characters/],
      [{ faqs: Array.from({ length: 16 }, (_, i) => ({ q: `q${i}`, a: "a" })) }, /at most 15/],
      [{ faqs: [{ q: 1, a: 2 }] }, /as text/],
      [{ faqs: [null] }, /must be a list of questions/],
    ];
    for (const [body, message] of cases) {
      const res = await update(made._id, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(message);
    }
    expect((await request(app).get(`/api/courses/${made.slug}`)).body.course.outcomes).toEqual(["Keep me"]);
    // create is validated the same way
    expect((await create({ faqs: [{ q: "no answer" }] })).status).toBe(400);
  });

  it("can only be changed by an admin", async () => {
    const made = (await create()).body.course;
    const res = await update(made._id, { outcomes: ["hack"] }).set("Authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    expect((await request(app).put(`/api/admin/courses/${made._id}`).send({ outcomes: ["hack"] })).status).toBe(401);
  });
});

// The details a free internship shows, now on paid internships and courses too.
describe("internship-style details and positions", () => {
  const buyer = async () => {
    const u = await prisma.user.create({ data: { name: "Seat Buyer", email: `seat-${Date.now()}-${++n}@test.com`, phone: "9876500000", passwordHash: "x", role: "student" } });
    return { id: u.id, token: signToken({ sub: u.id, role: "student", email: u.email }, { expiresIn: "1h" }) };
  };
  const quote = (s, slug) => authed(request(app).post("/api/payments/quote"), s.token).send({ courseSlug: slug, tier: "basic" });

  it("saves skills, responsibilities, eligibility, stipend, experience, mode and positions", async () => {
    const res = await create({
      skills: ["React", " Node "], responsibilities: ["Ship features", ""], eligibility: ["Final-year students"],
      stipend: " Up to ₹5,000/month ", experience: "Freshers welcome", mode: "Remote", positions: 10,
    });
    expect(res.status).toBe(201);
    const pub = (await request(app).get(`/api/courses/${res.body.course.slug}`)).body.course;
    expect(pub).toMatchObject({
      skills: ["React", "Node"], responsibilities: ["Ship features"], eligibility: ["Final-year students"],
      stipend: "Up to ₹5,000/month", experience: "Freshers welcome", mode: "Remote",
      positions: { total: 10, filled: 0, left: 10 },
    });
    expect(pub._count).toBeUndefined();
    expect((await create()).body.course).toMatchObject({ skills: [], stipend: "", positions: null });
  });

  it("rejects a bad number of positions or over-long text", async () => {
    expect((await create({ positions: 0 })).status).toBe(400);
    expect((await create({ positions: 1.5 })).status).toBe(400);
    expect((await create({ stipend: "x".repeat(191) })).status).toBe(400);
    expect((await create({ skills: "React" })).status).toBe(400);
  });

  it("fills a place per enrollment, and stops selling when all are taken", async () => {
    const made = (await create({ type: "course", positions: 1, tiers: [{ tier: "basic", price: 500 }] })).body.course;
    await update(made._id, { status: "open" });
    const [first, second] = [await buyer(), await buyer()];
    expect((await quote(second, made.slug)).status).toBe(200);

    await prisma.enrollment.create({ data: { userId: first.id, courseId: made._id, tier: "basic" } });
    const pub = (await request(app).get(`/api/courses/${made.slug}`)).body.course;
    expect(pub.positions).toEqual({ total: 1, filled: 1, left: 0 });
    const refused = await quote(second, made.slug);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/All seats for this course are filled/);

    // One more place opens it again; clearing the number removes the limit.
    expect((await update(made._id, { positions: 2 })).body.course.positions).toEqual({ total: 2, filled: 1, left: 1 });
    expect((await quote(second, made.slug)).status).toBe(200);
    expect((await update(made._id, { positions: null })).body.course.positions).toBeNull();
  });
});
