const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// Mocked so the race test below can actually distinguish "the atomic guard
// worked, exactly one caller minted the receipt" from "it didn't, and both
// calls proceeded" — see that test's own comment for why asserting on the
// DB's final state alone can't tell the two apart.
jest.mock("../src/utils/receiptPdf", () => ({
  buildReceiptPdfBuffer: jest.fn(() => Buffer.from("fake-pdf")),
}));
const { buildReceiptPdfBuffer } = require("../src/utils/receiptPdf");

// No live Razorpay round-trip in tests — the order endpoint only needs an id
// back. The mock records the amount it was asked to charge so tests can
// assert on the price the server picked.
jest.mock("../src/utils/razorpay", () => ({
  isLiveBlocked: false,
  // A fresh order id per call — /verify looks a payment up by its order id.
  razorpay: { orders: { create: jest.fn(async () => ({ id: `order_mock_${Math.random().toString(36).slice(2)}`, currency: "INR" })) } },
}));
const { razorpay } = require("../src/utils/razorpay");

let app, prisma, attachReceipt;
let adminToken;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  ({ attachReceipt } = require("../src/routes/payments"));

  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);

// Creates a real, purchasable course through the actual admin API (price
// set, then explicitly opened via the separate two-step flow the app
// enforces — see courses.js) rather than inserting one directly, so these
// tests exercise the same state a real course purchase would ever
// actually encounter.
async function createPricedCourse(overrides = {}) {
  const create = await authed(request(app).post("/api/admin/courses"), adminToken).send({
    type: "course", title: `Course ${Date.now()}-${Math.random()}`, tiers: [{ tier: "basic", price: 5000 }], ...overrides,
  });
  const open = await authed(request(app).put(`/api/admin/courses/${create.body.course._id}`), adminToken).send({ status: "open" });
  return open.body.course;
}

async function createStudent(email) {
  const signup = await request(app).post("/api/auth/signup").send({
    name: "Student", email, phone: "9876500000", password: "a-real-password",
  });
  return { user: signup.body.user, token: signup.body.token };
}

// Covers two of this session's new server-side guards on /create-order —
// both fixed gaps where the frontend gated the button but nothing stopped
// a direct API call from bypassing it.
describe("POST /api/payments/create-order — server-side guards", () => {
  it("rejects a course with no plans instead of silently computing a ₹0 order", async () => {
    // The admin API itself refuses to ever leave a course open with no
    // price (that's the courses.js invariant tested separately in
    // courses.test.js) — so the only realistic way this state exists is
    // exactly how it has before in this codebase: a script/migration
    // creating a Course doc directly, bypassing the route layer entirely
    // (see Backend/src/scripts/seedPrograms.js's own history). Simulating
    // that directly here is what actually exercises this guard, since
    // going through the admin API can't reach it.
    const course = await prisma.course.create({ data: { type: "internship", title: `Unpriced ${Date.now()}`, slug: `unpriced-${Date.now()}`, desc: "", status: "open" } });
    const { token } = await createStudent("unpriced-buyer@example.com");
    const appRes = await authed(request(app).post("/api/applications"), token).send({
      type: "internship", refTitle: course.title, courseSlug: course.slug,
      name: "Student", email: "unpriced-buyer@example.com", phone: "9876500000",
    });
    const order = await request(app).post("/api/payments/create-order").send({
      applicationId: appRes.body.application._id, courseSlug: course.slug, tier: "basic",
    });
    expect(order.status).toBe(400);
    expect(order.body.error).toMatch(/not available/i);
  });

  it("rejects a purchase attempt from a user who already has valid access", async () => {
    const course = await createPricedCourse();
    const { user, token } = await createStudent("repeat-buyer@example.com");
    // Simulates an existing successful purchase directly (bypassing the
    // real Razorpay round-trip, which needs live network access) — this is
    // exactly the state grantAccessForPayment leaves behind after a real
    // payment succeeds.
    await prisma.enrollment.create({ data: { userId: user.id, courseId: course._id, status: "active" } });

    const appRes = await authed(request(app).post("/api/applications"), token).send({
      type: "course", refTitle: course.title, courseSlug: course.slug,
      name: "Student", email: "repeat-buyer@example.com", phone: "9876500000",
    });
    const order = await request(app).post("/api/payments/create-order").send({
      applicationId: appRes.body.application._id, courseSlug: course.slug, tier: "basic",
    });
    expect(order.status).toBe(400);
    expect(order.body.error).toMatch(/already have access/i);
  });
});

