const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

let app, prisma, adminToken;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req) => req.set("Authorization", `Bearer ${adminToken}`);
const uniqueTitle = () => `Test Course ${Date.now()}-${Math.random()}`;

// Covers the plans/status invariant: PUT /admin/courses/:id checked
// `update.status === "open"` — only ever set when the request body itself
// included `status` — instead of the RESULTING status, so a plans-only edit
// on an already-open course (e.g. clearing every plan with { tiers: [] })
// would skip the guard entirely and leave the course persisted as
// status:"open" with nothing to buy, showing as purchasable on the public site.
describe("PUT /admin/courses/:id — open/plans invariant", () => {
  let courseId;

  beforeEach(async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({
      type: "course", title: uniqueTitle(), tiers: [{ tier: "basic", price: 999 }],
    });
    expect(create.status).toBe(201);
    courseId = create.body.course._id;
    // Saving plans never auto-opens a course (separate deliberate business
    // rule) — explicitly open it so the test starts from the exact "already
    // open, already priced" state the bug required.
    const open = await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ status: "open" });
    expect(open.body.course.status).toBe("open");
  });

  it("auto-closes the course when a plans-only edit clears every plan, instead of leaving it open with nothing to buy", async () => {
    const res = await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ tiers: [] });
    expect(res.status).toBe(200);
    expect(res.body.course.tiers).toEqual([]);
    expect(res.body.course.status).toBe("closed");
  });

  it("still rejects an explicit attempt to open a course with no plans", async () => {
    await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ tiers: [] });
    const res = await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ status: "open" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/price/i);
  });

  it("leaves an already-open, already-priced course open on an unrelated field edit", async () => {
    const res = await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ tag: "Popular" });
    expect(res.status).toBe(200);
    expect(res.body.course.status).toBe("open");
    expect(res.body.course.tiers.map((t) => [t.tier, t.price])).toEqual([["basic", 999]]);
  });
});

describe("POST /admin/courses — duplicate slug handling", () => {
  it("appends a numeric suffix instead of colliding when titles produce the same slug", async () => {
    const title = "Same Title Course";
    const first = await authed(request(app).post("/api/admin/courses")).send({ type: "course", title, tiers: [{ tier: "basic", price: 100 }] });
    const second = await authed(request(app).post("/api/admin/courses")).send({ type: "course", title, tiers: [{ tier: "basic", price: 100 }] });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.course.slug).not.toBe(second.body.course.slug);
  });
});

