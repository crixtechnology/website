const request = require("supertest");
const crypto = require("crypto");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// Same stand-ins payments.test.js uses: no PDF work, and no live Razorpay call
// (each order just gets a fresh id back).
// These suites make dozens of applications/orders in a few seconds: the public
// write limiter (30 per 15 minutes) would start answering 429, and the
// notification mailers would make real network calls. Neither is what is under test.
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
  razorpay: { orders: { create: jest.fn(async () => ({ id: `order_ref_${Math.random().toString(36).slice(2)}`, currency: "INR" })) } },
}));
const { razorpay } = require("../src/utils/razorpay");

let app, prisma, adminToken;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
let seq = 0;

async function signup(label, extra = {}) {
  const email = `${label}${++seq}@example.com`;
  const res = await request(app).post("/api/auth/signup").send({
    name: "Student Person", email, phone: "9876500000", password: "a-real-password", ...extra,
  });
  expect(res.status).toBe(201);
  return { id: res.body.user.id, email, token: res.body.token };
}
const referralOf = async (student) => (await authed(request(app).get("/api/me/referral"), student.token)).body;

async function openCourse(price, title) {
  const create = await authed(request(app).post("/api/admin/courses"), adminToken).send({
    type: "course", title: title || `Ref Course ${Date.now()}-${Math.random()}`, tiers: [{ tier: "basic", price }],
  });
  const open = await authed(request(app).put(`/api/admin/courses/${create.body.course._id}`), adminToken).send({ status: "open" });
  return open.body.course;
}

const quote = (student, course) => authed(request(app).post("/api/payments/quote"), student.token).send({ courseSlug: course.slug, tier: "basic" });

// Runs a purchase end to end: application -> order -> Razorpay's confirmation callback.
async function buy(student, course) {
  const appRes = await authed(request(app).post("/api/applications"), student.token).send({
    type: "course", refTitle: course.title, courseSlug: course.slug, tier: "basic",
    name: "Student Person", email: student.email, phone: "9876500000",
  });
  const order = await request(app).post("/api/payments/create-order").send({
    applicationId: appRes.body.application._id, courseSlug: course.slug, tier: "basic",
  });
  expect(order.status).toBe(201);
  const paymentId = `pay_${Math.random().toString(36).slice(2)}`;
  const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(`${order.body.orderId}|${paymentId}`).digest("hex");
  const confirm = () => request(app).post("/api/payments/verify").send({
    razorpay_order_id: order.body.orderId, razorpay_payment_id: paymentId, razorpay_signature: signature,
  });
  expect((await confirm()).status).toBe(200);
  return { order: order.body, confirm };
}

describe("referral codes", () => {
  it("gives every student one stable code, and accepts it in any case with or without the dash", async () => {
    const student = await signup("codes");
    const first = await referralOf(student);
    expect(first.code).toMatch(/^CRIX[A-HJ-KM-NP-Z2-9]{6}$/);
    expect(first.displayCode).toBe(`CRIX-${first.code.slice(4)}`);
    expect((await referralOf(student)).code).toBe(first.code); // never changes

    for (const typed of [first.code, first.displayCode, first.displayCode.toLowerCase(), ` ${first.code.toLowerCase()} `]) {
      const check = await request(app).get("/api/referrals/check").query({ code: typed });
      expect(check.body).toMatchObject({ ok: true, valid: true, discountPercent: 10 });
    }
    const bad = await request(app).get("/api/referrals/check").query({ code: "CRIXNOPE99" });
    expect(bad.body.valid).toBe(false);
  });

  it("applies a friend's code once, before the first purchase, and never your own", async () => {
    const referrer = await signup("referrer");
    const friend = await signup("friend");
    const { code } = await referralOf(referrer);
    const apply = (student, c) => authed(request(app).post("/api/referrals/apply"), student.token).send({ code: c });

    expect((await apply(friend, "CRIXWRONG1")).status).toBe(400);
    const own = await apply(referrer, code);
    expect(own.status).toBe(400);
    expect(own.body.error).toMatch(/own/i);

    const ok = await apply(friend, code);
    expect(ok.status).toBe(201);
    expect(ok.body.discountPercent).toBe(10);
    const again = await apply(friend, code);
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/already/i);

    const mine = await referralOf(friend);
    expect(mine.referredBy).toMatchObject({ status: "pending", discountPercent: 10 });
    expect(mine.canApplyCode).toBe(false);

    const theirs = await referralOf(referrer);
    expect(theirs.stats).toMatchObject({ total: 1, pending: 1, rewarded: 0 });
    expect(theirs.referrals[0]).toMatchObject({ name: "Student", status: "pending" }); // first name only
  });

  it("is only for new students — someone who already has a course can't apply a code", async () => {
    const referrer = await signup("ref-old");
    const veteran = await signup("veteran");
    const course = await openCourse(1000);
    await prisma.enrollment.create({ data: { userId: veteran.id, courseId: course._id, status: "active" } });
    const res = await authed(request(app).post("/api/referrals/apply"), veteran.token).send({ code: (await referralOf(referrer)).code });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/new students/i);
    expect((await referralOf(veteran)).canApplyCode).toBe(false);
  });

  it("attaches a code given at signup, and a bad code never blocks the signup", async () => {
    const referrer = await signup("ref-signup");
    const { code } = await referralOf(referrer);
    const withCode = await signup("via-code", { referralCode: code });
    expect((await referralOf(withCode)).referredBy).toMatchObject({ status: "pending" });
    expect((await referralOf(referrer)).stats.total).toBe(1);

    const withBad = await signup("bad-code", { referralCode: "CRIXNOPE99" }); // signup() asserts the 201
    expect((await referralOf(withBad)).referredBy).toBeNull();
  });
});

