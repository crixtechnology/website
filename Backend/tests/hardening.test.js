const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// Found by throwing hostile input (arrays where text belongs, numbers as text, oversized
// numbers, malformed JSON) at every route: none of it should ever answer 5xx.
jest.mock("../src/utils/rateLimit", () => ({ publicWriteLimiter: (req, res, next) => next() }));
jest.mock("../src/utils/mailer", () => ({
  sendApplicationEmail: jest.fn(async () => ({})),
  sendAccountExistsEmail: jest.fn(async () => ({})),
  sendReceiptEmail: jest.fn(async () => ({})),
  sendContactEmail: jest.fn(async () => ({})),
}));
jest.mock("../src/utils/razorpay", () => ({
  isLiveBlocked: false,
  razorpay: { orders: { create: jest.fn(async () => ({ id: `order_h_${Math.random().toString(36).slice(2)}`, currency: "INR" })) } },
}));

let app, prisma, adminToken, course;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
  const created = await request(app).post("/api/admin/courses").set("Authorization", `Bearer ${adminToken}`)
    .send({ type: "course", title: "Hardening Course", tiers: [{ tier: "basic", price: 1000 }] });
  course = created.body.course;
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const admin = (req) => req.set("Authorization", `Bearer ${adminToken}`);

describe("admin searches ignore a non-text ?q", () => {
  const lists = ["users", "contacts", "applications", "enrollments", "services", "payments", "ambassadors", "referrals"];
  it.each(lists)("GET /api/admin/%s?q[]=a is a normal 200", async (name) => {
    const res = await admin(request(app).get(`/api/admin/${name}?q[]=a&q[x]=y`));
    expect(res.status).toBe(200);
  });
  it("ignores a non-text ?courseId on the lecture and video lists", async () => {
    expect((await admin(request(app).get("/api/admin/lectures?courseId[]=a"))).status).toBe(200);
    expect((await admin(request(app).get("/api/admin/videos?courseId[]=a"))).status).toBe(200);
  });
});

describe("bad input is a 4xx, never a 500", () => {
  it("rejects wrongly-typed fields on the public forms", async () => {
    const contact = await request(app).post("/api/contact").send({ name: true, email: "real.person@gmail.com", message: "hello there" });
    expect(contact.status).toBe(400);
    const application = await request(app).post("/api/applications").send({
      type: "course", refTitle: 12345, name: "Real Person", email: "real.person@gmail.com", phone: "+91 9876500000",
    });
    expect(application.status).toBe(400);
  });

  it("answers a malformed JSON body with 400", async () => {
    const res = await request(app).post("/api/contact").set("Content-Type", "application/json").send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not valid/i);
  });

  it("validates the admin service and course text fields", async () => {
    expect((await admin(request(app).post("/api/admin/services")).send({ title: 12345 })).status).toBe(400);
    expect((await admin(request(app).post("/api/admin/services")).send({ title: "Svc", points: "nope" })).status).toBe(400);
    expect((await admin(request(app).post("/api/admin/services")).send({ title: "Svc", order: 1e30 })).status).toBe(400);
    expect((await admin(request(app).put(`/api/admin/courses/${course._id}`)).send({ title: 12345 })).status).toBe(400);
    expect((await admin(request(app).post("/api/admin/courses")).send({ type: "internship", title: "T", desc: { a: 1 } })).status).toBe(400);
    expect((await admin(request(app).post("/api/admin/courses")).send({ type: "internship", title: "T", points: [1, 2] })).status).toBe(400);
  });

  it("still accepts valid service and course edits", async () => {
    const svc = await admin(request(app).post("/api/admin/services")).send({ title: "Svc", tag: "t", desc: "d", points: ["a", "b"], order: 3 });
    expect(svc.status).toBe(201);
    const edit = await admin(request(app).put(`/api/admin/courses/${course._id}`)).send({ title: "Renamed Course", tag: "Tag", points: ["x"] });
    expect(edit.status).toBe(200);
    expect(edit.body.course.title).toBe("Renamed Course");
  });

  it("validates admin grant and create-order ids", async () => {
    expect((await admin(request(app).post("/api/admin/enrollments")).send({ userId: "x", courseId: { a: 1 } })).status).toBe(400);
    expect((await admin(request(app).post("/api/admin/enrollments")).send({ email: ["a"], courseId: course._id })).status).toBe(400);
    const signup = await request(app).post("/api/auth/signup").send({ name: "Order Person", email: "order.person@example.com", phone: "9876500000", password: "a-real-password" });
    const asStudent = (req) => req.set("Authorization", `Bearer ${signup.body.token}`);
    expect((await asStudent(request(app).post("/api/payments/create-order")).send({ applicationId: 12345, courseSlug: course.slug })).status).toBe(400);
    expect((await asStudent(request(app).post("/api/payments/create-order")).send({ applicationId: "x", courseSlug: { a: 1 } })).status).toBe(400);
    expect((await request(app).post("/api/payments/create-order").send({ applicationId: "x", courseSlug: course.slug })).status).toBe(401);
  });

  // A database outage is not the caller's session ending: the client logs the user out on
  // every 401, so answering 401 here signed everyone out whenever the database blipped.
  it("answers 503, not 401, when the database is unreachable during the login check", async () => {
    const signup = await request(app).post("/api/auth/signup").send({ name: "Db Down", email: "dbdown@example.com", phone: "9876500000", password: "a-real-password" });
    const studentToken = signup.body.token;
    const down = () => Object.assign(new Error("Can't reach database server"), { name: "PrismaClientInitializationError", code: "P1001" });

    const spy = jest.spyOn(prisma.user, "findUnique").mockRejectedValueOnce(down());
    const student = await request(app).get("/api/me/enrollments").set("Authorization", `Bearer ${studentToken}`);
    expect(student.status).toBe(503);

    spy.mockRejectedValueOnce(down());
    const asAdmin = await admin(request(app).get("/api/admin/users"));
    expect(asAdmin.status).toBe(503);
    spy.mockRestore();

    // and the same tokens work again once the database is back
    expect((await request(app).get("/api/me/enrollments").set("Authorization", `Bearer ${studentToken}`)).status).toBe(200);
    expect((await admin(request(app).get("/api/admin/users"))).status).toBe(200);
    // a genuinely bad token is still a 401
    expect((await request(app).get("/api/me/enrollments").set("Authorization", "Bearer not-a-token")).status).toBe(401);
  });

  it("refuses an origin that is not allowed with 403", async () => {
    const res = await request(app).get("/api/courses").set("Origin", "https://evil.example.com");
    expect(res.status).toBe(403);
  });
});
