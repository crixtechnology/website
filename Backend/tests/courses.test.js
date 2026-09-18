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

// Covers the price/status invariant bug from this session: PUT
// /admin/courses/:id checked `update.status === "open"` — only ever set
// when the request body itself included `status` — instead of the
// RESULTING status, so a price-only edit on an already-open course (e.g.
// clearing the price with { price: null }) skipped the guard entirely and
// left the course persisted as status:"open" with price:null, showing as
// purchasable on the public site with no price.
describe("PUT /admin/courses/:id — open/price invariant", () => {
  let courseId;

  beforeEach(async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({
      type: "course", title: `Test Course ${Date.now()}-${Math.random()}`, price: 999,
    });
    expect(create.status).toBe(201);
    courseId = create.body.course._id;
    // Setting a price never auto-opens a course (separate deliberate
    // business rule) — explicitly open it so the test starts from the
    // exact "already open, already priced" state the bug required.
    const open = await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ status: "open" });
    expect(open.body.course.status).toBe("open");
  });

  it("auto-closes the course when a price-only edit clears its price, instead of leaving it open with no price", async () => {
    const res = await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ price: null });
    expect(res.status).toBe(200);
    expect(res.body.course.price).toBeNull();
    expect(res.body.course.status).toBe("closed");
  });

  it("still rejects an explicit attempt to open an unpriced course", async () => {
    await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ price: null });
    const res = await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ status: "open" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/price/i);
  });

  it("leaves an already-open, already-priced course open on an unrelated field edit", async () => {
    const res = await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ tag: "Popular" });
    expect(res.status).toBe(200);
    expect(res.body.course.status).toBe("open");
    expect(res.body.course.price).toBe(999);
  });
});

describe("POST /admin/courses — duplicate slug handling", () => {
  it("appends a numeric suffix instead of colliding when titles produce the same slug", async () => {
    const title = "Same Title Course";
    const first = await authed(request(app).post("/api/admin/courses")).send({ type: "course", title, price: 100 });
    const second = await authed(request(app).post("/api/admin/courses")).send({ type: "course", title, price: 100 });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.course.slug).not.toBe(second.body.course.slug);
  });
});
