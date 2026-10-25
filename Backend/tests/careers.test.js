const crypto = require("crypto");
const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { newStudent } = require("./helpers/newStudent");
const { signToken } = require("../src/utils/jwt");

// The careers flow end to end: signup bonus and credit rules, applying and
// paying the test fee (verified by signature AND webhook, credited once), the
// test engine (server-side paper, clock, scoring, sessions, violations) and the
// admin side. Same stand-ins as the other suites: no PDF work, no real mail, no
// live Razorpay call, no rate limiting.
process.env.RAZORPAY_KEY_SECRET = "careers-test-key-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "careers-test-webhook-secret";

jest.mock("../src/utils/rateLimit", () => ({ publicWriteLimiter: (req, res, next) => next() }));
jest.mock("../src/utils/testRateLimit", () => ({ testApiLimiter: (req, res, next) => next() }));
jest.mock("../src/utils/mailer", () => ({
  sendApplicationEmail: jest.fn(async () => ({})),
  sendWelcomeEmail: jest.fn(async () => ({})),
  sendReceiptEmail: jest.fn(async () => ({})),
  sendContactEmail: jest.fn(async () => ({})),
  sendWalletCreditEmail: jest.fn(async () => ({})),
  sendSignupBonusEmail: jest.fn(async () => ({})),
  sendTestPaymentEmail: jest.fn(async () => ({})),
  sendTestSubmittedEmail: jest.fn(async () => ({})),
  sendApplicationStatusEmail: jest.fn(async () => ({})),
  sendOtpEmail: jest.fn(async () => ({ sent: true })),
}));
jest.mock("../src/utils/receiptPdf", () => ({ buildReceiptPdfBuffer: jest.fn(() => Buffer.from("fake-pdf")) }));
jest.mock("../src/utils/proctorStorage", () => ({
  PENDING_PREFIX: "pending:",
  deleteSnapshot: jest.fn(async () => {}),
  saveSnapshot: jest.fn(async (attemptId) => `local:${attemptId}/test.jpg`),
  readSnapshot: jest.fn(async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
}));
jest.mock("../src/utils/razorpay", () => ({
  isLiveBlocked: false,
  razorpay: { orders: { create: jest.fn(async () => ({ id: `order_job_${Math.random().toString(36).slice(2)}`, currency: "INR" })) } },
}));
const { razorpay } = require("../src/utils/razorpay");
const mailer = require("../src/utils/mailer");

let app, prisma, adminToken, wallet, careers;

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
const asAdmin = (req) => authed(req, adminToken);
let seq = 0;

// A student account made directly (the signup API is rate limited per IP), with
// a token like the one login hands out.
async function student(label = "cand") {
  const user = await prisma.user.create({
    data: { name: "Test Candidate", email: `${label}${++seq}@example.com`, phone: "9876500000", passwordHash: "x", role: "student" },
  });
  return { id: user.id, email: user.email, token: signToken({ sub: user.id, role: "student", email: user.email }, { expiresIn: "1h" }) };
}

const setSettings = (patch) => asAdmin(request(app).put("/api/admin/careers/settings")).send(patch);
const walletOf = async (s) => (await authed(request(app).get("/api/me/wallet"), s.token)).body.wallet;

// Ten questions in each general bank and each technical bank; option 0 is always right.
async function seedBank() {
  const rows = [];
  for (const category of ["quantitative", "logical", "verbal", "web", "fullstack", "datascience"]) {
    for (let n = 1; n <= 10; n++) {
      rows.push({ category, text: `${category} question ${n}`, options: ["right", "wrong one", "wrong two", "wrong three"], correctIndex: 0 });
    }
  }
  await prisma.testQuestion.createMany({ data: rows });
}

async function opening(overrides = {}) {
  const res = await asAdmin(request(app).post("/api/admin/job-openings")).send({
    title: `Web Intern ${++seq}`, summary: "Build things.", techCategory: "web",
    skills: ["HTML", "CSS"], responsibilities: ["Ship pages"], eligibility: ["Freshers welcome"],
    stipend: "Up to ₹6,000/month", experience: "0–1 year", duration: "3 months", mode: "Remote",
    durationMinutes: 30, questionCounts: { quantitative: 2, logical: 2, verbal: 2, technical: 4 },
    marksPerQuestion: 1, negativeMarks: 0.25, cutoffScore: 5,
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.opening;
}

const apply = (s, o) => authed(request(app).post("/api/me/job-applications"), s.token).send({ opening: o.slug });
const createOrder = (s, applicationId) => authed(request(app).post(`/api/me/job-applications/${applicationId}/create-order`), s.token).send({ acceptTerms: true, confirmAdult: true });
const signature = (orderId, paymentId) => crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
const verify = (orderId, paymentId, sig = signature(orderId, paymentId)) =>
  request(app).post("/api/careers/verify").send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig });

// Applies and pays: the application comes back unlocked (test_pending).
async function paidApplication(s, o) {
  const applied = await apply(s, o);
  expect(applied.status).toBeLessThan(300);
  const order = await createOrder(s, applied.body.application._id);
  expect(order.status).toBe(201);
  const paymentId = `pay_${Math.random().toString(36).slice(2)}`;
  const v = await verify(order.body.orderId, paymentId);
  expect(v.status).toBe(200);
  return { applicationId: applied.body.application._id, orderId: order.body.orderId, paymentId };
}

const start = (s, applicationId, body = { consent: true }) =>
  authed(request(app).post(`/api/me/job-applications/${applicationId}/test/start`), s.token).send(body);
const inTest = (req, s, sessionId) => authed(req, s.token).set("X-Test-Session", sessionId);
const answer = (s, t, questionId, selected, extra = {}) =>
  inTest(request(app).put(`/api/me/test/${t.attempt._id}/answers`), s, t.sessionId).send({ questionId, selected, ...extra });
const violate = (s, t, type) => inTest(request(app).post(`/api/me/test/${t.attempt._id}/violations`), s, t.sessionId).send({ type });
const submit = (s, t) => inTest(request(app).post(`/api/me/test/${t.attempt._id}/submit`), s, t.sessionId).send({});

// Paid, started, ready to answer.
async function sitting(o) {
  const s = await student();
  const { applicationId } = await paidApplication(s, o);
  const res = await start(s, applicationId);
  expect(res.status).toBe(200);
  return { s, applicationId, t: res.body };
}

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  wallet = require("../src/utils/wallet");
  careers = require("../src/utils/careers");
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
  await seedBank();
  // Papers come from the bank alone here, so the right answer to every question
  // is known to the tests ("right"). Generated questions have their own tests below.
  await setSettings({ generatedQuestionsPercent: 0 });
}, 180000); // wiping every table plus seeding the bank outruns 60s in a full --runInBand run
afterAll(async () => { await teardownTestDb(); });

