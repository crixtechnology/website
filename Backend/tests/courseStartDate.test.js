const crypto = require("crypto");
const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

jest.mock("../src/utils/receiptPdf", () => ({ buildReceiptPdfBuffer: jest.fn(() => Buffer.from("fake-pdf")) }));
jest.mock("../src/utils/razorpay", () => ({
  isLiveBlocked: false,
  razorpay: { orders: { create: jest.fn(async () => ({ id: `order_mock_${Math.random().toString(36).slice(2)}`, currency: "INR" })) } },
}));

const DAY = 24 * 60 * 60 * 1000;
let app, prisma, adminToken;

beforeAll(async () => {
  process.env.RAZORPAY_KEY_SECRET = "test-key-secret";
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "start-admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
const ymd = (d) => new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10); // date in India

async function createCourse(startsAt) {
  const created = await authed(request(app).post("/api/admin/courses"), adminToken).send({
    type: "course", title: `Starts later ${Date.now()}-${Math.random()}`, tiers: [{ tier: "basic", price: 1000 }], durationDays: 30, startsAt,
  });
  expect(created.status).toBe(201);
  const opened = await authed(request(app).put(`/api/admin/courses/${created.body.course._id}`), adminToken).send({ status: "open" });
  return opened.body.course;
}

async function buy(course, email) {
  const signup = await request(app).post("/api/auth/signup").send({ name: "Early Bird", email, phone: "9876500000", password: "a-real-password" });
  const token = signup.body.token;
  const appRes = await authed(request(app).post("/api/applications"), token).send({
    type: "course", refTitle: course.title, courseSlug: course.slug, name: "Early Bird", email, phone: "9876500000",
  });
  const order = await authed(request(app).post("/api/payments/create-order"), token).send({ applicationId: appRes.body.application._id, courseSlug: course.slug, tier: "basic" });
  const paymentId = `pay_${Math.random().toString(36).slice(2)}`;
  const signature = crypto.createHmac("sha256", "test-key-secret").update(`${order.body.orderId}|${paymentId}`).digest("hex");
  const verify = await request(app).post("/api/payments/verify").send({ razorpay_order_id: order.body.orderId, razorpay_payment_id: paymentId, razorpay_signature: signature });
  expect(verify.body.enrolled).toBe(true);
  return { token, userId: signup.body.user.id };
}

describe("course start date", () => {
  it("lets a student buy before the start and get the receipt, but locks the content until it starts", async () => {
    const startDay = ymd(new Date(Date.now() + 10 * DAY));
    const course = await createCourse(startDay);
    expect(new Date(course.startsAt).toISOString()).toBe(new Date(`${startDay}T00:00:00+05:30`).toISOString());

    const { token, userId } = await buy(course, "early-bird@example.com");

    // Receipt straight away.
    const receipts = await authed(request(app).get("/api/me/receipts"), token);
    expect(receipts.body.receipts).toHaveLength(1);

    // Access period counts from the start date, not the purchase.
    const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: course._id } } });
    expect(enrollment.startDate.getTime()).toBe(new Date(course.startsAt).getTime());
    expect(enrollment.endDate.getTime()).toBe(new Date(course.startsAt).getTime() + 30 * DAY);

    // Content locked, with the start date to show.
    const learn = await authed(request(app).get(`/api/learn/${course.slug}`), token);
    expect(learn.status).toBe(403);
    expect(learn.body).toMatchObject({ code: "NOT_STARTED" });
    expect(learn.body.error).toMatch(/starts on/);
    const videos = await authed(request(app).get(`/api/courses/${course._id}/videos`), token);
    expect(videos.status).toBe(403);
    expect(videos.body.code).toBe("NOT_STARTED");

    // Buying it again is still refused — they already hold it.
    const again = await authed(request(app).post("/api/payments/quote"), token).send({ courseSlug: course.slug, tier: "basic" });
    expect(again.status).toBe(400);

    // Admins can always open it.
    expect((await authed(request(app).get(`/api/learn/${course.slug}`), adminToken)).status).toBe(200);
  });

  it("moves waiting students when the start is postponed, and opens up once the start date is cleared", async () => {
    const course = await createCourse(ymd(new Date(Date.now() + 5 * DAY)));
    const { token, userId } = await buy(course, "postponed@example.com");

    const later = ymd(new Date(Date.now() + 20 * DAY));
    await authed(request(app).put(`/api/admin/courses/${course._id}`), adminToken).send({ startsAt: later });
    const moved = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: course._id } } });
    expect(moved.startDate.toISOString()).toBe(new Date(`${later}T00:00:00+05:30`).toISOString());
    expect(moved.endDate.getTime()).toBe(moved.startDate.getTime() + 30 * DAY);

    const cleared = await authed(request(app).put(`/api/admin/courses/${course._id}`), adminToken).send({ startsAt: "" });
    expect(cleared.body.course.startsAt).toBeNull();
    expect((await authed(request(app).get(`/api/learn/${course.slug}`), token)).status).toBe(200);
    const nowStarted = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: course._id } } });
    expect(nowStarted.startDate.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("gives access straight away when there's no start date, and rejects a bad one", async () => {
    const course = await createCourse(undefined);
    const { token } = await buy(course, "no-start@example.com");
    expect((await authed(request(app).get(`/api/learn/${course.slug}`), token)).status).toBe(200);

    const bad = await authed(request(app).put(`/api/admin/courses/${course._id}`), adminToken).send({ startsAt: "not-a-date" });
    expect(bad.status).toBe(400);
  });
});
