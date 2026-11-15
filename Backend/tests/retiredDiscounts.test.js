const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { newStudent } = require("./helpers/newStudent");
const { signToken } = require("../src/utils/jwt");

// The referral programme and admin offer codes were retired: their endpoints are
// gone, and a referral code sent with a new account (an old page or link) is
// ignored rather than attaching a referral.
jest.mock("../src/utils/rateLimit", () => ({ publicWriteLimiter: (req, res, next) => next() }));
jest.mock("../src/utils/mailer", () => ({
  sendWelcomeEmail: jest.fn(async () => ({})),
  sendWalletCreditEmail: jest.fn(async () => ({})),
  sendSignupBonusEmail: jest.fn(async () => ({})),
}));

let app, prisma, adminToken;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@retired.test", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const asAdmin = (req) => req.set("Authorization", `Bearer ${adminToken}`);

it("no longer serves the referral or offer-code endpoints", async () => {
  const student = await newStudent(app, { email: "old-links@example.com" });
  const asStudent = (req) => req.set("Authorization", `Bearer ${student.token}`);
  expect((await request(app).get("/api/referrals/check?code=CRIXABC123")).status).toBe(404);
  expect((await asStudent(request(app).get("/api/me/referral"))).status).toBe(404);
  expect((await asStudent(request(app).post("/api/referrals/apply")).send({ code: "CRIXABC123" })).status).toBe(404);
  expect((await asAdmin(request(app).get("/api/admin/referrals"))).status).toBe(404);
  expect((await asAdmin(request(app).get("/api/admin/coupons"))).status).toBe(404);
  expect((await asAdmin(request(app).post("/api/admin/coupons")).send({ code: "SAVE10", discountType: "percent", discountValue: 10 })).status).toBe(404);
});

it("ignores a referral code sent with a new account", async () => {
  const referrer = await prisma.user.create({ data: { name: "Ref", email: "ref@retired.test", passwordHash: "x", role: "student", referralCode: "CRIXREF234" } });
  const created = await request(app).post("/api/auth/login")
    .send({ email: "joiner@example.com", password: "a-real-password", createAccount: true, ageConfirmed: true, referralCode: "CRIXREF234" });
  expect(created.status).toBeLessThan(300);
  expect(await prisma.referral.count({ where: { referrerId: referrer.id } })).toBe(0);
});
