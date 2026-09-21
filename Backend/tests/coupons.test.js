const request = require("supertest");
const crypto = require("crypto");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// No PDF work and no live Razorpay round-trip in tests. The order mock records
// the amount the server asked to charge, so tests assert on the price it chose.
jest.mock("../src/utils/receiptPdf", () => ({ buildReceiptPdfBuffer: jest.fn(() => Buffer.from("fake-pdf")) }));
jest.mock("../src/utils/razorpay", () => ({
  isLiveBlocked: false,
  razorpay: { orders: { create: jest.fn(async () => ({ id: `order_mock_${Math.random().toString(36).slice(2)}`, currency: "INR" })) } },
}));
const { razorpay } = require("../src/utils/razorpay");

let app, prisma, adminToken;
let checkCoupon, priceOrder;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  ({ checkCoupon } = require("../src/utils/coupons"));
  ({ priceOrder } = require("../src/utils/referrals"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@coupons.test", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 90000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
let seq = 0;
const uniq = () => `${Date.now()}${++seq}`;

// A real, purchasable course/internship through the admin API — same state a
// genuine purchase would meet (price set, then explicitly opened).
async function createPriced(overrides = {}) {
  const create = await authed(request(app).post("/api/admin/courses"), adminToken).send({
    type: "course", title: `Item ${uniq()}`, tiers: [{ tier: "basic", price: 5000 }], ...overrides,
  });
  const open = await authed(request(app).put(`/api/admin/courses/${create.body.course._id}`), adminToken).send({ status: "open" });
  return open.body.course;
}

async function createStudent(label) {
  const email = `${label}-${uniq()}@example.com`;
  const signup = await request(app).post("/api/auth/signup").send({ name: "Student", email, phone: "9876500000", password: "a-real-password" });
  return { user: signup.body.user, token: signup.body.token, email };
}

// Creates a code through the real admin endpoint.
async function makeCoupon(overrides = {}) {
  const res = await authed(request(app).post("/api/admin/coupons"), adminToken).send({
    code: `TEST${uniq()}`, discountType: "percent", discountValue: 20, ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.coupon;
}

const quote = (token, course, couponCode, tier = "basic") =>
  authed(request(app).post("/api/payments/quote"), token).send({ courseSlug: course.slug, tier, couponCode });

async function startOrder(token, email, course, couponCode, tier = "basic") {
  const appRes = await authed(request(app).post("/api/applications"), token).send({
    type: course.type, refTitle: course.title, courseSlug: course.slug, tier, name: "Student", email, phone: "9876500000",
  });
  return authed(request(app).post("/api/payments/create-order"), token).send({
    applicationId: appRes.body.application._id, courseSlug: course.slug, tier, couponCode,
  });
}

// ---------------------------------------------------------------- admin API
describe("admin offer-code API", () => {
  it("is admin-only", async () => {
    const { token } = await createStudent("plain");
    expect((await request(app).get("/api/admin/coupons")).status).toBe(401);
    expect((await authed(request(app).get("/api/admin/coupons"), token)).status).toBe(403);
    expect((await authed(request(app).post("/api/admin/coupons"), token).send({ code: "NOPE", discountType: "percent", discountValue: 10 })).status).toBe(403);
  });

  it("creates a code, storing it upper-case without dashes, and refuses the same code twice however it's typed", async () => {
    const res = await authed(request(app).post("/api/admin/coupons"), adminToken).send({
      code: " new-Year 25 ", description: "New year offer", discountType: "percent", discountValue: 25, maxDiscount: 1000,
    });
    expect(res.status).toBe(201);
    expect(res.body.coupon).toMatchObject({ code: "NEWYEAR25", discountType: "percent", discountValue: 25, maxDiscount: 1000, appliesTo: "all", perUserLimit: 1, active: true, redeemed: 0, state: "live" });
    const dupe = await authed(request(app).post("/api/admin/coupons"), adminToken).send({ code: "newyear25", discountType: "fixed", discountValue: 100 });
    expect(dupe.status).toBe(409);
  });

  it("validates everything an admin can get wrong", async () => {
    const course = await createPriced();
    const bad = (body) => authed(request(app).post("/api/admin/coupons"), adminToken).send({ code: `BAD${uniq()}`, discountType: "percent", discountValue: 10, ...body });
    expect((await bad({ code: "ab" })).status).toBe(400); // too short
    expect((await bad({ discountValue: 91 })).status).toBe(400); // above the percent ceiling
    expect((await bad({ discountValue: 0 })).status).toBe(400);
    expect((await bad({ discountValue: 10.5 })).status).toBe(400);
    expect((await bad({ discountType: "half" })).status).toBe(400);
    expect((await bad({ discountType: "fixed", discountValue: 0 })).status).toBe(400);
    expect((await bad({ startsAt: "2030-02-01", expiresAt: "2030-01-01" })).status).toBe(400);
    expect((await bad({ expiresAt: "not a date" })).status).toBe(400);
    expect((await bad({ maxUses: 0 })).status).toBe(400);
    expect((await bad({ perUserLimit: 0 })).status).toBe(400);
    expect((await bad({ appliesTo: "selected", courseIds: [] })).status).toBe(400);
    expect((await bad({ appliesTo: "selected", courseIds: ["no-such-course"] })).status).toBe(400);
    expect((await bad({ appliesTo: "everything" })).status).toBe(400);
    // a fixed amount can exceed 90 — only percentages are capped
    expect((await bad({ discountType: "fixed", discountValue: 2500 })).status).toBe(201);
    expect((await bad({ appliesTo: "selected", courseIds: [course._id] })).status).toBe(201);
  });

  it("edits and switches a code off with a partial update, and shows it in the list", async () => {
    const c = await makeCoupon({ description: "before" });
    const off = await authed(request(app).put(`/api/admin/coupons/${c._id}`), adminToken).send({ active: false });
    expect(off.status).toBe(200);
    expect(off.body.coupon).toMatchObject({ code: c.code, discountValue: 20, active: false, state: "inactive" });
    const edit = await authed(request(app).put(`/api/admin/coupons/${c._id}`), adminToken).send({ discountType: "fixed", discountValue: 300, description: "after" });
    expect(edit.body.coupon).toMatchObject({ discountType: "fixed", discountValue: 300, maxDiscount: null, description: "after" });
    const list = await authed(request(app).get("/api/admin/coupons"), adminToken);
    expect(list.body.coupons.find((x) => x._id === c._id)).toMatchObject({ code: c.code, redeemed: 0 });
    expect((await authed(request(app).put("/api/admin/coupons/nope"), adminToken).send({ active: true })).status).toBe(404);
  });

  it("deletes a code that was never used", async () => {
    const c = await makeCoupon();
    expect((await authed(request(app).delete(`/api/admin/coupons/${c._id}`), adminToken)).status).toBe(200);
    expect((await authed(request(app).delete(`/api/admin/coupons/${c._id}`), adminToken)).status).toBe(404);
  });
});

// ---------------------------------------------------------------- price quote
describe("POST /api/payments/quote with an offer code", () => {
  let student, course;
  beforeAll(async () => { student = await createStudent("quote"); course = await createPriced({ tiers: [{ tier: "basic", price: 5000 }, { tier: "plus", price: 2000, discountPercent: 25 }] }); });

  it("takes a percentage off, and reports what it did", async () => {
    const c = await makeCoupon({ discountType: "percent", discountValue: 20, description: "Diwali" });
    const res = await quote(student.token, course, c.code.toLowerCase());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ couponCode: c.code, couponDescription: "Diwali", couponDiscount: 1000, couponError: null, payable: 4000, planPrice: 5000 });
  });

  it("takes a fixed amount off", async () => {
    const c = await makeCoupon({ discountType: "fixed", discountValue: 750 });
    const res = await quote(student.token, course, c.code);
    expect(res.body).toMatchObject({ couponDiscount: 750, payable: 4250 });
  });

  it("caps a percentage code at its maximum discount", async () => {
    const c = await makeCoupon({ discountType: "percent", discountValue: 50, maxDiscount: 500 });
    expect((await quote(student.token, course, c.code)).body).toMatchObject({ couponDiscount: 500, payable: 4500 });
  });

  it("never takes the price below ₹1, however big the code", async () => {
    const c = await makeCoupon({ discountType: "fixed", discountValue: 99999 });
    expect((await quote(student.token, course, c.code)).body).toMatchObject({ couponDiscount: 4999, payable: 1 });
  });

  it("applies to the plan's already-discounted price", async () => {
    const c = await makeCoupon({ discountType: "percent", discountValue: 10 });
    // Plus is ₹2000 less its own 25% = ₹1500; 10% of that is ₹150.
    expect((await quote(student.token, course, c.code, "plus")).body).toMatchObject({ planPrice: 1500, couponDiscount: 150, payable: 1350 });
  });

  it("answers a bad code with the full price and a reason, not an error", async () => {
    const res = await quote(student.token, course, "NOSUCHCODE");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ couponCode: null, couponDiscount: 0, payable: 5000 });
    expect(res.body.couponError).toMatch(/isn't valid/i);
  });

  it("is unchanged when no code is sent", async () => {
    const res = await quote(student.token, course, undefined);
    expect(res.body).toMatchObject({ couponCode: null, couponDiscount: 0, couponError: null, payable: 5000 });
  });
});

// ---------------------------------------------------------------- the rules
describe("when a code can be used (checkCoupon)", () => {
  let course, internship, student, other;
  beforeAll(async () => {
    course = await createPriced();
    internship = await createPriced({ type: "internship" });
    student = await createStudent("rules");
    other = await createStudent("rules-other");
  });
  const check = (code, who = student, c = course) => checkCoupon({ rawCode: code, userId: who.user.id, course: { id: c._id, type: c.type }, planRupees: 5000 });
  // A payment that counts (or doesn't) against a code, for one student.
  async function usage(coupon, who, { status = "paid", minutesAgo = 0 } = {}) {
    const application = await prisma.application.create({
      data: { type: "course", refTitle: "x", name: "S", email: who.email, phone: "9876500000", userId: who.user.id, courseId: course._id },
    });
    return prisma.payment.create({
      data: { razorpayOrderId: `o_${uniq()}`, amount: 100, status, applicationId: application.id, couponId: coupon._id, couponCode: coupon.code, createdAt: new Date(Date.now() - minutesAgo * 60000) },
    });
  }

  it("accepts a live code in any typing", async () => {
    const c = await makeCoupon({ code: "SPRING-SALE" });
    for (const typed of ["SPRINGSALE", "spring sale", " Spring-Sale "]) expect((await check(typed)).ok).toBe(true);
  });

  it("refuses an unknown, empty or switched-off code", async () => {
    const c = await makeCoupon();
    await authed(request(app).put(`/api/admin/coupons/${c._id}`), adminToken).send({ active: false });
    expect((await check("DOESNOTEXIST")).error).toMatch(/isn't valid/);
    expect((await check("  ")).error).toMatch(/Enter an offer code/);
    expect((await check(c.code)).error).toMatch(/isn't valid/); // off = same answer as never existed
  });

  it("respects the start and expiry dates", async () => {
    const soon = await makeCoupon({ startsAt: new Date(Date.now() + 86400000).toISOString() });
    const gone = await makeCoupon({ startsAt: new Date(Date.now() - 2 * 86400000).toISOString(), expiresAt: new Date(Date.now() - 86400000).toISOString() });
    expect((await check(soon.code)).error).toMatch(/isn't active yet/);
    expect((await check(gone.code)).error).toMatch(/has expired/);
  });

  it("respects what the code applies to", async () => {
    const onlyCourses = await makeCoupon({ appliesTo: "course" });
    const onlyInternships = await makeCoupon({ appliesTo: "internship" });
    const picked = await makeCoupon({ appliesTo: "selected", courseIds: [internship._id] });
    expect((await check(onlyCourses.code, student, course)).ok).toBe(true);
    expect((await check(onlyCourses.code, student, internship)).error).toMatch(/doesn't apply to this internship/);
    expect((await check(onlyInternships.code, student, internship)).ok).toBe(true);
    expect((await check(onlyInternships.code, student, course)).error).toMatch(/doesn't apply to this course/);
    expect((await check(picked.code, student, internship)).ok).toBe(true);
    expect((await check(picked.code, student, course)).error).toMatch(/doesn't apply/);
  });

  it("limits how many times one student can use it", async () => {
    const once = await makeCoupon({ perUserLimit: 1 });
    const twice = await makeCoupon({ perUserLimit: 2 });
    await usage(once, student);
    await usage(twice, student);
    expect((await check(once.code)).error).toMatch(/already used/);
    expect((await check(once.code, other)).ok).toBe(true); // someone else is unaffected
    expect((await check(twice.code)).ok).toBe(true);
    await usage(twice, student);
    expect((await check(twice.code)).error).toMatch(/already used/);
  });

  it("limits the total number of uses: paid and just-started orders count, failed and stale ones don't", async () => {
    const c = await makeCoupon({ maxUses: 2 });
    await usage(c, other, { status: "failed" });
    await usage(c, other, { status: "created", minutesAgo: 120 }); // abandoned long ago — released
    expect((await check(c.code)).ok).toBe(true);
    await usage(c, other, { status: "paid" });
    expect((await check(c.code)).ok).toBe(true);
    await usage(c, other, { status: "created", minutesAgo: 5 }); // in checkout right now — holds a place
    expect((await check(c.code)).error).toMatch(/fully redeemed/);
  });
});

// ---------------------------------------------------------------- with referrals
describe("combining with the referral programme", () => {
  it("takes the offer code off first, then the referral % of what's left", async () => {
    const referrer = await createStudent("referrer");
    const friend = await createStudent("friend");
    await prisma.referral.create({ data: { referrerId: referrer.user.id, refereeId: friend.user.id, refereeDiscountPercent: 10, rewardAmount: 0 } });
    const p = await priceOrder(friend.user.id, 5000, 1000 * 100); // ₹1000 code
    expect(p).toMatchObject({ planPaise: 500000, couponDiscount: 100000, referralDiscount: 40000 }); // 10% of ₹4000
    expect(p.payablePaise).toBe(360000);
  });

  it("is unchanged with no code", async () => {
    const friend = await createStudent("friend2");
    const referrer = await createStudent("referrer2");
    await prisma.referral.create({ data: { referrerId: referrer.user.id, refereeId: friend.user.id, refereeDiscountPercent: 10, rewardAmount: 0 } });
    expect((await priceOrder(friend.user.id, 5000)).payablePaise).toBe(450000);
  });
});

// ---------------------------------------------------------------- ordering
describe("POST /api/payments/create-order with an offer code", () => {
  beforeEach(() => razorpay.orders.create.mockClear());

  it("charges the discounted price and records the code on the payment", async () => {
    const course = await createPriced();
    const c = await makeCoupon({ discountType: "percent", discountValue: 20 });
    const s = await createStudent("order");
    const res = await startOrder(s.token, s.email, course, c.code);
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(400000); // ₹5000 less 20%, in paise
    expect(razorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 400000 }));
    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: res.body.orderId } });
    expect(payment).toMatchObject({ couponId: c._id, couponCode: c.code, couponDiscount: 100000, amount: 400000 });
  });

  it("refuses a code that isn't usable, without opening an order", async () => {
    const course = await createPriced();
    const s = await createStudent("badorder");
    const res = await startOrder(s.token, s.email, course, "NOSUCHCODE");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't valid/i);
    expect(razorpay.orders.create).not.toHaveBeenCalled();
  });

  it("refuses a code for something it doesn't apply to", async () => {
    const course = await createPriced();
    const c = await makeCoupon({ appliesTo: "internship" });
    const s = await createStudent("scope");
    const res = await startOrder(s.token, s.email, course, c.code);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/doesn't apply/);
    expect(razorpay.orders.create).not.toHaveBeenCalled();
  });

  it("works on an internship too", async () => {
    const internship = await createPriced({ type: "internship", tiers: [{ tier: "basic", price: 2000 }] });
    const c = await makeCoupon({ discountType: "fixed", discountValue: 500, appliesTo: "internship" });
    const s = await createStudent("intern");
    const res = await startOrder(s.token, s.email, internship, c.code);
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(150000);
  });

  it("rejects a non-text code", async () => {
    const course = await createPriced();
    const s = await createStudent("nontext");
    const res = await startOrder(s.token, s.email, course, { $ne: "" });
    expect(res.status).toBe(400);
  });

  it("gives the last redemption to only one of two simultaneous buyers", async () => {
    const course = await createPriced();
    const c = await makeCoupon({ maxUses: 1 });
    const a = await createStudent("racea");
    const b = await createStudent("raceb");
    const results = await Promise.all([startOrder(a.token, a.email, course, c.code), startOrder(b.token, b.email, course, c.code)]);
    expect(results.filter((r) => r.status === 201).length).toBeLessThanOrEqual(1);
    const live = await prisma.payment.count({ where: { couponId: c._id, status: { not: "failed" } } });
    expect(live).toBeLessThanOrEqual(1);
  });

  it("a paid order with a code grants access, puts the discount on the receipt and counts as a use", async () => {
    const course = await createPriced();
    const c = await makeCoupon({ discountType: "percent", discountValue: 20, perUserLimit: 1 });
    const s = await createStudent("paid");
    const order = await startOrder(s.token, s.email, course, c.code);
    expect(order.status).toBe(201);

    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: order.body.orderId } });
    const paymentId = `pay_${uniq()}`;
    const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(`${payment.razorpayOrderId}|${paymentId}`).digest("hex");
    const verify = await request(app).post("/api/payments/verify").send({ razorpay_order_id: payment.razorpayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature });
    expect(verify.status).toBe(200);
    expect(verify.body.enrolled).toBe(true);

    const paid = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(paid).toMatchObject({ status: "paid", receiptTotalPaid: 4000, receiptBasePrice: 5000, receiptDiscountAmount: 1000, couponCode: c.code });

    const list = await authed(request(app).get("/api/admin/coupons"), adminToken);
    expect(list.body.coupons.find((x) => x._id === c._id)).toMatchObject({ redeemed: 1, totalDiscount: 1000 });

    // The student has used their one go; the code can't be deleted now it has history.
    const another = await createPriced();
    const again = await startOrder(s.token, s.email, another, c.code);
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/already used/);
    const del = await authed(request(app).delete(`/api/admin/coupons/${c._id}`), adminToken);
    expect(del.status).toBe(409);
    expect(del.body.error).toMatch(/Switch it off/);

    const txns = await authed(request(app).get("/api/admin/payments"), adminToken);
    expect(txns.body.payments.find((p2) => p2.paymentId === payment.id)).toMatchObject({ couponCode: c.code, couponDiscount: 1000 });
  });
});
