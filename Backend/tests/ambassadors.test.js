const request = require("supertest");
const crypto = require("crypto");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

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
  razorpay: { orders: { create: jest.fn(async () => ({ id: `order_amb_${Math.random().toString(36).slice(2)}`, currency: "INR" })) } },
}));

let app, prisma, adminToken;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
const admin = (req) => authed(req, adminToken);
let seq = 0;

async function signup(label) {
  const email = `${label}${++seq}@example.com`;
  const res = await request(app).post("/api/auth/signup").send({ name: "Campus Student", email, phone: "9876500000", password: "a-real-password" });
  expect(res.status).toBe(201);
  return { id: res.body.user.id, email, token: res.body.token };
}

const APPLICATION = {
  college: "Gujarat Technological University", city: "Ahmedabad", yearOfStudy: "3rd year", branch: "Computer Engineering",
  socialHandle: "@campusleader", motivation: "I run the coding club and can reach 300 students every semester.",
};
const apply = (student, body = APPLICATION) => authed(request(app).post("/api/ambassador/apply"), student.token).send(body);
const me = async (student) => (await authed(request(app).get("/api/me/ambassador"), student.token)).body;
const referralOf = async (student) => (await authed(request(app).get("/api/me/referral"), student.token)).body;

// An applicant who has been approved by the admin.
async function makeAmbassador(label = "amb", override) {
  const student = await signup(label);
  expect((await apply(student)).status).toBe(201);
  const list = await admin(request(app).get("/api/admin/ambassadors"));
  const row = list.body.ambassadors.find((a) => a.user.email === student.email);
  const patch = await admin(request(app).patch(`/api/admin/ambassadors/${row._id}`)).send({ status: "approved", ...(override !== undefined ? { commissionPercent: override } : {}) });
  expect(patch.status).toBe(200);
  return { ...student, ambassadorId: row._id };
}

async function openCourse(price) {
  const create = await admin(request(app).post("/api/admin/courses")).send({
    type: "course", title: `Amb Course ${Date.now()}-${Math.random()}`, tiers: [{ tier: "basic", price }],
  });
  const open = await admin(request(app).put(`/api/admin/courses/${create.body.course._id}`)).send({ status: "open" });
  return open.body.course;
}

async function buy(student, course) {
  const appRes = await authed(request(app).post("/api/applications"), student.token).send({
    type: "course", refTitle: course.title, courseSlug: course.slug, tier: "basic", name: "Campus Student", email: student.email, phone: "9876500000",
  });
  const order = await authed(request(app).post("/api/payments/create-order"), student.token).send({ applicationId: appRes.body.application._id, courseSlug: course.slug, tier: "basic" });
  expect(order.status).toBe(201);
  const paymentId = `pay_${Math.random().toString(36).slice(2)}`;
  const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(`${order.body.orderId}|${paymentId}`).digest("hex");
  const confirm = () => request(app).post("/api/payments/verify").send({ razorpay_order_id: order.body.orderId, razorpay_payment_id: paymentId, razorpay_signature: signature });
  expect((await confirm()).status).toBe(200);
  return { order: order.body, confirm };
}

// Brings a friend in through the ambassador's code and has them buy a ₹1000 course
// (10% welcome discount -> they pay ₹900).
async function friendBuys(ambassador, label = "friend") {
  const friend = await signup(label);
  const { code } = await referralOf(ambassador);
  expect((await authed(request(app).post("/api/referrals/apply"), friend.token).send({ code })).status).toBe(201);
  const purchase = await buy(friend, await openCourse(1000));
  return { friend, ...purchase };
}