describe("signup bonus", () => {
  afterAll(async () => { await setSettings({ signupBonusCredits: 0 }); });

  // The code the last verification email carried.
  const lastCode = () => mailer.sendOtpEmail.mock.calls[mailer.sendOtpEmail.mock.calls.length - 1][0].code;
  const sendCode = (me) => authed(request(app).post("/api/me/signup-bonus/send-code"), me.token).send({});
  const verifyCode = (me, code) => authed(request(app).post("/api/me/signup-bonus/verify"), me.token).send({ code });

  it("holds an email signup's bonus until the email is verified, then gives it once, with an expiry, and tells them", async () => {
    await setSettings({ signupBonusCredits: 300, creditExpiryMonths: 12 });
    const res = await newStudent(app, { name: "Bonus Person", email: "bonus1@example.com", phone: "9876500000", password: "a-real-password" });
    expect(res.status).toBe(201);
    const me = { id: res.body.user.id, token: res.body.token };

    // Nothing to spend yet — a made-up address can't collect it.
    const before = await walletOf(me);
    expect(before).toMatchObject({ balance: 0, pendingBonus: 300 });
    expect(mailer.sendSignupBonusEmail).not.toHaveBeenCalledWith(expect.objectContaining({ to: "bonus1@example.com" }));

    mailer.sendOtpEmail.mockClear();
    expect((await sendCode(me)).status).toBe(200);
    expect(mailer.sendOtpEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "bonus1@example.com", purpose: "verify_email" }));
    // Asking again straight away is refused (no inbox flooding).
    expect((await sendCode(me)).status).toBe(429);
    // A wrong code changes nothing.
    const wrong = lastCode() === "000000" ? "111111" : "000000";
    expect((await verifyCode(me, wrong)).status).toBe(400);
    expect((await walletOf(me)).balance).toBe(0);

    const ok = await verifyCode(me, lastCode());
    expect(ok.status).toBe(200);
    expect(ok.body.credited).toBe(300);

    const w = await walletOf(me);
    expect(w.pendingBonus).toBe(0);
    expect(w.balance).toBe(300);
    expect(w.entries).toHaveLength(1);
    expect(w.entries[0]).toMatchObject({ kind: "signup_bonus", type: "Signup Bonus", amount: 300 });
    const months = (new Date(w.entries[0].expiresAt) - Date.now()) / (30 * 24 * 3600 * 1000);
    expect(months).toBeGreaterThan(11);
    expect(months).toBeLessThan(13);
    expect(mailer.sendSignupBonusEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "bonus1@example.com", credits: 300 }));

    // Granting again (a retried request, two sign-ins racing) changes nothing.
    const user = await prisma.user.findUnique({ where: { id: me.id } });
    const again = await Promise.all([wallet.grantSignupBonus(user), wallet.grantSignupBonus(user), wallet.grantSignupBonus(user)]);
    expect(again).toEqual([0, 0, 0]);
    expect((await walletOf(me)).balance).toBe(300);
    const notes = await authed(request(app).get("/api/me/notifications"), me.token);
    expect(notes.body.unread).toBe(1);
  });

  it("won't release a bonus twice, or to an account that has none waiting", async () => {
    await setSettings({ signupBonusCredits: 300 });
    const res = await newStudent(app, { name: "Twice Person", email: "bonus3@example.com", phone: "9876500000", password: "a-real-password" });
    const me = { id: res.body.user.id, token: res.body.token };
    await sendCode(me);
    const code = lastCode();
    const results = await Promise.all([verifyCode(me, code), verifyCode(me, code)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await walletOf(me)).balance).toBe(300);
    expect((await sendCode(me)).status).toBe(400);

    // An account made before the bonus existed (no flag) can't claim one.
    const old = await student("oldacct");
    expect((await sendCode(old)).status).toBe(400);
  });

  it("keeps the bonus waiting when crediting it fails, so it can be claimed again", async () => {
    await setSettings({ signupBonusCredits: 300 });
    const res = await newStudent(app, { name: "Blip Person", email: "bonus5@example.com", phone: "9876500000", password: "a-real-password" });
    const me = { id: res.body.user.id, token: res.body.token };
    await sendCode(me);
    const create = jest.spyOn(prisma.creditEntry, "create").mockRejectedValueOnce(new Error("database blip"));
    expect((await verifyCode(me, lastCode())).status).toBe(500);
    create.mockRestore();
    expect((await prisma.user.findUnique({ where: { id: me.id } })).signupBonusPending).toBe(true);
    expect(await wallet.claimSignupBonus(me.id)).toBe(300);
    expect(await walletOf(me)).toMatchObject({ balance: 300, pendingBonus: 0 });
  });

  it("says so when the code email can't be sent, and lets them ask again straight away", async () => {
    await setSettings({ signupBonusCredits: 300 });
    const res = await newStudent(app, { name: "No Mail Person", email: "bonus4@example.com", phone: "9876500000", password: "a-real-password" });
    const me = { id: res.body.user.id, token: res.body.token };
    mailer.sendOtpEmail.mockResolvedValueOnce({ sent: false, reason: "Email not configured" });
    const failed = await sendCode(me);
    expect(failed.status).toBe(503);
    expect(failed.body.error).toMatch(/couldn't send/);
    expect((await sendCode(me)).status).toBe(200); // no one-minute lockout after a failed send
  });

  it("gives nothing when the bonus is set to 0", async () => {
    await setSettings({ signupBonusCredits: 0 });
    const res = await newStudent(app, { name: "No Bonus", email: "bonus2@example.com", phone: "9876500000", password: "a-real-password" });
    expect((await walletOf({ token: res.body.token })).balance).toBe(0);
  });
});

describe("credit expiry", () => {
  const day = 24 * 3600 * 1000;
  const at = (daysAgo) => new Date(Date.now() - daysAgo * day);

  it("works out what has lapsed: spending uses the soonest-expiring credit first", () => {
    const { lapsedCredit } = wallet;
    // 300 that expired yesterday, never touched: all of it has lapsed.
    expect(lapsedCredit([{ amount: 30000, kind: "signup_bonus", createdAt: at(400), expiresAt: at(1) }])).toBe(30000);
    // 100 of it was spent while it was still valid: 200 lapsed.
    expect(lapsedCredit([
      { amount: 30000, kind: "signup_bonus", createdAt: at(400), expiresAt: at(1) },
      { amount: -10000, kind: "redeemed", createdAt: at(200), expiresAt: null },
    ])).toBe(20000);
    // Credit that never expires is spent last, so the spend still came out of the bonus.
    expect(lapsedCredit([
      { amount: 50000, kind: "adjustment", createdAt: at(500), expiresAt: null },
      { amount: 30000, kind: "signup_bonus", createdAt: at(400), expiresAt: at(1) },
      { amount: -10000, kind: "redeemed", createdAt: at(200), expiresAt: null },
    ])).toBe(20000);
    // Once an `expired` entry has taken it back, nothing more is due.
    expect(lapsedCredit([
      { amount: 30000, kind: "signup_bonus", createdAt: at(400), expiresAt: at(1) },
      { amount: -30000, kind: "expired", createdAt: at(0.5), expiresAt: null },
    ])).toBe(0);
    // Not yet expired: nothing lapsed.
    expect(lapsedCredit([{ amount: 30000, kind: "signup_bonus", createdAt: at(10), expiresAt: new Date(Date.now() + day) }])).toBe(0);
  });

  it("takes lapsed credit out of the wallet exactly once", async () => {
    const s = await student("expiry");
    await prisma.creditEntry.create({ data: { userId: s.id, amount: 30000, kind: "signup_bonus", createdAt: at(400), expiresAt: at(1) } });
    await prisma.creditEntry.create({ data: { userId: s.id, amount: 20000, kind: "adjustment", createdAt: at(300) } });

    // Several readers at once (two tabs opening the wallet) still write one entry.
    await Promise.all([walletOf(s), walletOf(s), walletOf(s)]);
    const w = await walletOf(s);
    expect(w.balance).toBe(200);
    const expired = w.entries.filter((e) => e.kind === "expired");
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({ amount: -300, type: "Expiry" });

    // Already written off: later reads don't lock the account again.
    const tx = jest.spyOn(prisma, "$transaction");
    expect(await wallet.expireCredits(s.id)).toBe(0);
    expect(tx).not.toHaveBeenCalled();
    tx.mockRestore();
  });
});

describe("credit usage limit at checkout", () => {
  afterAll(async () => { await setSettings({ creditUsagePercent: 100 }); });

  it("caps how much of a purchase credit can pay for", async () => {
    const { priceOrder } = require("../src/utils/referrals");
    const s = await student("usage");
    await prisma.creditEntry.create({ data: { userId: s.id, amount: 500000, kind: "adjustment" } });

    // No cap (the default): credit covers everything, so the wallet can pay alone.
    let p = await priceOrder(s.id, 1000);
    expect(p.walletCoversAll).toBe(true);

    await setSettings({ creditUsagePercent: 50 });
    p = await priceOrder(s.id, 1000);
    expect(p.creditApplied).toBe(50000); // ₹500 of the ₹1,000
    expect(p.payablePaise).toBe(50000);
    expect(p.walletCoversAll).toBe(false);

    await setSettings({ creditUsagePercent: 0 });
    p = await priceOrder(s.id, 1000);
    expect(p.creditApplied).toBe(0);
    expect(p.payablePaise).toBe(100000);
  });
});

