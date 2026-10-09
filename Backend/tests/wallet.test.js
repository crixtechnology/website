const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// Same stand-ins the referral/payment suites use: no PDF work, no real mail, no
// live Razorpay call, and no rate limiting on the dozens of requests made here.
jest.mock("../src/utils/rateLimit", () => ({ publicWriteLimiter: (req, res, next) => next() }));
jest.mock("../src/utils/mailer", () => ({
  sendApplicationEmail: jest.fn(async () => ({})),
  sendAccountExistsEmail: jest.fn(async () => ({})),
  sendReceiptEmail: jest.fn(async () => ({})),
  sendContactEmail: jest.fn(async () => ({})),
}));
jest.mock("../src/utils/receiptPdf", () => ({ buildReceiptPdfBuffer: jest.fn(() => Buffer.from("fake-pdf")) }));
jest.mock("../src/utils/razorpay", () => ({
  isLiveBlocked: false,
  razorpay: { orders: { create: jest.fn(async () => ({ id: `order_w_${Math.random().toString(36).slice(2)}`, currency: "INR" })) } },
}));
const { razorpay } = require("../src/utils/razorpay");

let app, prisma, adminToken, adminId;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.com", passwordHash: "x", role: "admin" } });
  adminId = admin.id;
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
let seq = 0;

async function signup(label) {
  const email = `${label}${++seq}@example.com`;
  const res = await request(app).post("/api/auth/signup").send({
    name: "Student Person", email, phone: "9876500000", password: "a-real-password",
  });
  expect(res.status).toBe(201);
  return { id: res.body.user.id, email, token: res.body.token };
}

async function openCourse(tiers, title) {
  const create = await authed(request(app).post("/api/admin/courses"), adminToken).send({
    type: "course", title: title || `Wallet Course ${Date.now()}-${Math.random()}`,
    tiers: tiers.map(([tier, price]) => ({ tier, price })),
  });
  const open = await authed(request(app).put(`/api/admin/courses/${create.body.course._id}`), adminToken).send({ status: "open" });
  return open.body.course;
}

const walletOf = async (student) => (await authed(request(app).get("/api/me/wallet"), student.token)).body.wallet;
const grant = (student, rupees, note) => authed(request(app).post(`/api/admin/users/${student.id}/wallet`), adminToken).send({ rupees, note });
const quote = (student, course, extra = {}) => authed(request(app).post("/api/payments/quote"), student.token).send({ courseSlug: course.slug, tier: "basic", ...extra });

async function application(student, course) {
  const res = await authed(request(app).post("/api/applications"), student.token).send({
    type: "course", refTitle: course.title, courseSlug: course.slug, tier: "basic",
    name: "Student Person", email: student.email, phone: "9876500000",
  });
  expect(res.status).toBeLessThan(300);
  return res.body.application._id;
}
const payWallet = (student, course, applicationId, extra = {}) =>
  authed(request(app).post("/api/payments/pay-with-wallet"), student.token).send({ applicationId, courseSlug: course.slug, tier: "basic", ...extra });