// Basic / Plus / Pro: the buyer picks a plan and the server charges THAT
// plan's price, read from the database — never an amount the client sent.
describe("POST /api/payments/create-order — plans", () => {
  let course, applicationId;

  beforeAll(async () => {
    course = await createPricedCourse({
      tiers: [
        { tier: "basic", price: 1000 },
        { tier: "plus", price: 2000, discountPercent: 25 },
        { tier: "pro", price: 3000 },
      ],
    });
    const { token } = await createStudent("plans-buyer@example.com");
    const appRes = await authed(request(app).post("/api/applications"), token).send({
      type: "course", refTitle: course.title, courseSlug: course.slug, tier: "pro",
      name: "Student", email: "plans-buyer@example.com", phone: "9876500000",
    });
    applicationId = appRes.body.application._id;
  });

  beforeEach(() => razorpay.orders.create.mockClear());

  it("charges the chosen plan's discounted price and records the plan on the payment and application", async () => {
    const res = await request(app).post("/api/payments/create-order").send({ applicationId, courseSlug: course.slug, tier: "plus" });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(150000); // ₹2000 less 25%, in paise
    expect(razorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 150000 }));

    const payment = await prisma.payment.findFirst({ where: { applicationId }, orderBy: { createdAt: "desc" } });
    expect(payment.tier).toBe("plus");
    expect(payment.orderSnapshotBasePrice).toBe(2000);
    expect(payment.orderSnapshotDiscountPercent).toBe(25);
    // create-order overrides the plan the application was created with ("pro").
    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    expect(application.tier).toBe("plus");
  });

  it("requires a plan to be chosen", async () => {
    const res = await request(app).post("/api/payments/create-order").send({ applicationId, courseSlug: course.slug });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/choose a plan/i);
    expect(razorpay.orders.create).not.toHaveBeenCalled();
  });

  it("rejects a plan name that does not exist", async () => {
    const res = await request(app).post("/api/payments/create-order").send({ applicationId, courseSlug: course.slug, tier: "gold" });
    expect(res.status).toBe(400);
    expect(razorpay.orders.create).not.toHaveBeenCalled();
  });

  it("rejects a plan this course does not offer", async () => {
    const twoPlans = await createPricedCourse({ tiers: [{ tier: "basic", price: 1000 }, { tier: "pro", price: 3000 }] });
    const res = await request(app).post("/api/payments/create-order").send({ applicationId, courseSlug: twoPlans.slug, tier: "plus" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't available/i);
    expect(razorpay.orders.create).not.toHaveBeenCalled();
  });
});

// The plan bought is what the enrollment and receipt then show.
describe("granting access records the purchased plan", () => {
  it("stamps the plan on the enrollment and on the receipt", async () => {
    const crypto = require("crypto");
    const course = await createPricedCourse({ tiers: [{ tier: "basic", price: 1000 }, { tier: "pro", price: 3000 }] });
    const { user, token } = await createStudent("grant-plan@example.com");
    const application = await prisma.application.create({
      data: { type: "course", refTitle: course.title, name: "Grant Plan", email: "grant-plan@example.com", phone: "9876500000", userId: user.id, courseId: course._id, tier: "pro" },
    });
    const payment = await prisma.payment.create({
      data: { razorpayOrderId: `order_grant_${Date.now()}`, amount: 300000, status: "created", tier: "pro", applicationId: application.id, orderSnapshotBasePrice: 3000, orderSnapshotDiscountPercent: 0 },
    });
    const paymentId = "pay_grant_1";
    const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(`${payment.razorpayOrderId}|${paymentId}`).digest("hex");

    buildReceiptPdfBuffer.mockClear();
    const verify = await request(app).post("/api/payments/verify").send({
      razorpay_order_id: payment.razorpayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature,
    });
    expect(verify.status).toBe(200);
    expect(verify.body.enrolled).toBe(true);

    const enrollment = await prisma.enrollment.findFirst({ where: { userId: user.id, courseId: course._id } });
    expect(enrollment.tier).toBe("pro");
    const mine = await authed(request(app).get("/api/me/enrollments"), token);
    expect(mine.body.enrollments[0].tier).toBe("pro");
    const receipts = await authed(request(app).get("/api/me/receipts"), token);
    expect(receipts.body.receipts[0]).toMatchObject({ tier: "pro", totalPaid: 3000 });
    expect(buildReceiptPdfBuffer).toHaveBeenLastCalledWith(expect.objectContaining({ tier: "pro" }));
  });
});