describe("applying", () => {
  it("shows the programme to anyone, and validates the application", async () => {
    const program = await request(app).get("/api/ambassador/program");
    expect(program.body.program).toMatchObject({ enabled: true, commissionPercent: 10, holdDays: 7, minPayoutRupees: 500, friendDiscountPercent: 10 });
    expect(program.body.program.perks.length).toBeGreaterThan(0);

    const student = await signup("applicant");
    expect((await apply(student, { ...APPLICATION, college: "" })).status).toBe(400);
    expect((await apply(student, { ...APPLICATION, motivation: "too short" })).status).toBe(400);
    expect((await request(app).post("/api/ambassador/apply").send(APPLICATION)).status).toBe(401);
  });

  it("records the application once, and shows its status but no dashboard until approved", async () => {
    const student = await signup("once");
    expect((await me(student)).status).toBeNull();
    expect((await apply(student)).status).toBe(201);
    const again = await apply(student);
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/already/i);

    const mine = await me(student);
    expect(mine.status).toBe("applied");
    expect(mine.application.college).toBe(APPLICATION.college);
    expect(mine.code).toBeUndefined();
    expect(mine.stats).toBeUndefined();

    const list = await admin(request(app).get("/api/admin/ambassadors").query({ status: "applied" }));
    expect(list.body.ambassadors.some((a) => a.user.email === student.email)).toBe(true);
  });

  it("only approved ambassadors can save payout details or ask for a payout", async () => {
    const student = await signup("notyet");
    await apply(student);
    expect((await authed(request(app).put("/api/me/ambassador/profile"), student.token).send({ upiId: "me@okbank" })).status).toBe(403);
    expect((await authed(request(app).post("/api/me/ambassador/payouts"), student.token)).status).toBe(403);
  });
});

describe("approval", () => {
  it("approving gives a code, a certificate and the default commission; rejecting lets them re-apply", async () => {
    const amb = await makeAmbassador("approved");
    const mine = await me(amb);
    expect(mine.status).toBe("approved");
    expect(mine.displayCode).toMatch(/^CRIX-/);
    expect(mine.commissionPercent).toBe(10);
    expect(mine.certificate.number).toMatch(new RegExp(`^CRX-AMB-${new Date().getFullYear()}-\\d{5}$`));
    expect(mine.kit).toMatchObject({ status: "not_sent" });

    // Approving again never issues a second certificate.
    await admin(request(app).patch(`/api/admin/ambassadors/${amb.ambassadorId}`)).send({ status: "approved" });
    expect((await me(amb)).certificate.number).toBe(mine.certificate.number);

    const rejected = await signup("rejected");
    await apply(rejected);
    const row = (await admin(request(app).get("/api/admin/ambassadors"))).body.ambassadors.find((a) => a.user.email === rejected.email);
    await admin(request(app).patch(`/api/admin/ambassadors/${row._id}`)).send({ status: "rejected", adminNote: "Not enough reach yet" });
    expect((await me(rejected)).status).toBe("rejected");
    expect((await apply(rejected)).status).toBe(201);
    expect((await me(rejected)).status).toBe("applied");
  });

  it("supports a per-ambassador commission, and tracks the welcome kit", async () => {
    const amb = await makeAmbassador("custom", 15);
    expect((await me(amb)).commissionPercent).toBe(15);
    await admin(request(app).patch(`/api/admin/ambassadors/${amb.ambassadorId}`)).send({ kitStatus: "shipped", kitNote: "Courier ref 12345" });
    expect((await me(amb)).kit).toEqual({ status: "shipped", note: "Courier ref 12345" });
    await admin(request(app).patch(`/api/admin/ambassadors/${amb.ambassadorId}`)).send({ commissionPercent: null });
    expect((await me(amb)).commissionPercent).toBe(10);

    for (const bad of [{ commissionPercent: 60 }, { commissionPercent: 2.5 }, { kitStatus: "lost" }, { status: "hero" }]) {
      expect((await admin(request(app).patch(`/api/admin/ambassadors/${amb.ambassadorId}`)).send(bad)).status).toBe(400);
    }
    const nonAdmin = await signup("nonadmin");
    expect((await authed(request(app).get("/api/admin/ambassadors"), nonAdmin.token)).status).toBeGreaterThanOrEqual(401);
  });
});