describe("careers settings", () => {
  it("are admin-only and validated", async () => {
    const s = await student();
    expect((await authed(request(app).get("/api/admin/careers/settings"), s.token)).status).toBe(403);
    expect((await authed(request(app).put("/api/admin/careers/settings"), s.token).send({ testFeeRupees: 1 })).status).toBe(403);
    expect((await request(app).get("/api/admin/careers/settings")).status).toBe(401);

    for (const bad of [{ testFeeRupees: 0 }, { testFeeRupees: "289" }, { creditUsagePercent: 101 }, { violationLimit: 0 }, { requireWebcam: "yes" }, { creditExpiryMonths: -1 }]) {
      expect((await setSettings(bad)).status).toBe(400);
    }
    const ok = await setSettings({ violationLimit: 3, requireWebcam: true });
    expect(ok.status).toBe(200);
    expect(ok.body.settings).toMatchObject({ testFeeRupees: 289, violationLimit: 3, requireWebcam: true });
  });
});

describe("job openings", () => {
  it("lists open roles publicly, without the cut-off score", async () => {
    const o = await opening({ title: "Public Role" });
    const closed = await opening({ title: "Closed Role", status: "closed" });
    const res = await request(app).get("/api/careers/openings");
    expect(res.status).toBe(200);
    const slugs = res.body.openings.map((x) => x.slug);
    expect(slugs).toContain(o.slug);
    expect(slugs).not.toContain(closed.slug);
    const shown = res.body.openings.find((x) => x.slug === o.slug);
    expect(shown.test).toEqual({ durationMinutes: 30, questions: 10, marksPerQuestion: 1, negativeMarks: 0.25 });
    expect(res.body.terms).toMatchObject({ testFee: 289, creditExpiryMonths: 12 });

    const one = await request(app).get(`/api/careers/openings/${o.slug}`);
    expect(one.body.opening.responsibilities).toEqual(["Ship pages"]);
    expect((await request(app).get("/api/careers/openings/no-such-role")).status).toBe(404);
    // A closed role can't be looked up on its own either.
    expect((await request(app).get(`/api/careers/openings/${closed.slug}`)).status).toBe(404);
  });

  it("can be added, edited and closed by an admin only", async () => {
    const s = await student();
    expect((await authed(request(app).post("/api/admin/job-openings"), s.token).send({ title: "Sneaky" })).status).toBe(403);

    expect((await asAdmin(request(app).post("/api/admin/job-openings")).send({ summary: "no title" })).status).toBe(400);
    expect((await asAdmin(request(app).post("/api/admin/job-openings")).send({ title: "Bad", techCategory: "cooking" })).status).toBe(400);
    expect((await asAdmin(request(app).post("/api/admin/job-openings")).send({ title: "Bad", questionCounts: { quantitative: 0, logical: 0, verbal: 0, technical: 0 } })).status).toBe(400);
    expect((await asAdmin(request(app).post("/api/admin/job-openings")).send({ title: "Bad", durationMinutes: 1 })).status).toBe(400);

    const o = await opening({ title: "Editable Role" });
    const edited = await asAdmin(request(app).put(`/api/admin/job-openings/${o._id}`)).send({ title: "Edited Role", cutoffScore: 7, status: "closed" });
    expect(edited.status).toBe(200);
    expect(edited.body.opening).toMatchObject({ title: "Edited Role", slug: o.slug, status: "closed" });
    expect(edited.body.opening.test.cutoffScore).toBe(7);

    // Two roles with the same title still get different addresses.
    const twin = await opening({ title: "Edited Role" });
    expect(twin.slug).not.toBe(o.slug);

    expect((await asAdmin(request(app).delete(`/api/admin/job-openings/${twin._id}`))).status).toBe(200);
  });

  it("won't delete a role people have applied for", async () => {
    const o = await opening();
    const s = await student();
    await apply(s, o);
    const res = await asAdmin(request(app).delete(`/api/admin/job-openings/${o._id}`));
    expect(res.status).toBe(409);
  });
});