// Covers the attachReceipt race fix: /verify and the Razorpay webhook can
// both reach attachReceipt for the SAME payment within milliseconds of each
// other in production. Before the fix, a plain "check receipt.number, then
// mutate, then save()" let two concurrent callers both pass the check
// before either had saved, minting two different receipt numbers and
// sending two emails for one purchase. The fix made the mint step a single
// atomic findOneAndUpdate matched on receipt.number still being null.
describe("attachReceipt — concurrent /verify + webhook race", () => {
  it("only the winning call proceeds to build/send the receipt — the loser is a true no-op", async () => {
    const course = await createPricedCourse();
    const { user } = await createStudent("race-buyer@example.com");
    const application = await prisma.application.create({
      data: {
        type: "course", refTitle: course.title, name: "Race Buyer", email: "race-buyer@example.com",
        phone: "9876500000", userId: user.id, courseId: course._id,
      },
    });
    const payment = await prisma.payment.create({
      data: { razorpayOrderId: `order_test_${Date.now()}`, amount: 500000, status: "paid", applicationId: application.id },
    });

    // Two independent row fetches pointing at the same DB record — exactly
    // what /verify and the webhook each produce with their own separate
    // Payment lookup.
    const [paymentA, paymentB] = await Promise.all([
      prisma.payment.findUnique({ where: { id: payment.id } }),
      prisma.payment.findUnique({ where: { id: payment.id } }),
    ]);

    buildReceiptPdfBuffer.mockClear();
    const results = await Promise.allSettled([
      attachReceipt(paymentA, application),
      attachReceipt(paymentB, application),
    ]);
    // Neither concurrent call should throw, regardless of which one
    // actually won the race to mint the receipt.
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const final = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(final.receiptNumber).toEqual(expect.any(String));

    // The real invariant the atomic guard protects: only the caller whose
    // findOneAndUpdate actually matched should ever reach the build/send
    // step. A single Payment document can only ever end up with one
    // receipt.number regardless of whether the race guard works — so
    // asserting on the document's final state alone (as an earlier version
    // of this test did) can't tell "the guard worked" apart from "it
    // didn't, and one racing write simply landed last." This call-count
    // check can: with the old check-then-save() pattern, BOTH concurrent
    // calls would pass the pre-save check and both would reach this step.
    expect(buildReceiptPdfBuffer).toHaveBeenCalledTimes(1);
  });
});