describe("commission, hold and payout", () => {
  let amb;

  beforeAll(async () => {
    amb = await makeAmbassador("earner", 20);
  });

  it("earns a % of what the friend actually paid — and cash, not referral credit", async () => {
    const { friend, confirm } = await friendBuys(amb, "buyer1");
    // Friend gets the usual welcome discount: ₹1000 -> ₹900.
    // The webhook / a retry landing again must not pay the commission twice.
    expect((await confirm()).status).toBe(200);

    const mine = await me(amb);
    expect(mine.stats).toMatchObject({ referred: 1, paidCount: 1, total: 180, onHold: 180, available: 0, requested: 0, paid: 0 }); // 20% of ₹900
    expect(mine.earnings).toHaveLength(1);
    expect(mine.earnings[0]).toMatchObject({ friend: "Campus", paid: 900, percent: 20, amount: 180, state: "on_hold" });
    expect((await referralOf(amb)).creditBalance).toBe(0); // commission, not credit
    expect((await referralOf(friend)).referredBy.status).toBe("rewarded");
  });

  it("makes commission payable after the hold, then needs a payout method and the minimum", async () => {
    await prisma.ambassadorEarning.updateMany({ where: { ambassadorId: amb.ambassadorId }, data: { availableAt: new Date(Date.now() - 1000) } });
    expect((await me(amb)).stats).toMatchObject({ onHold: 0, available: 180 });

    const request1 = () => authed(request(app).post("/api/me/ambassador/payouts"), amb.token);
    const noMethod = await request1();
    expect(noMethod.status).toBe(400);
    expect(noMethod.body.error).toMatch(/UPI|bank/i);

    for (const bad of [{ upiId: "not a upi" }, { bankAccount: "12" }, { bankIfsc: "ABC" }]) {
      expect((await authed(request(app).put("/api/me/ambassador/profile"), amb.token).send(bad)).status).toBe(400);
    }
    const save = await authed(request(app).put("/api/me/ambassador/profile"), amb.token).send({ upiId: "campus.leader@okbank", shippingAddress: "12 College Road, Ahmedabad 380001" });
    expect(save.status).toBe(200);
    const profile = (await me(amb)).profile;
    expect(profile).toMatchObject({ upiId: "campus.leader@okbank", hasPayoutMethod: true, shippingAddress: "12 College Road, Ahmedabad 380001" });

    const belowMin = await request1(); // ₹180 available, minimum is ₹500
    expect(belowMin.status).toBe(400);
    expect(belowMin.body.error).toMatch(/500/);
    expect((await me(amb)).canRequestPayout).toBe(false);
  });

  it("pays out once the minimum is reached: request, admin marks it paid with a reference", async () => {
    await admin(request(app).put("/api/admin/ambassador-settings")).send({ minPayoutRupees: 100 });
    expect((await me(amb)).canRequestPayout).toBe(true);

    const req = await authed(request(app).post("/api/me/ambassador/payouts"), amb.token);
    expect(req.status).toBe(201);
    expect(req.body.amount).toBe(180);
    expect((await me(amb)).stats).toMatchObject({ available: 0, requested: 180, paid: 0 });
    expect((await authed(request(app).post("/api/me/ambassador/payouts"), amb.token)).status).toBe(400); // nothing left to request

    const list = await admin(request(app).get("/api/admin/ambassador-payouts").query({ status: "requested" }));
    const payout = list.body.payouts.find((p) => p.ambassador.email === amb.email);
    expect(payout).toMatchObject({ amount: 180, status: "requested", payTo: "UPI: campus.leader@okbank" });

    const patch = (body) => admin(request(app).patch(`/api/admin/ambassador-payouts/${payout._id}`)).send(body);
    expect((await patch({ action: "paid" })).status).toBe(400); // needs a transaction reference
    expect((await patch({ action: "paid", reference: "UTR-482910" })).status).toBe(200);
    expect((await patch({ action: "paid", reference: "UTR-2" })).status).toBe(409); // already done
    expect((await patch({ action: "rejected" })).status).toBe(409);

    const after = await me(amb);
    expect(after.stats).toMatchObject({ requested: 0, paid: 180 });
    expect(after.payouts[0]).toMatchObject({ amount: 180, status: "paid", reference: "UTR-482910" });
    await admin(request(app).put("/api/admin/ambassador-settings")).send({ minPayoutRupees: 500 });
  });

  it("frees the commission again when the admin rejects a payout request", async () => {
    await admin(request(app).put("/api/admin/ambassador-settings")).send({ minPayoutRupees: 100 });
    await friendBuys(amb, "buyer2");
    await prisma.ambassadorEarning.updateMany({ where: { ambassadorId: amb.ambassadorId }, data: { availableAt: new Date(Date.now() - 1000) } });
    expect((await authed(request(app).post("/api/me/ambassador/payouts"), amb.token)).status).toBe(201);

    const list = await admin(request(app).get("/api/admin/ambassador-payouts").query({ status: "requested" }));
    const payout = list.body.payouts.find((p) => p.ambassador.email === amb.email);
    expect((await admin(request(app).patch(`/api/admin/ambassador-payouts/${payout._id}`)).send({ action: "rejected", note: "UPI ID bounced" })).status).toBe(200);

    expect((await me(amb)).stats).toMatchObject({ requested: 0, available: 180 }); // claimable again
    await admin(request(app).put("/api/admin/ambassador-settings")).send({ minPayoutRupees: 500 });
  });

  it("lets the admin void a commission — until it is part of a payout", async () => {
    const detail = await admin(request(app).get(`/api/admin/ambassadors/${amb.ambassadorId}`));
    const paidOne = detail.body.earnings.find((e) => e.locked);
    const free = detail.body.earnings.find((e) => !e.locked);
    expect(detail.body.payoutDestination).toBe("UPI: campus.leader@okbank");

    const locked = await admin(request(app).patch(`/api/admin/ambassador-earnings/${paidOne._id}`)).send({ void: true });
    expect(locked.status).toBe(409);

    const before = (await me(amb)).stats.total;
    expect((await admin(request(app).patch(`/api/admin/ambassador-earnings/${free._id}`)).send({ void: true })).status).toBe(200);
    expect((await me(amb)).stats.total).toBe(before - 180);
    expect((await admin(request(app).patch(`/api/admin/ambassador-earnings/${free._id}`)).send({ void: "yes" })).status).toBe(400);
  });

  it("keeps the ambassador's own referral credit and normal purchases unaffected", async () => {
    const course = await openCourse(500);
    const quote = await authed(request(app).post("/api/payments/quote"), amb.token).send({ courseSlug: course.slug, tier: "basic" });
    expect(quote.body).toMatchObject({ referralDiscount: 0, creditApplied: 0, payable: 500 });
  });

  it("refuses to delete a student whose purchase fed a paid-out commission", async () => {
    const friendId = (await prisma.referral.findFirst({ where: { ambassadorId: amb.ambassadorId, status: "rewarded" }, orderBy: { createdAt: "asc" } })).refereeId;
    const del = await admin(request(app).delete(`/api/admin/users/${friendId}`));
    expect(del.status).toBe(409);
  });
});

