const crypto = require("crypto");
const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { newStudent } = require("./helpers/newStudent");
const { signToken } = require("../src/utils/jwt");

// Training + Internship is paid through payment requests, so a request is
// priced like a checkout: offer code, referral welcome discount and wallet
// credit come off it, the wallet can pay it in full, and the first real-money
// payment rewards the referrer.

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
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin-preq-disc@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
const idOf = (user) => user.id || user._id;
let n = 0;

async function createStudent(tag) {
  n += 1;
  const email = `preq-disc-${tag}-${n}@example.com`;
  const signup = await newStudent(app, { name: "Student", email, phone: `98765${String(10000 + n).slice(-5)}`, password: "a-real-password" });
  return { user: signup.body.user, token: signup.body.token, email };
}

async function createTrack() {
  n += 1;
  return prisma.course.create({
    data: { type: "internship", title: `Track ${n}`, slug: `track-disc-${n}-${Date.now()}`, desc: "", status: "open", durationDays: 30 },
  });
}

// The admin asks `student` to pay `rupees` for `course`; returns the request id.
async function requestPayment(student, course, rupees) {
  const created = await authed(request(app).post("/api/admin/payment-requests"), adminToken)
    .send({ email: student.email, courseId: course.id, amount: rupees });
  expect(created.status).toBe(201);
  return created.body.request._id;
}

const giveCredit = (user, rupees) => prisma.creditEntry.create({
  data: { userId: idOf(user), amount: rupees * 100, kind: "adjustment", note: "test credit" },
});
const balanceOf = async (user) => {
  const sum = await prisma.creditEntry.aggregate({ where: { userId: idOf(user) }, _sum: { amount: true } });
  return (sum._sum.amount || 0) / 100;
};

function signedConfirmation(orderId) {
  const paymentId = `pay_${Math.random().toString(36).slice(2)}`;
  const signature = crypto.createHmac("sha256", "test-key-secret").update(`${orderId}|${paymentId}`).digest("hex");
  return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature };
}