describe("applying and paying the test fee", () => {
  let o;
  beforeAll(async () => { o = await opening(); });

  it("needs a login, an open role, and makes only one application per role", async () => {
    expect((await request(app).post("/api/me/job-applications").send({ opening: o.slug })).status).toBe(401);
    const s = await student();
    expect((await authed(request(app).post("/api/me/job-applications"), s.token).send({})).status).toBe(400);
    expect((await authed(request(app).post("/api/me/job-applications"), s.token).send({ opening: "nope" })).status).toBe(404);
    expect((await authed(request(app).post("/api/me/job-applications"), adminToken).send({ opening: o.slug })).status).toBe(400);

    const closed = await opening({ status: "closed" });
    expect((await apply(s, closed)).status).toBe(400);

    // A double click: both answers are the same application.
    const [a, b] = await Promise.all([apply(s, o), apply(s, o)]);
    expect(a.body.application._id).toBe(b.body.application._id);
    expect(a.body.application.status).toBe("payment_pending");
    expect(await prisma.jobApplication.count({ where: { userId: s.id, openingId: o._id } })).toBe(1);
  });

  it("won't start the payment until the terms are accepted, and records when they were", async () => {
    const s = await student();
    const applied = await apply(s, o);
    const id = applied.body.application._id;
    razorpay.orders.create.mockClear();
    for (const body of [{}, { acceptTerms: false }, { acceptTerms: "yes" }]) {
      const refused = await authed(request(app).post(`/api/me/job-applications/${id}/create-order`), s.token).send(body);
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe("TERMS_REQUIRED");
    }
    expect(razorpay.orders.create).not.toHaveBeenCalled();

    const order = await createOrder(s, id);
    expect(order.status).toBe(201);
    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: order.body.orderId } });
    expect(payment.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it("only takes the fee from candidates who confirm they're 18 or older", async () => {
    const s = await student();
    const applied = await apply(s, o);
    const id = applied.body.application._id;
    razorpay.orders.create.mockClear();
    for (const confirmAdult of [undefined, false, "yes"]) {
      const refused = await authed(request(app).post(`/api/me/job-applications/${id}/create-order`), s.token).send({ acceptTerms: true, confirmAdult });
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe("ADULT_REQUIRED");
    }
    expect(razorpay.orders.create).not.toHaveBeenCalled();
    expect((await createOrder(s, id)).status).toBe(201);
    expect((await prisma.jobApplication.findUnique({ where: { id } })).adultConfirmedAt).toBeInstanceOf(Date);
  });

  it("asks an application paid before the age check to confirm 18+ when starting the test", async () => {
    const s = await student();
    const { applicationId } = await paidApplication(s, o);
    await prisma.jobApplication.update({ where: { id: applicationId }, data: { adultConfirmedAt: null } });
    const refused = await start(s, applicationId, { consent: true });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("ADULT_REQUIRED");
    expect((await start(s, applicationId, { consent: true, adult: true })).status).toBe(200);
    expect((await prisma.jobApplication.findUnique({ where: { id: applicationId } })).adultConfirmedAt).toBeInstanceOf(Date);
  });

  it("charges the admin's fee, never an amount from the browser", async () => {
    const s = await student();
    const applied = await apply(s, o);
    razorpay.orders.create.mockClear();
    const order = await authed(request(app).post(`/api/me/job-applications/${applied.body.application._id}/create-order`), s.token).send({ acceptTerms: true, confirmAdult: true, amount: 100 });
    expect(order.status).toBe(201);
    expect(order.body.amount).toBe(28900);
    expect(razorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 28900, currency: "INR" }));

    // Someone else's application can't be paid for (or even seen).
    const other = await student();
    expect((await createOrder(other, applied.body.application._id)).status).toBe(404);
  });

  it("refuses the fee until the profile has a real name and a phone number", async () => {
    const s = await student();
    await prisma.user.update({ where: { id: s.id }, data: { phone: "", profilePending: true } });
    const id = (await apply(s, o)).body.application._id;
    razorpay.orders.create.mockClear();
    const refused = await createOrder(s, id);
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("PROFILE_INCOMPLETE");
    expect(refused.body.missing).toEqual(["full name", "phone number"]);
    expect(razorpay.orders.create).not.toHaveBeenCalled();

    await authed(request(app).patch("/api/auth/me"), s.token).send({ name: "Real Name", phone: "9876500001" });
    expect((await createOrder(s, id)).status).toBe(201);
  });

  it("makes a candidate wait before re-applying to a free role, but not to a paid one", async () => {
    const free = await opening({ feeRequired: false });
    const s = await student();
    const first = (await apply(s, free)).body.application._id;
    // The application ends without an offer, just now.
    await prisma.jobApplication.update({ where: { id: first }, data: { status: "not_shortlisted", closedAt: new Date() } });
    const refused = await apply(s, free);
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("REAPPLY_COOLDOWN");
    expect(refused.body.error).toMatch(/apply for this role again from/);

    // Once the wait has passed (closed 31 days ago), a new application is allowed.
    await prisma.jobApplication.update({ where: { id: first }, data: { closedAt: new Date(Date.now() - 31 * 86400000) } });
    expect((await apply(s, free)).status).toBe(201);

    // An admin can turn the wait off.
    const t = await student();
    const tFirst = (await apply(t, free)).body.application._id;
    await prisma.jobApplication.update({ where: { id: tFirst }, data: { status: "rejected", closedAt: new Date() } });
    expect((await setSettings({ reapplyCooldownDays: 0 })).status).toBe(200);
    expect((await apply(t, free)).status).toBe(201);
    await setSettings({ reapplyCooldownDays: 30 });

    // Paid roles: no wait (each try needs a new fee).
    const u = await student();
    const paidFirst = (await apply(u, o)).body.application._id;
    await prisma.jobApplication.update({ where: { id: paidFirst }, data: { status: "not_shortlisted", closedAt: new Date() } });
    expect((await apply(u, o)).status).toBe(201);
    expect((await setSettings({ reapplyCooldownDays: 400 })).status).toBe(400);
  });

  it("unlocks a free role's test without payment, once the terms and 18+ box are accepted", async () => {
    const free = await opening({ feeRequired: false });
    expect(free.feeRequired).toBe(false);
    const listed = (await request(app).get("/api/careers/openings")).body.openings.find((x) => x.slug === free.slug);
    expect(listed.feeRequired).toBe(false);

    const s = await student();
    const id = (await apply(s, free)).body.application._id;
    const unlock = (body) => authed(request(app).post(`/api/me/job-applications/${id}/unlock-free`), s.token).send(body);
    expect((await unlock({ confirmAdult: true })).status).toBe(400); // no terms
    expect((await unlock({ acceptTerms: true })).body.code).toBe("ADULT_REQUIRED");
    // A free role never opens the gateway.
    razorpay.orders.create.mockClear();
    expect((await createOrder(s, id)).status).toBe(400);
    expect(razorpay.orders.create).not.toHaveBeenCalled();

    const ok = await unlock({ acceptTerms: true, confirmAdult: true });
    expect(ok.status).toBe(200);
    expect(ok.body.application.status).toBe("test_pending");
    expect((await walletOf(s)).balance).toBe(0); // nothing paid, nothing credited
    expect((await start(s, id)).status).toBe(200);

    // A paid role can't be unlocked this way.
    const t = await student();
    const paidId = (await apply(t, o)).body.application._id;
    const refused = await authed(request(app).post(`/api/me/job-applications/${paidId}/unlock-free`), t.token).send({ acceptTerms: true, confirmAdult: true });
    expect(refused.status).toBe(400);
  });

  it("doesn't unlock anything on a bad signature", async () => {
    const s = await student();
    const applied = await apply(s, o);
    const order = await createOrder(s, applied.body.application._id);
    expect((await verify(order.body.orderId, "pay_fake", "0".repeat(64))).status).toBe(400);
    expect((await verify(order.body.orderId, "pay_fake", "nonsense")).status).toBe(400);
    expect((await request(app).post("/api/careers/verify").send({})).status).toBe(400);

    const row = await prisma.jobApplication.findUnique({ where: { id: applied.body.application._id } });
    expect(row.status).toBe("payment_pending");
    expect((await walletOf(s)).balance).toBe(0);
    // And the test can't be started.
    expect((await start(s, row.id)).status).toBe(400);
  });

  it("on payment: unlocks the test, credits the fee once, and mints one receipt", async () => {
    const s = await student();
    mailer.sendTestPaymentEmail.mockClear();
    const { applicationId, orderId, paymentId } = await paidApplication(s, o);

    const mine = await authed(request(app).get("/api/me/job-applications"), s.token);
    const row = mine.body.applications.find((a) => a._id === applicationId);
    expect(row).toMatchObject({ status: "test_pending", statusLabel: "Test pending" });
    expect(row.paidPaymentId).toBeTruthy();

    let w = await walletOf(s);
    expect(w.balance).toBe(289);
    expect(w.entries[0]).toMatchObject({ kind: "test_fee_credit", type: "Test Payment Credit", amount: 289 });
    expect(w.entries[0].expiresAt).toBeTruthy();

    // The browser confirming again, and Razorpay's webhook arriving, change nothing.
    await verify(orderId, paymentId);
    const event = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paymentId, order_id: orderId } } } });
    const hook = await request(app).post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(event).digest("hex"))
      .send(event);
    expect(hook.status).toBe(200);

    w = await walletOf(s);
    expect(w.balance).toBe(289);
    expect(w.entries.filter((e) => e.kind === "test_fee_credit")).toHaveLength(1);

    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: orderId } });
    expect(payment).toMatchObject({ status: "paid", userId: s.id, receiptItemType: "aptitude_test", receiptTotalPaid: 289 });
    expect(payment.receiptNumber).toMatch(/^CRX-AT-\d{2}-\d{5}$/);
    expect(mailer.sendTestPaymentEmail).toHaveBeenCalledTimes(1);
    expect(mailer.sendTestPaymentEmail).toHaveBeenCalledWith(expect.objectContaining({ to: s.email, credits: 289, amount: 289, receiptNumber: payment.receiptNumber }));

    // The receipt is the buyer's, downloadable like any other.
    const receipt = await authed(request(app).get(`/api/receipts/${payment.id}`), s.token);
    expect(receipt.status).toBe(200);
    expect(receipt.body.receipt.itemType).toBe("aptitude_test");

    // Paying again for an application that is already paid is refused.
    expect((await createOrder(s, applicationId)).status).toBe(400);
  });

  it("credits once when the browser's confirmation and the webhook race", async () => {
    const s = await student();
    const applied = await apply(s, o);
    const order = await createOrder(s, applied.body.application._id);
    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: order.body.orderId } });
    mailer.sendTestPaymentEmail.mockClear();

    await Promise.all(Array.from({ length: 6 }, () => careers.grantTestForPayment(payment, "pay_race")));

    expect(await prisma.creditEntry.count({ where: { userId: s.id, kind: "test_fee_credit" } })).toBe(1);
    expect((await walletOf(s)).balance).toBe(289);
    expect(mailer.sendTestPaymentEmail).toHaveBeenCalledTimes(1);
    expect((await prisma.jobApplication.findUnique({ where: { id: applied.body.application._id } })).status).toBe("test_pending");
  });

  it("the course checkout's verify endpoint doesn't accept a test-fee payment", async () => {
    const s = await student();
    const applied = await apply(s, o);
    const order = await createOrder(s, applied.body.application._id);
    const res = await request(app).post("/api/payments/verify").send({
      razorpay_order_id: order.body.orderId, razorpay_payment_id: "pay_x", razorpay_signature: signature(order.body.orderId, "pay_x"),
    });
    expect(res.status).toBe(404);
    expect((await prisma.jobApplication.findUnique({ where: { id: applied.body.application._id } })).status).toBe("payment_pending");
  });
});