// Basic / Plus / Pro plans: each course or internship offers up to three,
// each with its own price, discount and feature list.
describe("course plans (basic / plus / pro)", () => {
  it("stores up to three plans and returns them in basic -> plus -> pro order", async () => {
    // Sent out of order on purpose.
    const res = await authed(request(app).post("/api/admin/courses")).send({
      type: "course", title: uniqueTitle(), tiers: [
        { tier: "pro", price: 9999, discountPercent: 10, features: ["1:1 mentoring", " Code review "] },
        { tier: "basic", price: 2999 },
        { tier: "plus", price: 5999, features: ["Live classes"] },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.course.tiers.map((t) => t.tier)).toEqual(["basic", "plus", "pro"]);
    const pro = res.body.course.tiers[2];
    expect(pro.price).toBe(9999);
    expect(pro.discountPercent).toBe(10);
    expect(pro.features).toEqual(["1:1 mentoring", "Code review"]); // trimmed
    expect(res.body.course.tiers[0].features).toEqual([]);
    expect(res.body.course.status).toBe("closed"); // saving plans never opens it
  });

  it("serves the same plans on the public endpoint", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({ type: "course", title: uniqueTitle(), tiers: [{ tier: "plus", price: 4000 }] });
    const pub = await request(app).get(`/api/courses/${create.body.course.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.course.tiers).toHaveLength(1);
    expect(pub.body.course.tiers[0]).toMatchObject({ tier: "plus", price: 4000 });
  });

  it("treats a blank price as plan-not-offered instead of an error", async () => {
    const res = await authed(request(app).post("/api/admin/courses")).send({
      type: "internship", title: uniqueTitle(), tiers: [{ tier: "basic", price: 1500 }, { tier: "plus", price: "" }, { tier: "pro", price: null }],
    });
    expect(res.status).toBe(201);
    expect(res.body.course.tiers.map((t) => t.tier)).toEqual(["basic"]);
  });

  it("replaces the whole plan set on update, removing plans that are left out", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({
      type: "course", title: uniqueTitle(), tiers: [{ tier: "basic", price: 1000 }, { tier: "plus", price: 2000 }, { tier: "pro", price: 3000 }],
    });
    const id = create.body.course._id;
    const res = await authed(request(app).put(`/api/admin/courses/${id}`)).send({
      tiers: [{ tier: "plus", price: 2500, discountPercent: 20, features: ["Live classes"] }, { tier: "pro", price: 3000 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.course.tiers.map((t) => [t.tier, t.price, t.discountPercent])).toEqual([["plus", 2500, 20], ["pro", 3000, 0]]);
    expect(await prisma.courseTier.count({ where: { courseId: id } })).toBe(2);
  });

  it("leaves the plans alone when an update does not mention them", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({
      type: "course", title: uniqueTitle(), tiers: [{ tier: "basic", price: 1000 }, { tier: "pro", price: 3000 }],
    });
    const res = await authed(request(app).put(`/api/admin/courses/${create.body.course._id}`)).send({ tag: "Popular" });
    expect(res.body.course.tiers.map((t) => t.tier)).toEqual(["basic", "pro"]);
  });

  it("adding the first plan to an unpriced internship keeps it closed until the admin opens it", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: uniqueTitle() });
    expect(create.status).toBe(201);
    expect(create.body.course.tiers).toEqual([]);
    const id = create.body.course._id;
    const withPlan = await authed(request(app).put(`/api/admin/courses/${id}`)).send({ tiers: [{ tier: "basic", price: 500 }], status: "open" });
    expect(withPlan.body.course.status).toBe("closed");
    const opened = await authed(request(app).put(`/api/admin/courses/${id}`)).send({ status: "open" });
    expect(opened.body.course.status).toBe("open");
  });

  it("requires at least one priced plan to create a course", async () => {
    const none = await authed(request(app).post("/api/admin/courses")).send({ type: "course", title: uniqueTitle() });
    expect(none.status).toBe(400);
    const blank = await authed(request(app).post("/api/admin/courses")).send({ type: "course", title: uniqueTitle(), tiers: [{ tier: "basic", price: "" }] });
    expect(blank.status).toBe(400);
  });

  it.each([
    ["an unknown tier", [{ tier: "gold", price: 100 }]],
    ["a duplicated tier", [{ tier: "basic", price: 100 }, { tier: "basic", price: 200 }]],
    ["a negative price", [{ tier: "basic", price: -5 }]],
    ["a discount over 100", [{ tier: "basic", price: 100, discountPercent: 101 }]],
    ["a fractional discount", [{ tier: "basic", price: 100, discountPercent: 12.5 }]],
    ["a non-numeric price", [{ tier: "basic", price: "abc" }]],
  ])("rejects %s", async (_label, tiers) => {
    const res = await authed(request(app).post("/api/admin/courses")).send({ type: "course", title: uniqueTitle(), tiers });
    expect(res.status).toBe(400);
  });

  it("deletes a course together with its plans", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({ type: "course", title: uniqueTitle(), tiers: [{ tier: "basic", price: 100 }] });
    const id = create.body.course._id;
    const del = await authed(request(app).delete(`/api/admin/courses/${id}`));
    expect(del.status).toBe(200);
    expect(await prisma.courseTier.count({ where: { courseId: id } })).toBe(0);
  });
});