// Upgrading a plan (Basic -> Plus/Pro, Plus -> Pro): the student pays the
// target plan's price minus everything they've already paid for the course.
describe("plan upgrades", () => {
  const crypto = require("crypto");
  let course, user, token, enrollment;

  // Signs a /verify request the way Razorpay Checkout's success callback would.
  const verify = (orderId, paymentId) => request(app).post("/api/payments/verify").send({
    razorpay_order_id: orderId, razorpay_payment_id: paymentId,
    razorpay_signature: crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(`${orderId}|${paymentId}`).digest("hex"),
  });
  const upgradeOptions = () => authed(request(app).get(`/api/payments/upgrade-options/${course.slug}`), token);
  const createUpgrade = (tier) => authed(request(app).post("/api/payments/create-upgrade-order"), token).send({ courseSlug: course.slug, tier });

  beforeAll(async () => {
    course = await createPricedCourse({
      durationDays: 90,
      tiers: [{ tier: "basic", price: 1000 }, { tier: "plus", price: 2000, discountPercent: 25 }, { tier: "pro", price: 3000 }],
    });
    ({ user, token } = await createStudent("upgrader@example.com"));
    // A finished Basic purchase: application + paid payment (₹1000) + enrollment.
    const application = await prisma.application.create({
      data: { type: "course", refTitle: course.title, name: "Upgrader", email: "upgrader@example.com", phone: "9876500000", userId: user.id, courseId: course._id, tier: "basic" },
    });
    const payment = await prisma.payment.create({
      data: { razorpayOrderId: `order_basic_${Date.now()}`, razorpayPaymentId: "pay_basic", amount: 100000, status: "paid", tier: "basic", applicationId: application.id },
    });
    enrollment = await prisma.enrollment.create({
      data: { userId: user.id, courseId: course._id, paymentId: payment.id, tier: "basic", status: "active", startDate: new Date(Date.now() - 5 * 86400000), endDate: new Date(Date.now() + 85 * 86400000) },
    });
  });

  beforeEach(() => razorpay.orders.create.mockClear());

  it("offers each higher plan at its price minus what was already paid", async () => {
    const res = await upgradeOptions();
    expect(res.status).toBe(200);
    expect(res.body.currentTier).toBe("basic");
    expect(res.body.paid).toBe(1000);
    expect(res.body.options).toEqual([
      { tier: "plus", planPrice: 1500, due: 500 },   // ₹2000 less 25%, minus the ₹1000 paid
      { tier: "pro", planPrice: 3000, due: 2000 },
    ]);
  });

  it("requires a login", async () => {
    const res = await request(app).post("/api/payments/create-upgrade-order").send({ courseSlug: course.slug, tier: "plus" });
    expect(res.status).toBe(401);
  });

  it("refuses to 'upgrade' to the current plan or down to a lower one", async () => {
    const same = await createUpgrade("basic");
    expect(same.status).toBe(400);
    expect(razorpay.orders.create).not.toHaveBeenCalled();
  });

  it("refuses when the caller has no access to the course", async () => {
    const { token: otherToken } = await createStudent("no-access@example.com");
    const res = await authed(request(app).post("/api/payments/create-upgrade-order"), otherToken).send({ courseSlug: course.slug, tier: "pro" });
    expect(res.status).toBe(400);
    expect(razorpay.orders.create).not.toHaveBeenCalled();
  });

  it("charges only the difference, then moves the plan up without touching the access dates", async () => {
    const order = await createUpgrade("plus");
    expect(order.status).toBe(201);
    expect(order.body.amount).toBe(50000); // ₹500 in paise
    expect(razorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 50000 }));

    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: order.body.orderId } });
    expect(payment).toMatchObject({ tier: "plus", fromTier: "basic", amount: 50000 });
    // Nothing changes until the payment is confirmed.
    expect((await prisma.enrollment.findUnique({ where: { id: enrollment.id } })).tier).toBe("basic");

    const before = await prisma.enrollment.findUnique({ where: { id: enrollment.id } });
    const confirmed = await verify(order.body.orderId, "pay_upgrade_plus");
    expect(confirmed.status).toBe(200);
    // A second confirmation (the webhook landing after /verify) is a no-op.
    expect((await verify(order.body.orderId, "pay_upgrade_plus")).status).toBe(200);

    const after = await prisma.enrollment.findUnique({ where: { id: enrollment.id } });
    expect(after.tier).toBe("plus");
    expect(after.startDate.getTime()).toBe(before.startDate.getTime());
    expect(after.endDate.getTime()).toBe(before.endDate.getTime());
    expect(after.paymentId).toBe(before.paymentId); // still points at the original purchase

    const receipts = await authed(request(app).get("/api/me/receipts"), token);
    const upgradeReceipt = receipts.body.receipts.find((r) => r.fromTier === "basic");
    expect(upgradeReceipt).toMatchObject({ tier: "plus", totalPaid: 500, courseId: course._id });
    expect(buildReceiptPdfBuffer).toHaveBeenLastCalledWith(expect.objectContaining({ tier: "plus", fromTier: "basic" }));
  });

  it("counts earlier upgrades toward the next one", async () => {
    const res = await upgradeOptions();
    expect(res.body.currentTier).toBe("plus");
    expect(res.body.paid).toBe(1500);
    expect(res.body.options).toEqual([{ tier: "pro", planPrice: 3000, due: 1500 }]); // Basic + Plus + Pro = ₹3000 in total

    const order = await createUpgrade("pro");
    expect(order.body.amount).toBe(150000);
    await verify(order.body.orderId, "pay_upgrade_pro");
    expect((await prisma.enrollment.findUnique({ where: { id: enrollment.id } })).tier).toBe("pro");
  });

  it("offers nothing once on the top plan", async () => {
    const res = await upgradeOptions();
    expect(res.body.currentTier).toBe("pro");
    expect(res.body.options).toEqual([]);
    expect((await createUpgrade("pro")).status).toBe(400);
  });

  it("does not offer upgrades on access that was not bought as a plan", async () => {
    const { user: granted, token: grantedToken } = await createStudent("admin-granted@example.com");
    await prisma.enrollment.create({ data: { userId: granted.id, courseId: course._id, status: "active" } });
    const res = await authed(request(app).get(`/api/payments/upgrade-options/${course.slug}`), grantedToken);
    expect(res.body.options).toEqual([]);
    expect(res.body.reason).toMatch(/can't be upgraded online/i);
  });
});