describe("the test engine", () => {
  let o;
  beforeAll(async () => { o = await opening(); });

  it("needs consent, then hands out a paper with no answers in it", async () => {
    const s = await student();
    const { applicationId } = await paidApplication(s, o);

    const info = await authed(request(app).get(`/api/me/job-applications/${applicationId}/test`), s.token);
    expect(info.body).toMatchObject({ state: "ready", rules: { durationMinutes: 30, questions: 10, violationLimit: 3 } });

    expect((await start(s, applicationId, {})).status).toBe(400);
    expect((await start(s, applicationId, { consent: "true" })).status).toBe(400);

    const res = await start(s, applicationId);
    expect(res.status).toBe(200);
    const t = res.body;
    expect(t.questions).toHaveLength(10);
    expect(t.questions.filter((q) => q.category === "web")).toHaveLength(4);
    expect(t.sessionId).toEqual(expect.any(String));
    // Nothing that reaches the browser says which option is right.
    expect(JSON.stringify(res.body)).not.toMatch(/correct/i);
    for (const q of t.questions) {
      expect(Object.keys(q).sort()).toEqual(["category", "categoryLabel", "id", "options", "text"]);
      expect([...q.options].sort()).toEqual(["right", "wrong one", "wrong three", "wrong two"]);
    }
    // The clock is the server's: 30 minutes from the start it recorded.
    expect(new Date(t.attempt.endsAt) - new Date(t.attempt.startedAt)).toBe(30 * 60 * 1000);
    expect(t.attempt.remainingMs).toBeGreaterThan(29 * 60 * 1000);

    const row = await prisma.testAttempt.findUnique({ where: { id: t.attempt._id } });
    expect(row).toMatchObject({ userId: s.id, webcamConsent: true, status: "in_progress" });
    expect(row.device).toMatch(/Desktop|Mobile|Tablet/);
  });

  it("shuffles: different candidates get different papers", async () => {
    const papers = [];
    for (let i = 0; i < 4; i++) {
      const { t } = await sitting(o);
      papers.push(JSON.stringify(t.questions.map((q) => [q.id, q.options])));
    }
    expect(new Set(papers).size).toBeGreaterThan(1);
  });

  it("shows the same paper, answers and clock after a refresh", async () => {
    const { s, applicationId, t } = await sitting(o);
    const q = t.questions[0];
    expect((await answer(s, t, q.id, 2, { marked: true })).status).toBe(200);

    const again = await start(s, applicationId, { consent: true, sessionId: t.sessionId });
    expect(again.status).toBe(200);
    expect(again.body.sessionId).toBe(t.sessionId);
    expect(again.body.questions).toEqual(t.questions);
    expect(again.body.attempt.endsAt).toBe(t.attempt.endsAt);
    expect(again.body.answers).toEqual([{ questionId: q.id, selected: 2, marked: true }]);
    expect(await prisma.testAttempt.count({ where: { applicationId } })).toBe(1);
  });

  it("saves, changes and clears answers; refuses ones that make no sense", async () => {
    const { s, t } = await sitting(o);
    const q = t.questions[1];
    expect((await answer(s, t, q.id, 1)).status).toBe(200);
    expect((await answer(s, t, q.id, 3)).status).toBe(200);
    let saved = await prisma.testAnswer.findMany({ where: { attemptId: t.attempt._id } });
    expect(saved).toHaveLength(1);
    expect(saved[0].selected).toBe(3);

    // Marking for review alone keeps the chosen option.
    expect((await inTest(request(app).put(`/api/me/test/${t.attempt._id}/answers`), s, t.sessionId).send({ questionId: q.id, marked: true })).status).toBe(200);
    saved = await prisma.testAnswer.findMany({ where: { attemptId: t.attempt._id } });
    expect(saved[0]).toMatchObject({ selected: 3, marked: true });

    expect((await answer(s, t, q.id, null)).status).toBe(200);
    expect((await prisma.testAnswer.findFirst({ where: { attemptId: t.attempt._id } })).selected).toBeNull();

    expect((await answer(s, t, q.id, 4)).status).toBe(400);
    expect((await answer(s, t, q.id, -1)).status).toBe(400);
    expect((await answer(s, t, q.id, "0")).status).toBe(400);
    expect((await answer(s, t, "not-a-question", 0)).status).toBe(400);
  });

  it("is one candidate's: nobody else can read or answer it", async () => {
    const { applicationId, t } = await sitting(o);
    const other = await student();
    expect((await start(other, applicationId)).status).toBe(404);
    expect((await answer(other, t, t.questions[0].id, 0)).status).toBe(404);
    expect((await submit(other, t)).status).toBe(404);
    expect((await request(app).put(`/api/me/test/${t.attempt._id}/answers`).send({})).status).toBe(401);
  });

  it("blocks a second window while the first is active, and lets a reconnect take over", async () => {
    const { s, applicationId, t } = await sitting(o);

    // Another tab or device: refused while the first session is calling in.
    const second = await start(s, applicationId);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("session");
    // And a made-up session can't answer.
    expect((await inTest(request(app).put(`/api/me/test/${t.attempt._id}/answers`), s, "someone-else").send({ questionId: t.questions[0].id, selected: 0 })).status).toBe(409);
    expect((await inTest(request(app).post(`/api/me/test/${t.attempt._id}/heartbeat`), s, t.sessionId).send({})).status).toBe(200);

    // The first session goes quiet (tab closed, connection lost): now a new one may take over...
    await prisma.testAttempt.update({ where: { id: t.attempt._id }, data: { sessionSeenAt: new Date(Date.now() - 60 * 1000) } });
    const takeover = await start(s, applicationId);
    expect(takeover.status).toBe(200);
    expect(takeover.body.sessionId).not.toBe(t.sessionId);
    expect(takeover.body.attempt.endsAt).toBe(t.attempt.endsAt); // same clock: no time gained
    // ...and the old session is shut out.
    expect((await answer(s, t, t.questions[0].id, 0)).status).toBe(409);
    expect((await answer(s, takeover.body, t.questions[0].id, 0)).status).toBe(200);
  });

  it("refuses answers after the end time and submits the test by itself", async () => {
    const { s, t } = await sitting(o);
    expect((await answer(s, t, t.questions[0].id, 0)).status).toBe(200);
    // The clock runs out (moved on the server — nothing the browser does can move it).
    await prisma.testAttempt.update({ where: { id: t.attempt._id }, data: { endsAt: new Date(Date.now() - 10 * 1000) } });

    const late = await answer(s, t, t.questions[1].id, 0);
    expect(late.status).toBe(409);
    expect(late.body).toMatchObject({ code: "submitted", reason: "time_up" });

    const row = await prisma.testAttempt.findUnique({ where: { id: t.attempt._id }, include: { answers: true } });
    expect(row).toMatchObject({ status: "submitted", submitReason: "time_up" });
    expect(row.answers).toHaveLength(1); // the late answer was not saved
    expect(row.submittedAt.getTime()).toBe(row.endsAt.getTime());
  });

  it("auto-submits a test nobody came back to, when it is next looked at", async () => {
    const { s, applicationId, t } = await sitting(o);
    await prisma.testAttempt.update({ where: { id: t.attempt._id }, data: { endsAt: new Date(Date.now() - 60 * 1000) } });
    const mine = await authed(request(app).get("/api/me/job-applications"), s.token);
    const row = mine.body.applications.find((a) => a._id === applicationId);
    expect(row.status).toBe("submitted");
    expect(row.attempt).toMatchObject({ status: "submitted", submitReason: "time_up" });
  });

  it("scores on the server, with negative marking, and never tells the candidate the score", async () => {
    const { s, applicationId, t } = await sitting(o);
    mailer.sendTestSubmittedEmail.mockClear();
    // 6 right, 2 wrong, 2 left blank => 6 - 2 x 0.25 = 5.5 out of 10.
    for (let i = 0; i < 6; i++) await answer(s, t, t.questions[i].id, t.questions[i].options.indexOf("right"));
    for (let i = 6; i < 8; i++) await answer(s, t, t.questions[i].id, t.questions[i].options.indexOf("wrong one"));

    const done = await submit(s, t);
    expect(done.status).toBe(200);
    expect(done.body).toEqual({ ok: true, submitted: true, reason: "manual" });

    const row = await prisma.testAttempt.findUnique({ where: { id: t.attempt._id } });
    expect(row).toMatchObject({ status: "submitted", score: 5.5, maxScore: 10, correctCount: 6, wrongCount: 2, passed: true });
    expect(Object.values(row.categoryScores).reduce((n, c) => n + c.total, 0)).toBe(10);
    expect(mailer.sendTestSubmittedEmail).toHaveBeenCalledTimes(1);

    // Nothing the candidate can load says how they did: not the score, the marks
    // per category, the number right or wrong, or whether they cleared the cut-off.
    const mine = await authed(request(app).get("/api/me/job-applications"), s.token);
    const app1 = mine.body.applications.find((a) => a._id === applicationId);
    expect(app1.status).toBe("submitted");
    const info = await authed(request(app).get(`/api/me/job-applications/${applicationId}/test`), s.token);
    const notes = await authed(request(app).get("/api/me/notifications"), s.token);
    for (const body of [done.body, mine.body, info.body, notes.body]) {
      expect(JSON.stringify(body)).not.toMatch(/score|correctCount|wrongCount|passed|cutoff/i);
    }
    // A leftover "show the score" setting from before this rule changes nothing.
    await prisma.setting.update({ where: { key: "careers" }, data: { value: { ...(await prisma.setting.findUnique({ where: { key: "careers" } })).value, showScoreImmediately: true } } });
    const still = await authed(request(app).get("/api/me/job-applications"), s.token);
    expect(JSON.stringify(still.body)).not.toMatch(/score|correctCount/i);

    // One attempt per payment: it can't be started, answered or submitted again.
    expect((await start(s, applicationId)).status).toBe(409);
    expect((await answer(s, t, t.questions[0].id, 1)).status).toBe(409);
    expect((await submit(s, t)).body.submitted).toBe(true);
    expect((await prisma.testAttempt.findUnique({ where: { id: t.attempt._id } })).score).toBe(5.5);
    expect(mailer.sendTestSubmittedEmail).toHaveBeenCalledTimes(1);
  });

  it("starting twice at once still makes one attempt", async () => {
    const s = await student();
    const { applicationId } = await paidApplication(s, o);
    const results = await Promise.all([start(s, applicationId), start(s, applicationId), start(s, applicationId)]);
    expect(await prisma.testAttempt.count({ where: { applicationId } })).toBe(1);
    expect(results.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
  });

  it("logs every violation and submits the test at the limit", async () => {
    const { s, t } = await sitting(o);
    const gap = () => new Promise((r) => setTimeout(r, 1600));

    // Blocked copy / right-click attempts are logged but don't count.
    expect((await violate(s, t, "copy")).body).toMatchObject({ counted: false, count: 0 });
    expect((await violate(s, t, "context_menu")).body).toMatchObject({ counted: false, count: 0 });
    expect((await violate(s, t, "made_up")).status).toBe(400);

    // One tab switch fires two events at once: it counts as one violation.
    const [a, b] = await Promise.all([violate(s, t, "tab_switch"), violate(s, t, "window_blur")]);
    expect([a.body.counted, b.body.counted].filter(Boolean)).toHaveLength(1);
    expect(Math.max(a.body.count, b.body.count)).toBe(1);

    await gap();
    expect((await violate(s, t, "fullscreen_exit")).body).toMatchObject({ counted: true, count: 2, limit: 3, submitted: false });
    await gap();
    const third = await violate(s, t, "tab_switch");
    expect(third.body).toMatchObject({ counted: true, count: 3, submitted: true });

    const row = await prisma.testAttempt.findUnique({ where: { id: t.attempt._id }, include: { violations: true } });
    expect(row).toMatchObject({ status: "submitted", submitReason: "violations", violationCount: 3 });
    expect(row.violations).toHaveLength(6);
    expect(row.violations.every((v) => v.createdAt instanceof Date)).toBe(true);
    // And the test is over for the browser too.
    expect((await answer(s, t, t.questions[0].id, 0)).status).toBe(409);
  }, 30000);

  it("stores a snapshot's file key (not the image) and flags what face detection saw", async () => {
    const { s, t } = await sitting(o);
    const { saveSnapshot } = require("../src/utils/proctorStorage");
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1), Buffer.from([0xff, 0xd9])]);
    const upload = (body, type = "image/jpeg", flag) => {
      const r = inTest(request(app).post(`/api/me/test/${t.attempt._id}/snapshots`), s, t.sessionId).set("Content-Type", type);
      if (flag) r.set("X-Face-Flag", flag);
      return r.send(body);
    };

    expect((await upload(Buffer.from("not an image"))).status).toBe(400);
    const ok = await upload(jpeg, "image/jpeg", "no_face");
    expect(ok.status).toBe(201);
    expect(saveSnapshot).toHaveBeenCalledWith(t.attempt._id, expect.any(Buffer));
    const rows = await prisma.testSnapshot.findMany({ where: { attemptId: t.attempt._id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ storageKey: `local:${t.attempt._id}/test.jpg`, flag: "no_face" });
    // The flag is on the violation log, without counting toward the limit.
    const flagged = await prisma.testViolation.findFirst({ where: { attemptId: t.attempt._id, type: "no_face" } });
    expect(flagged.counted).toBe(false);
    // Sent again straight away: refused, so it can't be used to fill the disk.
    expect((await upload(jpeg)).status).toBe(429);
  });

  it("lets only one of a burst of snapshots in", async () => {
    const { s, t } = await sitting(o);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1), Buffer.from([0xff, 0xd9])]);
    const send = () => inTest(request(app).post(`/api/me/test/${t.attempt._id}/snapshots`), s, t.sessionId).set("Content-Type", "image/jpeg").send(jpeg);
    const results = await Promise.all([send(), send(), send(), send(), send()]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 429)).toHaveLength(4);
    const rows = await prisma.testSnapshot.findMany({ where: { attemptId: t.attempt._id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].storageKey).toBe(`local:${t.attempt._id}/test.jpg`);
  });

  it("flags a webcam-required test that sent no photos at all", async () => {
    const { s, t } = await sitting(o);
    // As if the candidate had been answering for two minutes with the photos blocked.
    await prisma.testAttempt.update({ where: { id: t.attempt._id }, data: { startedAt: new Date(Date.now() - 2 * 60 * 1000) } });
    expect((await inTest(request(app).post(`/api/me/test/${t.attempt._id}/submit`), s, t.sessionId).send({})).status).toBe(200);
    const flagged = await prisma.testViolation.findFirst({ where: { attemptId: t.attempt._id, type: "webcam_off" } });
    expect(flagged).toMatchObject({ counted: false, detail: expect.stringMatching(/No webcam photos/) });
  });

  it("only runs in the desktop app when the admin requires it", async () => {
    const s = await student();
    const { applicationId } = await paidApplication(s, o);
    await setSettings({ requireDesktopApp: true });
    process.env.LOCKDOWN_APP_SECRET = "lockdown-test-secret";
    try {
      expect((await start(s, applicationId)).status).toBe(403);
      const ts = String(Date.now());
      const good = `${ts}.${crypto.createHmac("sha256", "lockdown-test-secret").update(`${s.id}.${ts}`).digest("hex")}`;
      const forged = `${ts}.${crypto.createHmac("sha256", "wrong-secret").update(`${s.id}.${ts}`).digest("hex")}`;
      expect((await authed(request(app).post(`/api/me/job-applications/${applicationId}/test/start`), s.token).set("X-Crix-App-Token", forged).send({ consent: true })).status).toBe(403);
      const res = await authed(request(app).post(`/api/me/job-applications/${applicationId}/test/start`), s.token).set("X-Crix-App-Token", good).send({ consent: true });
      expect(res.status).toBe(200);
      expect((await prisma.testAttempt.findUnique({ where: { id: res.body.attempt._id } })).viaDesktopApp).toBe(true);
    } finally {
      await setSettings({ requireDesktopApp: false });
      delete process.env.LOCKDOWN_APP_SECRET;
    }
  });
});