describe("the wallet", () => {
  it("starts empty and needs a login", async () => {
    expect((await request(app).get("/api/me/wallet")).status).toBe(401);
    const student = await signup("empty");
    expect(await walletOf(student)).toMatchObject({ balance: 0, available: 0, earned: 0, spent: 0, entries: [] });
  });

  it("lets an admin add credit, shows it with its note, and only admins can", async () => {
    const student = await signup("grant");
    const res = await grant(student, 750, "Welcome gift");
    expect(res.status).toBe(201);
    expect(res.body.wallet).toMatchObject({ balance: 750, earned: 750 });

    const wallet = await walletOf(student);
    expect(wallet.entries).toHaveLength(1);
    expect(wallet.entries[0]).toMatchObject({ amount: 750, label: "Welcome gift" });

    const asStudent = await authed(request(app).post(`/api/admin/users/${student.id}/wallet`), student.token).send({ rupees: 100 });
    expect(asStudent.status).toBe(403);
    expect((await walletOf(student)).balance).toBe(750);
  });

  it("rejects amounts that make no sense, and unknown accounts", async () => {
    const student = await signup("badgrant");
    for (const bad of [0, 1.5, "abc", null, 100001, -100001]) {
      expect((await grant(student, bad)).status).toBe(400);
    }
    expect((await grant(student, 10, { not: "text" })).status).toBe(400);
    expect((await authed(request(app).post("/api/admin/users/no-such-user/wallet"), adminToken).send({ rupees: 10 })).status).toBe(404);
    expect((await walletOf(student)).balance).toBe(0);
  });

  it("lets an admin take credit back, but never below what the student has", async () => {
    const student = await signup("deduct");
    await grant(student, 500);
    const tooMuch = await grant(student, -501);
    expect(tooMuch.status).toBe(400);
    expect((await grant(student, -200, "Correction")).status).toBe(201);
    const wallet = await walletOf(student);
    expect(wallet.balance).toBe(300);
    expect(wallet.entries[0]).toMatchObject({ amount: -200, label: "Correction" });
  });

  it("does not let two simultaneous removals overdraw the wallet", async () => {
    const student = await signup("race");
    await grant(student, 500);
    const results = await Promise.all([grant(student, -400), grant(student, -400)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await walletOf(student)).balance).toBe(100);
  });
});