describe("edge cases", () => {
  it("earns nothing if the ambassador was suspended before the friend paid", async () => {
    const amb = await makeAmbassador("suspended");
    const friend = await signup("late-friend");
    const { code } = await referralOf(amb);
    await authed(request(app).post("/api/referrals/apply"), friend.token).send({ code });
    await admin(request(app).patch(`/api/admin/ambassadors/${amb.ambassadorId}`)).send({ status: "suspended" });
    await buy(friend, await openCourse(1000));
    expect(await prisma.ambassadorEarning.count({ where: { ambassadorId: amb.ambassadorId } })).toBe(0);
    expect((await me(amb)).status).toBe("suspended");
    // A suspended account can't be re-applied for, and gets no dashboard.
    expect((await apply(amb)).status).toBe(400);
    expect((await me(amb)).stats).toBeUndefined();
  });

  it("a friend who applied a code BEFORE the ambassador was approved earns the plain referral credit", async () => {
    const student = await signup("later-amb");
    const friend = await signup("early-friend");
    await apply(student);
    const { code } = await referralOf(student);
    await authed(request(app).post("/api/referrals/apply"), friend.token).send({ code });
    const row = (await admin(request(app).get("/api/admin/ambassadors"))).body.ambassadors.find((a) => a.user.email === student.email);
    await admin(request(app).patch(`/api/admin/ambassadors/${row._id}`)).send({ status: "approved" });
    await buy(friend, await openCourse(1000));
    expect((await referralOf(student)).creditBalance).toBe(500); // the promise made at the time
    expect(await prisma.ambassadorEarning.count({ where: { ambassadorId: row._id } })).toBe(0);
  });

  it("validates and stores the programme settings, and can be switched off", async () => {
    const put = (body) => admin(request(app).put("/api/admin/ambassador-settings")).send(body);
    const ok = await put({ defaultCommissionPercent: 12, holdDays: 3, perks: ["Certificate", " Kit ", ""] });
    expect(ok.body.settings).toMatchObject({ defaultCommissionPercent: 12, holdDays: 3, perks: ["Certificate", "Kit"] });
    for (const bad of [{ defaultCommissionPercent: 80 }, { holdDays: -1 }, { minPayoutRupees: 0 }, { perks: "all of them" }, { enabled: "no" }]) {
      expect((await put(bad)).status).toBe(400);
    }
    await put({ enabled: false });
    const student = await signup("closed");
    expect((await apply(student)).status).toBe(403);
    await put({ enabled: true, defaultCommissionPercent: 10, holdDays: 7 });
  });
});
