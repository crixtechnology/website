const request = require("supertest");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

let app, prisma;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
}, 60000);
afterAll(async () => { await teardownTestDb(); });

describe("admin hardening", () => {
  it("gives an admin a 12-hour token and a student a 7-day one", async () => {
    await prisma.user.create({ data: { name: "Admin", email: "hard-admin@test.com", passwordHash: await bcrypt.hash("admin-password-1", 10), role: "admin" } });
    const admin = await request(app).post("/api/auth/login").send({ email: "hard-admin@test.com", password: "admin-password-1" });
    expect(admin.body.ok).toBe(true);
    const a = jwt.decode(admin.body.token);
    expect(a.exp - a.iat).toBe(12 * 60 * 60);

    const signup = await request(app).post("/api/auth/signup").send({ name: "Student", email: "hard-student@example.com", phone: "9876500000", password: "a-real-password" });
    const s = jwt.decode(signup.body.token);
    expect(s.exp - s.iat).toBe(7 * 24 * 60 * 60);
  });

  it("doesn't let a token that merely claims 'admin' read someone else's receipt", async () => {
    const owner = await prisma.user.create({ data: { name: "Owner", email: "hard-owner@test.com", passwordHash: "x" } });
    const payment = await prisma.payment.create({
      data: { razorpayOrderId: "order_hard_1", amount: 10000, status: "paid", userId: owner.id, receiptNumber: "CRX-TEST-HARD-1" },
    });
    // A validly signed token for an account that isn't really an admin, with
    // role "admin" written into it: the database says otherwise, so no.
    const other = await prisma.user.create({ data: { name: "Other", email: "hard-other@test.com", passwordHash: "x" } });
    const fake = signToken({ sub: other.id, role: "admin", email: other.email }, { expiresIn: "1h" });
    const res = await request(app).get(`/api/receipts/${payment.id}`).set("Authorization", `Bearer ${fake}`);
    expect(res.status).toBe(403);

    // A real admin still can.
    const realAdmin = await prisma.user.create({ data: { name: "Real", email: "hard-real@test.com", passwordHash: "x", role: "admin" } });
    const ok = await request(app).get(`/api/receipts/${payment.id}`)
      .set("Authorization", `Bearer ${signToken({ sub: realAdmin.id, role: "admin", email: realAdmin.email }, { expiresIn: "1h" })}`);
    expect(ok.status).toBe(200);
  });
});