describe("paying for a course from the wallet", () => {
  it("says on the quote whether the wallet covers the whole price", async () => {
    const course = await openCourse([["basic", 1000]]);
    const student = await signup("quote");
    expect((await quote(student, course)).body).toMatchObject({ walletCoversAll: false, walletPayable: 1000, payable: 1000 });

    await grant(student, 400);
    expect((await quote(student, course)).body).toMatchObject({ walletCoversAll: false, creditApplied: 400, payable: 600 });

    await grant(student, 600);
    // Credit applied as a discount still leaves ₹1 for Razorpay; paying in full is the wallet's own button.
    expect((await quote(student, course)).body).toMatchObject({ walletCoversAll: true, walletPayable: 1000, creditApplied: 999, payable: 1 });
  });

  it("buys the course with no Razorpay order, spends exactly the price and issues a wallet receipt", async () => {
    const course = await openCourse([["basic", 1000]], "Wallet Bought Course");
    const student = await signup("buyer");
    await grant(student, 1500);
    razorpay.orders.create.mockClear();

    const res = await payWallet(student, course, await application(student, course));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, enrolled: true, courseSlug: course.slug });
    expect(razorpay.orders.create).not.toHaveBeenCalled();

    // Access is granted...
    const enrollments = await authed(request(app).get("/api/me/enrollments"), student.token);
    expect(JSON.stringify(enrollments.body)).toContain(course.slug);

    // ...the credit is spent, once, and named in the history...
    const wallet = await walletOf(student);
    expect(wallet).toMatchObject({ balance: 500, spent: 1000, earned: 1500 });
    expect(wallet.entries[0]).toMatchObject({ amount: -1000, kind: "redeemed", label: "Spent on Wallet Bought Course" });

    // ...and the receipt reads as a wallet payment for the full price, with no Razorpay id.
    const receipts = (await authed(request(app).get("/api/me/receipts"), student.token)).body.receipts;
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ totalPaid: 1000, basePrice: 1000, discountAmount: 0, paymentMode: "Wallet credit", razorpay_payment_id: null });
  });

  it("refuses when the wallet falls short, and charges nothing", async () => {
    const course = await openCourse([["basic", 1000]]);
    const student = await signup("short");
    await grant(student, 999);
    const res = await payWallet(student, course, await application(student, course));
    expect(res.status).toBe(400);
    expect((await walletOf(student)).balance).toBe(999);
    const enrollments = await authed(request(app).get("/api/me/enrollments"), student.token);
    expect(JSON.stringify(enrollments.body)).not.toContain(course.slug);
  });

  it("will not spend credit that an open Razorpay checkout has already claimed", async () => {
    const course = await openCourse([["basic", 1000]]);
    const other = await openCourse([["basic", 1000]]);
    const student = await signup("claimed");
    await grant(student, 1000);
    // Starting a checkout for another course reserves 999 of the 1000.
    const start = await authed(request(app).post("/api/payments/create-order"), student.token).send({
      applicationId: await application(student, other), courseSlug: other.slug, tier: "basic",
    });
    expect(start.status).toBe(201);
    const res = await payWallet(student, course, await application(student, course));
    expect(res.status).toBe(400);
    expect((await walletOf(student)).balance).toBe(1000);
  });

  it("spends the credit only once when the request is sent twice at the same moment", async () => {
    const course = await openCourse([["basic", 1000]]);
    const student = await signup("double");
    await grant(student, 2500);
    // Two tabs, each with its own application — the wallet could pay for both.
    const [first, second] = [await application(student, course), await application(student, course)];
    const results = await Promise.all([payWallet(student, course, first), payWallet(student, course, second)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await walletOf(student)).balance).toBe(1500);
    expect((await authed(request(app).get("/api/me/receipts"), student.token)).body.receipts).toHaveLength(1);
  });

  it("will not take someone else's application, or a course the student already has", async () => {
    const course = await openCourse([["basic", 500]]);
    const owner = await signup("owner");
    const thief = await signup("thief");
    await grant(thief, 5000);
    const ownersApplication = await application(owner, course);
    expect((await payWallet(thief, course, ownersApplication)).status).toBe(404);
    expect((await walletOf(thief)).balance).toBe(5000);

    expect((await payWallet(thief, course, await application(thief, course))).status).toBe(201);
    const again = await payWallet(thief, course, await application(thief, course));
    expect(again.status).toBe(400);
    expect((await walletOf(thief)).balance).toBe(4500);
  });

  it("applies an offer code before the wallet, so the wallet pays the reduced price", async () => {
    const course = await openCourse([["basic", 1000]]);
    const coupon = await authed(request(app).post("/api/admin/coupons"), adminToken).send({
      code: "WALLET20", discountType: "percent", discountValue: 20, appliesTo: "all",
    });
    expect(coupon.status).toBeLessThan(300);
    const student = await signup("coupon");
    await grant(student, 800);
    expect((await quote(student, course, { couponCode: "WALLET20" })).body).toMatchObject({ walletCoversAll: true, walletPayable: 800 });

    const res = await payWallet(student, course, await application(student, course), { couponCode: "WALLET20" });
    expect(res.status).toBe(201);
    expect((await walletOf(student)).balance).toBe(0);
    const receipt = (await authed(request(app).get("/api/me/receipts"), student.token)).body.receipts[0];
    expect(receipt).toMatchObject({ basePrice: 1000, totalPaid: 800, discountAmount: 200, paymentMode: "Wallet credit" });
  });

  it("counts a wallet purchase as paid when pricing a later plan upgrade", async () => {
    const course = await openCourse([["basic", 1000], ["plus", 1500]]);
    const student = await signup("upgrade");
    await grant(student, 1000);
    expect((await payWallet(student, course, await application(student, course))).status).toBe(201);

    const options = await authed(request(app).get(`/api/payments/upgrade-options/${course.slug}`), student.token);
    expect(options.body.options).toEqual([{ tier: "plus", planPrice: 1500, due: 500 }]);
  });

  it("can't be confirmed through the Razorpay verify endpoint", async () => {
    const course = await openCourse([["basic", 300]]);
    const student = await signup("verify");
    await grant(student, 300);
    await payWallet(student, course, await application(student, course));
    const payment = await prisma.payment.findFirst({ where: { application: { userId: student.id } } });
    expect(payment.razorpayOrderId.startsWith("wallet_")).toBe(true);
    const res = await request(app).post("/api/payments/verify").send({
      razorpay_order_id: payment.razorpayOrderId, razorpay_payment_id: "pay_x", razorpay_signature: "0".repeat(64),
    });
    expect(res.status).toBe(400);
  });
});

describe("the admin's view", () => {
  it("shows a student's wallet on their detail page", async () => {
    const student = await signup("adminview");
    await grant(student, 250, "Contest prize");
    const res = await authed(request(app).get(`/api/admin/users/${student.id}`), adminToken);
    expect(res.status).toBe(200);
    expect(res.body.wallet).toMatchObject({ balance: 250 });
    expect(res.body.wallet.entries[0]).toMatchObject({ amount: 250, label: "Contest prize" });
    expect(adminId).toBeTruthy();
  });
});
