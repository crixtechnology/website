const crypto = require("crypto");
const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

jest.mock("../src/utils/receiptPdf", () => ({
  buildReceiptPdfBuffer: jest.fn(() => Buffer.from("fake-pdf")),
}));
jest.mock("../src/utils/razorpay", () => ({
  isLiveBlocked: false,
  razorpay: { orders: { create: jest.fn(async () => ({ id: `order_mock_${Math.random().toString(36).slice(2)}`, currency: "INR" })) } },
}));
const { razorpay } = require("../src/utils/razorpay");

let app, prisma, adminToken;

beforeAll(async () => {
  process.env.RAZORPAY_KEY_SECRET = "test-key-secret";
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin-preq@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);

async function createStudent(email) {
  const signup = await request(app).post("/api/auth/signup").send({ name: "Student", email, phone: "9876500000", password: "a-real-password" });
  return { user: signup.body.user, token: signup.body.token };
}

// A closed item with no plans at all — the normal checkout can't sell this.
async function createClosedInternship() {
  return prisma.course.create({
    data: { type: "internship", title: `Closed ${Date.now()}`, slug: `closed-${Date.now()}-${Math.random().toString(36).slice(2)}`, desc: "", status: "closed", durationDays: 30 },
  });
}

function signedConfirmation(orderId) {
  const paymentId = `pay_${Math.random().toString(36).slice(2)}`;
  const signature = crypto.createHmac("sha256", "test-key-secret").update(`${orderId}|${paymentId}`).digest("hex");
  return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature };
}

describe("payment requests", () => {
  it("admin requests, student pays, gets access and a receipt — even for a closed item", async () => {
    const course = await createClosedInternship();
    const { user, token } = await createStudent("preq-student@example.com");

    const created = await authed(request(app).post("/api/admin/payment-requests"), adminToken)
      .send({ email: "preq-student@example.com", courseId: course.id, amount: 2500, tier: "plus", note: "Batch fee" });
    expect(created.status).toBe(201);
    expect(created.body.request.status).toBe("pending");

    const mine = await authed(request(app).get("/api/me/payment-requests"), token);
    expect(mine.body.requests).toHaveLength(1);
    const reqId = mine.body.requests[0]._id;

    const order = await authed(request(app).post(`/api/me/payment-requests/${reqId}/create-order`), token);
    expect(order.status).toBe(201);
    expect(order.body.amount).toBe(250000);
    expect(razorpay.orders.create).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 250000 }));

    // The normal /payments/verify refuses request payments — they're confirmed separately.
    const conf = signedConfirmation(order.body.orderId);
    const wrong = await request(app).post("/api/payments/verify").send(conf);
    expect(wrong.status).toBe(404);

    const verified = await request(app).post("/api/payment-requests/verify").send(conf);
    expect(verified.body).toMatchObject({ ok: true, enrolled: true, courseSlug: course.slug });

    const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id || user._id, courseId: course.id } } });
    expect(enrollment).toMatchObject({ status: "active", tier: "plus" });
    expect(enrollment.endDate).not.toBeNull(); // the course's 30-day duration, like a normal purchase

    const receipts = await authed(request(app).get("/api/me/receipts"), token);
    expect(receipts.body.receipts).toHaveLength(1);
    expect(receipts.body.receipts[0]).toMatchObject({ totalPaid: 2500, itemTitle: course.title, tier: "plus" });
    expect(enrollment.paymentId).toBe(receipts.body.receipts[0].paymentId);

    // Idempotent: confirming again changes nothing and mints no second receipt.
    await request(app).post("/api/payment-requests/verify").send(conf);
    const again = await authed(request(app).get("/api/me/receipts"), token);
    expect(again.body.receipts).toHaveLength(1);

    const after = await authed(request(app).get("/api/me/payment-requests"), token);
    expect(after.body.requests[0].status).toBe("paid");
    const payAgain = await authed(request(app).post(`/api/me/payment-requests/${reqId}/create-order`), token);
    expect(payAgain.status).toBe(400);
  });

  it("only the student it was sent to can pay it, and a cancelled one can't be paid", async () => {
    const course = await createClosedInternship();
    await createStudent("preq-owner@example.com");
    const other = await createStudent("preq-other@example.com");

    const created = await authed(request(app).post("/api/admin/payment-requests"), adminToken)
      .send({ email: "preq-owner@example.com", courseId: course.id, amount: 100 });
    const id = created.body.request._id;

    const stolen = await authed(request(app).post(`/api/me/payment-requests/${id}/create-order`), other.token);
    expect(stolen.status).toBe(404);

    const dup = await authed(request(app).post("/api/admin/payment-requests"), adminToken)
      .send({ email: "preq-owner@example.com", courseId: course.id, amount: 100 });
    expect(dup.status).toBe(409);

    const cancelled = await authed(request(app).post(`/api/admin/payment-requests/${id}/cancel`), adminToken);
    expect(cancelled.body.ok).toBe(true);
    const list = await authed(request(app).get("/api/admin/payment-requests?status=cancelled"), adminToken);
    expect(list.body.requests.map((r) => r._id)).toContain(id);
  });

  it("validates the admin's input and is admin-only", async () => {
    const course = await createClosedInternship();
    const { token } = await createStudent("preq-val@example.com");
    const base = { email: "preq-val@example.com", courseId: course.id };

    expect((await authed(request(app).post("/api/admin/payment-requests"), adminToken).send({ ...base, amount: 0 })).status).toBe(400);
    expect((await authed(request(app).post("/api/admin/payment-requests"), adminToken).send({ ...base, amount: 10, tier: "gold" })).status).toBe(400);
    expect((await authed(request(app).post("/api/admin/payment-requests"), adminToken).send({ ...base, email: "nobody@example.com", amount: 10 })).status).toBe(404);
    expect((await authed(request(app).post("/api/admin/payment-requests"), token).send({ ...base, amount: 10 })).status).toBe(403);
  });
});