describe("generated questions", () => {
  let o;
  beforeAll(async () => { o = await opening(); await setSettings({ generatedQuestionsPercent: 50 }); });
  afterAll(async () => { await setSettings({ generatedQuestionsPercent: 0 }); });

  it("make up their share of the paper, never show the answer, and are scored like any other", async () => {
    const { s, applicationId, t } = await sitting(o);
    expect(t.questions).toHaveLength(10);
    expect(JSON.stringify(t)).not.toMatch(/"correct"|"generated"/i);

    const row = await prisma.testAttempt.findUnique({ where: { id: t.attempt._id } });
    const generated = row.paper.filter((q) => q.generated);
    // Half of each section: 1 + 1 + 1 of the general ones and 2 of the 4 technical.
    expect(generated).toHaveLength(5);
    expect(generated.filter((q) => q.category === "web")).toHaveLength(2);
    for (const q of generated) {
      expect(q.qid).toMatch(/^gen_[0-9a-f]{16}$/);
      expect(new Set(q.options).size).toBe(4);
    }

    // The same paper comes back after a refresh: nothing is regenerated.
    const again = await start(s, applicationId, { consent: true, sessionId: t.sessionId });
    expect(again.body.questions).toEqual(t.questions);

    // Two generated questions answered correctly, one wrongly: 2 - 0.25.
    await answer(s, t, generated[0].qid, generated[0].correct);
    await answer(s, t, generated[1].qid, generated[1].correct);
    await answer(s, t, generated[2].qid, (generated[2].correct + 1) % 4);
    await submit(s, t);
    const done = await prisma.testAttempt.findUnique({ where: { id: t.attempt._id } });
    expect(done).toMatchObject({ score: 1.75, correctCount: 2, wrongCount: 1 });

    const review = await asAdmin(request(app).get(`/api/admin/job-applications/${applicationId}`));
    expect(review.body.review.questions.filter((q) => q.generated)).toHaveLength(5);
  });

  it("differ from one candidate to the next", async () => {
    const papers = [];
    for (let i = 0; i < 3; i++) {
      const { t } = await sitting(o);
      const row = await prisma.testAttempt.findUnique({ where: { id: t.attempt._id } });
      papers.push(row.paper.filter((q) => q.generated).map((q) => q.text).sort().join("|"));
    }
    expect(new Set(papers).size).toBe(3);
  });

  it("fill in for a bank that is too small", async () => {
    const big = await opening({ questionCounts: { quantitative: 14, logical: 0, verbal: 0, technical: 0 } });
    await setSettings({ generatedQuestionsPercent: 10 });
    const { t } = await sitting(big);
    // The bank holds 10 quantitative questions; the other 4 are generated.
    expect(t.questions).toHaveLength(14);
    await setSettings({ generatedQuestionsPercent: 50 });
  });
});