describe("referral pricing, rewards and credit", () => {
  let referrer, friend, course;

  beforeAll(async () => {
    referrer = await signup("earner");
    friend = await signup("welcomed");
    course = await openCourse(1000);
    await authed(request(app).post("/api/referrals/apply"), friend.token).send({ code: (await referralOf(referrer)).code });
  });

  it("quotes the friend's welcome discount, and nothing extra for the referrer yet", async () => {
    const mine = await quote(friend, course);
    expect(mine.body).toMatchObject({ planPrice: 1000, referralPercent: 10, referralDiscount: 100, creditApplied: 0, payable: 900 });
    const plain = await quote(referrer, course);
    expect(plain.body).toMatchObject({ referralDiscount: 0, creditApplied: 0, payable: 1000 });
  });

  it("charges the discounted amount, and only the first confirmation rewards the referrer", async () => {
    razorpay.orders.create.mockClear();
    const { order, confirm } = await buy(friend, course);
    expect(order.amount).toBe(90000);
    expect(razorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 90000 }));

    // The webhook landing after /verify (or a retry) must not reward twice.
    expect((await confirm()).status).toBe(200);
    expect((await confirm()).status).toBe(200);

    const theirs = await referralOf(referrer);
    expect(theirs.creditBalance).toBe(500);
    expect(theirs.stats).toMatchObject({ total: 1, pending: 0, rewarded: 1, earned: 500 });
    expect((await referralOf(friend)).referredBy.status).toBe("rewarded");

    // The receipt shows what came off: list ₹1000, paid ₹900.
    const receipts = await authed(request(app).get("/api/me/receipts"), friend.token);
    expect(receipts.body.receipts[0]).toMatchObject({ basePrice: 1000, totalPaid: 900, discountAmount: 100, discountPercent: 10 });
  });

  it("only gives the welcome discount on the first purchase", async () => {
    const second = await openCourse(2000);
    const res = await quote(friend, second);
    expect(res.body).toMatchObject({ referralDiscount: 0, payable: 2000 });
  });

  it("spends the referrer's credit automatically on their next purchase", async () => {
    const bigger = await openCourse(2000);
    const q = await quote(referrer, bigger);
    expect(q.body).toMatchObject({ creditAvailable: 500, creditApplied: 500, payable: 1500 });

    const { order } = await buy(referrer, bigger);
    expect(order.amount).toBe(150000);
    const after = await referralOf(referrer);
    expect(after.creditBalance).toBe(0);
    expect(after.stats.earned).toBe(500); // earned is lifetime; balance is what's left

    const receipts = await authed(request(app).get("/api/me/receipts"), referrer.token);
    expect(receipts.body.receipts[0]).toMatchObject({ basePrice: 2000, totalPaid: 1500, discountAmount: 500 });
  });

  it("never takes an order below ₹1 — credit is capped, the rest stays for later", async () => {
    const star = await signup("star");
    await prisma.creditEntry.create({ data: { userId: star.id, amount: 50000, kind: "adjustment", note: "test" } });
    const cheap = await openCourse(300);
    const q = await quote(star, cheap);
    expect(q.body).toMatchObject({ creditAvailable: 500, creditApplied: 299, payable: 1 });
    const { order } = await buy(star, cheap);
    expect(order.amount).toBe(100);
    expect((await referralOf(star)).creditBalance).toBe(201);
  });

  it("does not let two unpaid checkouts spend the same credit", async () => {
    const saver = await signup("saver");
    await prisma.creditEntry.create({ data: { userId: saver.id, amount: 50000, kind: "adjustment", note: "test" } });
    const a = await openCourse(2000);
    const b = await openCourse(2000);
    const start = async (c) => {
      const appRes = await authed(request(app).post("/api/applications"), saver.token).send({
        type: "course", refTitle: c.title, courseSlug: c.slug, tier: "basic", name: "Student Person", email: saver.email, phone: "9876500000",
      });
      return request(app).post("/api/payments/create-order").send({ applicationId: appRes.body.application._id, courseSlug: c.slug, tier: "basic" });
    };
    expect((await start(a)).body.amount).toBe(150000); // uses the ₹500
    expect((await start(b)).body.amount).toBe(200000); // that credit is already spoken for
  });
});