describe("paying a payment request with discounts and credit", () => {
  it("takes wallet credit and an offer code off the requested amount, and spends the credit once paid", async () => {
    const course = await createTrack();
    const student = await createStudent("credit");
    await giveCredit(student.user, 300);
    const before = await balanceOf(student.user);
    await prisma.coupon.create({ data: { code: `TRAIN${n}`, discountType: "percent", discountValue: 10, appliesTo: "internship" } });
    const id = await requestPayment(student, course, 2000);

    const quote = await authed(request(app).post(`/api/me/payment-requests/${id}/quote`), student.token).send({ couponCode: `train${n}` });
    expect(quote.body).toMatchObject({ ok: true, planPrice: 2000, couponApplied: true, couponDiscount: 200, creditApplied: 300, payable: 1500 });

    const order = await authed(request(app).post(`/api/me/payment-requests/${id}/create-order`), student.token)
      .send({ acceptTerms: true, couponCode: `TRAIN${n}` });
    expect(order.status).toBe(201);
    expect(order.body.amount).toBe(150000);
    expect(razorpay.orders.create).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 150000 }));

    const verified = await request(app).post("/api/payment-requests/verify").send(signedConfirmation(order.body.orderId));
    expect(verified.body).toMatchObject({ ok: true, enrolled: true });
    expect(await balanceOf(student.user)).toBe(before - 300);

    const receipts = await authed(request(app).get("/api/me/receipts"), student.token);
    expect(receipts.body.receipts[0]).toMatchObject({ totalPaid: 1500, basePrice: 2000, discountAmount: 500 });
  });

  it("refuses an order with an offer code that doesn't work, rather than charging a different price", async () => {
    const course = await createTrack();
    const student = await createStudent("badcode");
    const id = await requestPayment(student, course, 1000);
    const quote = await authed(request(app).post(`/api/me/payment-requests/${id}/quote`), student.token).send({ couponCode: "NOSUCHCODE" });
    expect(quote.body).toMatchObject({ ok: true, couponApplied: false, payable: 1000 });
    expect(quote.body.couponError).toBeTruthy();
    const order = await authed(request(app).post(`/api/me/payment-requests/${id}/create-order`), student.token)
      .send({ acceptTerms: true, couponCode: "NOSUCHCODE" });
    expect(order.status).toBe(400);
  });

  it("gives a referred student their welcome discount and rewards the referrer when they pay", async () => {
    const course = await createTrack();
    const referrer = await createStudent("referrer");
    const friend = await createStudent("friend");
    const referrerBefore = await balanceOf(referrer.user);
    await prisma.referral.create({
      data: { referrerId: idOf(referrer.user), refereeId: idOf(friend.user), refereeDiscountPercent: 10, rewardAmount: 20000 },
    });
    const id = await requestPayment(friend, course, 1000);

    const quote = await authed(request(app).post(`/api/me/payment-requests/${id}/quote`), friend.token).send({});
    expect(quote.body).toMatchObject({ referralPercent: 10, referralDiscount: 100, payable: 900 });

    const order = await authed(request(app).post(`/api/me/payment-requests/${id}/create-order`), friend.token).send({ acceptTerms: true });
    expect(order.body.amount).toBe(90000);
    await request(app).post("/api/payment-requests/verify").send(signedConfirmation(order.body.orderId));

    const referral = await prisma.referral.findUnique({ where: { refereeId: idOf(friend.user) } });
    expect(referral.status).toBe("rewarded");
    expect(await balanceOf(referrer.user)).toBe(referrerBefore + 200);
  });

  it("lets the wallet pay a request in full, once", async () => {
    const course = await createTrack();
    const student = await createStudent("wallet");
    await giveCredit(student.user, 5000);
    const before = await balanceOf(student.user);
    const id = await requestPayment(student, course, 800);

    const quote = await authed(request(app).post(`/api/me/payment-requests/${id}/quote`), student.token).send({});
    expect(quote.body).toMatchObject({ walletCoversAll: true, walletPayable: 800 });

    const noTerms = await authed(request(app).post(`/api/me/payment-requests/${id}/pay-with-wallet`), student.token).send({});
    expect(noTerms.status).toBe(400);

    const paid = await authed(request(app).post(`/api/me/payment-requests/${id}/pay-with-wallet`), student.token).send({ acceptTerms: true });
    expect(paid.status).toBe(201);
    expect(paid.body).toMatchObject({ ok: true, enrolled: true, courseSlug: course.slug });
    expect(await balanceOf(student.user)).toBe(before - 800);

    const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: idOf(student.user), courseId: course.id } } });
    expect(enrollment.status).toBe("active");
    const mine = await authed(request(app).get("/api/me/payment-requests"), student.token);
    expect(mine.body.requests.find((r) => r._id === id).status).toBe("paid");

    // A second click can't spend the credit again.
    const again = await authed(request(app).post(`/api/me/payment-requests/${id}/pay-with-wallet`), student.token).send({ acceptTerms: true });
    expect(again.status).toBe(400);
    expect(await balanceOf(student.user)).toBe(before - 800);
  });

  it("won't pay from a wallet that falls short", async () => {
    const course = await createTrack();
    const student = await createStudent("short");
    const id = await requestPayment(student, course, 999999);
    const paid = await authed(request(app).post(`/api/me/payment-requests/${id}/pay-with-wallet`), student.token).send({ acceptTerms: true });
    expect(paid.status).toBe(400);
  });

  it("charges exactly the amount when the admin switched discounts off", async () => {
    const course = await createTrack();
    const student = await createStudent("nodisc");
    await giveCredit(student.user, 5000);
    await prisma.coupon.create({ data: { code: `NODISC${n}`, discountType: "percent", discountValue: 50 } });
    const created = await authed(request(app).post("/api/admin/payment-requests"), adminToken)
      .send({ email: student.email, courseId: course.id, amount: 1200, allowDiscounts: false });
    expect(created.body.request.allowDiscounts).toBe(false);
    const id = created.body.request._id;

    const quote = await authed(request(app).post(`/api/me/payment-requests/${id}/quote`), student.token).send({ couponCode: `NODISC${n}` });
    expect(quote.body).toMatchObject({ discountsAllowed: false, couponApplied: false, creditApplied: 0, payable: 1200, walletCoversAll: false });
    expect(quote.body.couponError).toMatch(/can't be used/);

    const withCode = await authed(request(app).post(`/api/me/payment-requests/${id}/create-order`), student.token)
      .send({ acceptTerms: true, couponCode: `NODISC${n}` });
    expect(withCode.status).toBe(400);
    const wallet = await authed(request(app).post(`/api/me/payment-requests/${id}/pay-with-wallet`), student.token).send({ acceptTerms: true });
    expect(wallet.status).toBe(400);
    const order = await authed(request(app).post(`/api/me/payment-requests/${id}/create-order`), student.token).send({ acceptTerms: true });
    expect(order.body.amount).toBe(120000);

    const bad = await authed(request(app).post("/api/admin/payment-requests"), adminToken)
      .send({ email: student.email, courseId: (await createTrack()).id, amount: 100, allowDiscounts: "no" });
    expect(bad.status).toBe(400);
  });

  it("only prices the caller's own request", async () => {
    const course = await createTrack();
    const owner = await createStudent("owner");
    const other = await createStudent("other");
    const id = await requestPayment(owner, course, 500);
    const quote = await authed(request(app).post(`/api/me/payment-requests/${id}/quote`), other.token).send({});
    expect(quote.status).toBe(404);
  });
});