describe("question bank (admin)", () => {
  it("adds, edits, filters and deletes questions", async () => {
    const s = await student();
    expect((await authed(request(app).get("/api/admin/test-questions"), s.token)).status).toBe(403);

    const bad = [
      { category: "cooking", text: "Q", options: ["a", "b"], correctIndex: 0 },
      { category: "web", text: "", options: ["a", "b"], correctIndex: 0 },
      { category: "web", text: "Q", options: ["only one"], correctIndex: 0 },
      { category: "web", text: "Q", options: ["a", "a"], correctIndex: 0 },
      { category: "web", text: "Q", options: ["a", "b"], correctIndex: 2 },
      { category: "web", text: "Q", options: ["a", "b"] },
    ];
    for (const body of bad) expect((await asAdmin(request(app).post("/api/admin/test-questions")).send(body)).status).toBe(400);

    const made = await asAdmin(request(app).post("/api/admin/test-questions")).send({ category: "verbal", text: "Pick the unusual zebra word", options: ["a", "b", "c"], correctIndex: 2 });
    expect(made.status).toBe(201);
    const id = made.body.question._id;

    const found = await asAdmin(request(app).get("/api/admin/test-questions?category=verbal&q=zebra"));
    expect(found.body.questions).toHaveLength(1);
    expect(found.body.bank.verbal).toBe(11);

    // Shrinking the options below the correct answer's position is refused.
    expect((await asAdmin(request(app).put(`/api/admin/test-questions/${id}`)).send({ options: ["a", "b"] })).status).toBe(400);
    const off = await asAdmin(request(app).put(`/api/admin/test-questions/${id}`)).send({ active: false, correctIndex: 0 });
    expect(off.body.question).toMatchObject({ active: false, correctIndex: 0 });
    expect((await asAdmin(request(app).get("/api/admin/test-questions?active=false"))).body.questions.map((q) => q._id)).toContain(id);

    expect((await asAdmin(request(app).delete(`/api/admin/test-questions/${id}`))).status).toBe(200);
    expect((await asAdmin(request(app).delete(`/api/admin/test-questions/${id}`))).status).toBe(404);
  });

  const upload = (body) => asAdmin(request(app).post("/api/admin/test-questions/import")).set("Content-Type", "application/octet-stream").send(body);

  it("bulk-uploads a CSV, reporting the rows it couldn't use", async () => {
    const csv = [
      "Category,Question,Option1,Option2,Option3,Option4,Correct",
      'Logical Reasoning,"Import: which, of these, is odd?",1,2,3,5,4',
      "datascience,Import: pick B,alpha,beta,gamma,,B",
      "Quantitative,Import: answer by text,10,20,30,40,30",
      "Cooking,Import: bad category,a,b,c,d,1",
      "web,Import: bad answer,a,b,c,d,9",
      "web,,a,b,c,d,1",
      // A blank option before a filled one would shift the answer onto the wrong option.
      "web,Import: gap,a,,c,d,3",
    ].join("\r\n");
    const res = await upload(Buffer.from(csv, "utf8"));
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(3);
    expect(res.body.errors.map((e) => e.row)).toEqual([5, 6, 7, 8]);
    expect(res.body.errors[3].error).toMatch(/Option 2 is empty/);

    const odd = await prisma.testQuestion.findFirst({ where: { text: "Import: which, of these, is odd?" } });
    expect(odd).toMatchObject({ category: "logical", correctIndex: 3, options: ["1", "2", "3", "5"] });
    expect(await prisma.testQuestion.findFirst({ where: { text: "Import: pick B" } })).toMatchObject({ category: "datascience", correctIndex: 1, options: ["alpha", "beta", "gamma"] });
    expect((await prisma.testQuestion.findFirst({ where: { text: "Import: answer by text" } })).correctIndex).toBe(2);
    await prisma.testQuestion.deleteMany({ where: { text: { startsWith: "Import:" } } });
  });

  it("bulk-uploads an Excel file", async () => {
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Questions");
    sheet.addRow(["category", "question", "option1", "option2", "option3", "option4", "correct"]);
    sheet.addRow(["Web Development", "Excel: which tag makes a link?", "<a>", "<p>", "<div>", "<span>", 1]);
    sheet.addRow(["verbal", "Excel: opposite of hot", "warm", "cold", "", "", "B"]);
    const res = await upload(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    expect(await prisma.testQuestion.findFirst({ where: { text: "Excel: which tag makes a link?" } })).toMatchObject({ category: "web", correctIndex: 0 });
    expect(await prisma.testQuestion.findFirst({ where: { text: "Excel: opposite of hot" } })).toMatchObject({ options: ["warm", "cold"], correctIndex: 1 });
    await prisma.testQuestion.deleteMany({ where: { text: { startsWith: "Excel:" } } });
    // Longer than the default: this is the first test to load the Excel library,
    // which is slow to load under jest.
  }, 90000);

  it("refuses a file with the wrong columns, or nothing in it", async () => {
    expect((await upload(Buffer.from("name,age\nA,1\n"))).status).toBe(400);
    expect((await upload(Buffer.from("category,question,option1,option2,correct\n"))).status).toBe(400);
    expect((await upload(Buffer.from("PK not really a workbook"))).status).toBe(400);
  });
});

describe("applicants (admin)", () => {
  let o, s, applicationId, t;
  beforeAll(async () => {
    o = await opening({ title: "Review Role" });
    ({ s, applicationId, t } = await sitting(o));
    await answer(s, t, t.questions[0].id, t.questions[0].options.indexOf("right"));
    await answer(s, t, t.questions[1].id, t.questions[1].options.indexOf("wrong two"));
    await violate(s, t, "tab_switch");
    await submit(s, t);
  });

  it("lists applicants with payment, score, violations and totals", async () => {
    expect((await authed(request(app).get("/api/admin/job-applications"), s.token)).status).toBe(403);
    const res = await asAdmin(request(app).get(`/api/admin/job-applications?openingId=${o._id}`));
    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0]).toMatchObject({
      status: "submitted", paymentStatus: "paid",
      user: { name: "Test Candidate", email: s.email },
      opening: { title: "Review Role" },
      attempt: { score: 0.75, maxScore: 10, violationCount: 1, passed: false },
    });
    expect(res.body.summary.totalApplicants).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.paymentsReceived).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.averageScore).toEqual(expect.any(Number));

    const searched = await asAdmin(request(app).get(`/api/admin/job-applications?q=${encodeURIComponent(s.email)}&status=submitted`));
    expect(searched.body.applications.map((a) => a._id)).toEqual([applicationId]);
    expect((await asAdmin(request(app).get("/api/admin/job-applications?status=selected&openingId=" + o._id))).body.applications).toHaveLength(0);
  });

  it("shows the full review: answers, category scores, violations, snapshots", async () => {
    const res = await asAdmin(request(app).get(`/api/admin/job-applications/${applicationId}`));
    expect(res.status).toBe(200);
    const { review, payment } = res.body;
    expect(payment).toMatchObject({ amount: 289 });
    expect(review.questions).toHaveLength(10);
    expect(review.consentAt).toBe(review.startedAt);
    expect(review.adultConfirmedAt).toEqual(expect.any(String));
    expect(review.questions.map((q) => q.outcome).sort()).toEqual(["correct", ...Array(8).fill("skipped"), "wrong"].sort());
    const right = review.questions.find((q) => q.outcome === "correct");
    expect(right.options[right.correct]).toBe("right");
    expect(review.violations).toEqual([expect.objectContaining({ type: "tab_switch", counted: true })]);
    expect(review.browser).toBeTruthy();
    expect((await asAdmin(request(app).get("/api/admin/job-applications/nope"))).status).toBe(404);
  });

  it("serves a snapshot image to admins only", async () => {
    const attempt = await prisma.testAttempt.findUnique({ where: { applicationId } });
    const snap = await prisma.testSnapshot.create({ data: { attemptId: attempt.id, storageKey: "local:x/y.jpg" } });
    expect((await authed(request(app).get(`/api/admin/test-snapshots/${snap.id}`), s.token)).status).toBe(403);
    const res = await asAdmin(request(app).get(`/api/admin/test-snapshots/${snap.id}`));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/jpeg/);
  });

  it("moves an application through its statuses, telling the candidate each time", async () => {
    const act = (body) => asAdmin(request(app).post(`/api/admin/job-applications/${applicationId}/status`)).send(body);
    mailer.sendApplicationStatusEmail.mockClear();
    await authed(request(app).post("/api/me/notifications/read"), s.token);

    expect((await authed(request(app).post(`/api/admin/job-applications/${applicationId}/status`), s.token).send({ action: "select" })).status).toBe(403);
    expect((await act({ action: "promote" })).status).toBe(400);
    // Not from "submitted" straight to an offer.
    expect((await act({ action: "select" })).status).toBe(400);

    expect((await act({ action: "shortlist" })).body.application.status).toBe("shortlisted");
    // The candidate doesn't see interview details until there are some.
    let mine = (await authed(request(app).get("/api/me/job-applications"), s.token)).body.applications.find((a) => a._id === applicationId);
    expect(mine).toMatchObject({ status: "shortlisted", interview: null });

    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    expect((await act({ action: "schedule_interview" })).status).toBe(400);
    expect((await act({ action: "schedule_interview", interviewAt: future, interviewLink: "javascript:alert(1)" })).status).toBe(400);
    expect((await act({ action: "schedule_interview", interviewAt: "2020-01-01T10:00:00.000Z", interviewLink: "https://meet.example.com/x" })).status).toBe(400);
    const scheduled = await act({ action: "schedule_interview", interviewAt: future, interviewLink: "https://meet.example.com/abc" });
    expect(scheduled.body.application).toMatchObject({ status: "interview_scheduled", interviewLink: "https://meet.example.com/abc" });

    mine = (await authed(request(app).get("/api/me/job-applications"), s.token)).body.applications.find((a) => a._id === applicationId);
    expect(mine.interview).toEqual({ at: future, link: "https://meet.example.com/abc" });

    expect((await act({ action: "select", note: "Strong interview" })).body.application).toMatchObject({ status: "selected", adminNote: "Strong interview" });
    // Final: nothing further.
    expect((await act({ action: "reject" })).status).toBe(400);

    expect(mailer.sendApplicationStatusEmail.mock.calls.map((c) => c[0].status)).toEqual(["shortlisted", "interview_scheduled", "selected"]);
    expect(mailer.sendApplicationStatusEmail).toHaveBeenLastCalledWith(expect.objectContaining({ to: s.email, roleTitle: "Review Role" }));
    const notes = await authed(request(app).get("/api/me/notifications"), s.token);
    expect(notes.body.unread).toBe(3);
    expect(notes.body.notifications[0].title).toBe("You're selected");
    // The admin's private note never reaches the candidate.
    expect(JSON.stringify(mine)).not.toMatch(/adminNote/);
  });

  it("lets a candidate apply again after not being shortlisted", async () => {
    const { s: s2, applicationId: first, t: t2 } = await sitting(o);
    await submit(s2, t2);
    expect((await apply(s2, o)).body.application._id).toBe(first); // still open: same one
    await asAdmin(request(app).post(`/api/admin/job-applications/${first}/status`)).send({ action: "not_shortlist" });
    const again = await apply(s2, o);
    expect(again.status).toBe(201);
    expect(again.body.application._id).not.toBe(first);
    expect(again.body.application.status).toBe("payment_pending");
  });

  it("exports applicants and results to Excel", async () => {
    expect((await authed(request(app).get("/api/admin/job-applications/export"), s.token)).status).toBe(403);
    const res = await asAdmin(request(app).get(`/api/admin/job-applications/export?openingId=${o._id}`)).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/spreadsheetml/);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="crix-applicants-.*\.xlsx"/);

    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const sheet = wb.worksheets[0];
    const header = sheet.getRow(1).values.slice(1);
    expect(header).toEqual(expect.arrayContaining(["Name", "Email", "Role", "Status", "Payment", "Score", "Violations"]));
    // One column per section, whichever bank the role drew from.
    expect(header).toEqual(expect.arrayContaining(["Quantitative", "Logical Reasoning", "Verbal Ability", "Technical", "Technical questions from"]));
    expect(header).not.toContain("Quantitative (foundation)");
    const emails = [];
    sheet.eachRow((row, n) => { if (n > 1) emails.push(row.getCell(header.indexOf("Email") + 1).text); });
    expect(emails).toContain(s.email);
    const mineRow = sheet.getRow(emails.indexOf(s.email) + 2);
    expect(mineRow.getCell(header.indexOf("Status") + 1).text).toBe("Selected");
    expect(mineRow.getCell(header.indexOf("Score") + 1).value).toBe(0.75);
    expect(mineRow.getCell(header.indexOf("Technical questions from") + 1).text).toBe("Web Development");
  });

  it("lists wallet balances", async () => {
    expect((await authed(request(app).get("/api/admin/wallets"), s.token)).status).toBe(403);
    const res = await asAdmin(request(app).get(`/api/admin/wallets?q=${encodeURIComponent(s.email)}`));
    expect(res.status).toBe(200);
    expect(res.body.wallets).toEqual([expect.objectContaining({ email: s.email, balance: 289 })]);
    expect(res.body.summary.outstanding).toBeGreaterThanOrEqual(289);
  });

  it("leaves credit that has lapsed out of the wallet balances", async () => {
    const away = await student("lapsed");
    const day = 24 * 3600 * 1000;
    // 300 that expired yesterday (never written off: they haven't been back) and 100 that never expires.
    await prisma.creditEntry.create({ data: { userId: away.id, amount: 30000, kind: "signup_bonus", createdAt: new Date(Date.now() - 400 * day), expiresAt: new Date(Date.now() - day) } });
    await prisma.creditEntry.create({ data: { userId: away.id, amount: 10000, kind: "adjustment" } });
    const res = await asAdmin(request(app).get(`/api/admin/wallets?q=${encodeURIComponent(away.email)}`));
    expect(res.body.wallets).toEqual([expect.objectContaining({ email: away.email, balance: 100 })]);
  });
});