describe("admin: referral rules and overview", () => {
  afterEach(async () => {
    await authed(request(app).put("/api/admin/referral-settings"), adminToken).send({ enabled: true, refereeDiscountPercent: 10, referrerCreditRupees: 500 });
  });

  it("reads and updates the rules, rejecting nonsense", async () => {
    const read = await authed(request(app).get("/api/admin/referral-settings"), adminToken);
    expect(read.body.settings).toEqual({ enabled: true, refereeDiscountPercent: 10, referrerCreditRupees: 500 });
    const put = await authed(request(app).put("/api/admin/referral-settings"), adminToken).send({ refereeDiscountPercent: 15, referrerCreditRupees: 750 });
    expect(put.body.settings).toMatchObject({ refereeDiscountPercent: 15, referrerCreditRupees: 750 });

    for (const bad of [{ refereeDiscountPercent: 95 }, { refereeDiscountPercent: -1 }, { refereeDiscountPercent: 12.5 }, { referrerCreditRupees: "lots" }, { enabled: "yes" }]) {
      expect((await authed(request(app).put("/api/admin/referral-settings"), adminToken).send(bad)).status).toBe(400);
    }
    const student = await signup("not-admin");
    expect((await authed(request(app).get("/api/admin/referral-settings"), student.token)).status).toBeGreaterThanOrEqual(401);
  });

  it("promises what the rules said when the code was applied, even if they change later", async () => {
    await authed(request(app).put("/api/admin/referral-settings"), adminToken).send({ refereeDiscountPercent: 20, referrerCreditRupees: 300 });
    const referrer = await signup("promise-ref");
    const friend = await signup("promise-friend");
    await authed(request(app).post("/api/referrals/apply"), friend.token).send({ code: (await referralOf(referrer)).code });
    await authed(request(app).put("/api/admin/referral-settings"), adminToken).send({ refereeDiscountPercent: 5, referrerCreditRupees: 100 });

    const course = await openCourse(1000);
    expect((await quote(friend, course)).body).toMatchObject({ referralPercent: 20, payable: 800 });
    await buy(friend, course);
    expect((await referralOf(referrer)).creditBalance).toBe(300);
  });

  it("stops accepting codes when switched off", async () => {
    const referrer = await signup("off-ref");
    const friend = await signup("off-friend");
    const { code } = await referralOf(referrer);
    await authed(request(app).put("/api/admin/referral-settings"), adminToken).send({ enabled: false });
    const res = await authed(request(app).post("/api/referrals/apply"), friend.token).send({ code });
    expect(res.status).toBe(400);
    expect((await request(app).get("/api/referrals/check").query({ code })).body.valid).toBe(false);
  });

  it("lists every referral with who, status and money, plus the totals", async () => {
    const res = await authed(request(app).get("/api/admin/referrals"), adminToken);
    expect(res.status).toBe(200);
    expect(res.body.summary.total).toBeGreaterThan(0);
    expect(res.body.summary.rewarded).toBeGreaterThan(0);
    expect(res.body.summary.creditIssued).toBeGreaterThanOrEqual(res.body.summary.creditRedeemed);
    const rewarded = res.body.referrals.find((r) => r.status === "rewarded");
    expect(rewarded.referrer.email).toMatch(/@example\.com$/);
    expect(rewarded.friendPaid).toBeGreaterThan(0);

    const pending = await authed(request(app).get("/api/admin/referrals").query({ status: "pending" }), adminToken);
    expect(pending.body.referrals.every((r) => r.status === "pending")).toBe(true);
  });

  it("removes a deleted student's referral rows instead of failing", async () => {
    const referrer = await signup("gone-ref");
    const friend = await signup("gone-friend");
    await authed(request(app).post("/api/referrals/apply"), friend.token).send({ code: (await referralOf(referrer)).code });
    const del = await authed(request(app).delete(`/api/admin/users/${friend.id}`), adminToken);
    expect(del.status).toBe(200);
    expect((await referralOf(referrer)).stats.total).toBe(0);
  });
});