// Regression tests for bugs found in the bug sweep.
describe("create-order — bug-sweep regressions", () => {
  beforeEach(() => razorpay.orders.create.mockClear());

  it("refuses an application with no account behind it instead of taking money it can't unlock", async () => {
    const course = await createPricedCourse();
    // A guest application: no Authorization header, so no userId is attached.
    const appRes = await request(app).post("/api/applications").send({
      type: "course", refTitle: course.title, courseSlug: course.slug,
      name: "Guest Buyer", email: "guest-buyer@example.com", phone: "9876500000",
    });
    expect(appRes.status).toBe(201);
    const order = await request(app).post("/api/payments/create-order").send({
      applicationId: appRes.body.application._id, courseSlug: course.slug, tier: "basic",
    });
    expect(order.status).toBe(401);
    expect(order.body.error).toMatch(/log in/i);
    expect(razorpay.orders.create).not.toHaveBeenCalled();
  });

  it("charges whole rupees — exactly the rounded price the site shows", async () => {
    // ₹5,999 less 20% is ₹4,799.20; the site shows ₹4,799, so that's what is charged.
    const course = await createPricedCourse({ tiers: [{ tier: "basic", price: 5999, discountPercent: 20 }] });
    const { token } = await createStudent("whole-rupees@example.com");
    const appRes = await authed(request(app).post("/api/applications"), token).send({
      type: "course", refTitle: course.title, courseSlug: course.slug,
      name: "Whole Rupees", email: "whole-rupees@example.com", phone: "9876500000",
    });
    const order = await request(app).post("/api/payments/create-order").send({
      applicationId: appRes.body.application._id, courseSlug: course.slug, tier: "basic",
    });
    expect(order.status).toBe(201);
    expect(order.body.amount).toBe(479900);
  });

  it("points an owner of a plan at Upgrade instead of just refusing", async () => {
    const course = await createPricedCourse({ tiers: [{ tier: "basic", price: 1000 }, { tier: "pro", price: 3000 }] });
    const { user, token } = await createStudent("owner-hint@example.com");
    await prisma.enrollment.create({ data: { userId: user.id, courseId: course._id, status: "active", tier: "basic" } });
    const appRes = await authed(request(app).post("/api/applications"), token).send({
      type: "course", refTitle: course.title, courseSlug: course.slug,
      name: "Owner Hint", email: "owner-hint@example.com", phone: "9876500000",
    });
    const order = await request(app).post("/api/payments/create-order").send({
      applicationId: appRes.body.application._id, courseSlug: course.slug, tier: "pro",
    });
    expect(order.status).toBe(400);
    expect(order.body.error).toMatch(/upgrade plan/i);
  });
});

describe("receipts add up when the price was discounted", () => {
  it("derives the discount from what was charged, so base - discount = total", async () => {
    const course = await createPricedCourse({ tiers: [{ tier: "basic", price: 5999, discountPercent: 20 }] });
    const { user } = await createStudent("receipt-sum@example.com");
    const application = await prisma.application.create({
      data: { type: "course", refTitle: course.title, name: "Receipt Sum", email: "receipt-sum@example.com", phone: "9876500000", userId: user.id, courseId: course._id, tier: "basic" },
    });
    const payment = await prisma.payment.create({
      data: { razorpayOrderId: `order_sum_${Date.now()}`, razorpayPaymentId: "pay_sum", amount: 479900, status: "paid", tier: "basic", applicationId: application.id, orderSnapshotBasePrice: 5999, orderSnapshotDiscountPercent: 20 },
    });
    await attachReceipt(payment, application);
    const saved = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(saved.receiptBasePrice).toBe(5999);
    expect(saved.receiptTotalPaid).toBe(4799);
    expect(saved.receiptDiscountAmount).toBe(1200); // 5999 - 4799, not the unrounded 1199.80
  });
});