describe("applying for Training + Internship", () => {
  it("needs an account, and saves the account's own email", async () => {
    const course = await createTrack();
    const guest = await request(app).post("/api/applications").send({
      type: "internship", refTitle: course.title, courseSlug: course.slug, name: "Guest Person", email: "guest.person@gmail.com", phone: "9876500000",
    });
    expect(guest.status).toBe(401);
    expect(guest.body.code).toBe("LOGIN_REQUIRED");

    const student = await createStudent("applicant");
    const applied = await authed(request(app).post("/api/applications"), student.token).send({
      type: "internship", refTitle: course.title, courseSlug: course.slug, name: "Real Student", email: "someone.else@gmail.com", phone: "9876500000",
    });
    expect(applied.status).toBe(201);
    const row = await prisma.application.findUnique({ where: { id: applied.body.application._id } });
    expect(row.email).toBe(student.email);
    expect(row.userId).toBe(idOf(student.user));
  });

  it("refuses a course request — courses were dropped", async () => {
    const guest = await request(app).post("/api/applications").send({
      type: "course", refTitle: "Old course", name: "Guest Person", email: "guest.person@gmail.com", phone: "9876500000",
    });
    expect(guest.status).toBe(400);
    expect(guest.body.error).toMatch(/no longer offered/);
  });
});

describe("an old course a student was enrolled in", () => {
  it("is no longer listed, opened or played — courses were dropped", async () => {
    const student = await createStudent("oldcourse");
    const old = await prisma.course.create({ data: { type: "course", title: "Old test course", slug: `old-test-course-${Date.now()}`, desc: "", status: "open" } });
    await prisma.enrollment.create({ data: { userId: idOf(student.user), courseId: old.id, status: "active" } });
    const mine = await authed(request(app).get("/api/me/enrollments"), student.token);
    expect(mine.body.enrollments.map((e) => e.course && e.course._id)).not.toContain(old.id);
    expect((await authed(request(app).get(`/api/learn/${old.slug}`), student.token)).status).toBe(404);
    expect((await authed(request(app).get(`/api/courses/${old.id}/videos`), student.token)).status).toBe(404);
    // Admins can't open it either, and can't send a payment request for it.
    expect((await authed(request(app).get(`/api/learn/${old.slug}`), adminToken)).status).toBe(404);
    const preq = await authed(request(app).post("/api/admin/payment-requests"), adminToken).send({ email: student.email, courseId: old.id, amount: 100 });
    expect(preq.status).toBe(404);
  });
});
