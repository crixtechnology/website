const crypto = require("crypto");
const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// Free internships: roles listed only on the unlinked /free-internships page,
// unlocked only once the candidate has uploaded a CV (a PDF) and filled in their
// education. Nothing is paid: there is no processing fee. Same stand-ins as careers.test.js: no real
// mail, storage, Razorpay call or rate limiting.
process.env.RAZORPAY_KEY_SECRET = "free-internships-key-secret";
jest.mock("../src/utils/rateLimit", () => ({ publicWriteLimiter: (req, res, next) => next() }));
jest.mock("../src/utils/testRateLimit", () => ({ testApiLimiter: (req, res, next) => next() }));
jest.mock("../src/utils/mailer", () => ({
  sendWelcomeEmail: jest.fn(async () => ({})),
  sendTestSubmittedEmail: jest.fn(async () => ({})),
  sendApplicationStatusEmail: jest.fn(async () => ({})),
  sendTestPaymentEmail: jest.fn(async () => ({})),
}));
jest.mock("../src/utils/receiptPdf", () => ({ buildReceiptPdfBuffer: jest.fn(() => Buffer.from("fake-pdf")) }));
jest.mock("../src/utils/razorpay", () => ({
  isLiveBlocked: false,
  razorpay: { orders: { create: jest.fn(async () => ({ id: `order_free_${Math.random().toString(36).slice(2)}`, currency: "INR" })) } },
}));
jest.mock("../src/utils/proctorStorage", () => ({
  PENDING_PREFIX: "pending:",
  deleteSnapshot: jest.fn(async () => {}),
  saveSnapshot: jest.fn(async (attemptId) => `local:${attemptId}/test.jpg`),
  saveCv: jest.fn(async (applicationId) => `local:cv-${applicationId}/cv.pdf`),
  readSnapshot: jest.fn(async () => Buffer.from("%PDF-1.4 stored")),
  describeStorageError: (err) => `${err.name}: ${err.message}`,
  checkStorage: jest.fn(async () => ({ inBucket: true, message: "stored in bucket", results: [{ area: "CVs", ok: false, error: "AccessDenied (HTTP 403): not entitled" }, { area: "Webcam photos", ok: true }] })),
}));
const storage = require("../src/utils/proctorStorage");
const mailer = require("../src/utils/mailer");

let app, prisma, adminToken;
let seq = 0;

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
const asAdmin = (req) => authed(req, adminToken);
const PDF = Buffer.from("%PDF-1.4\n% a tiny test CV\n%%EOF");

const EDUCATION = { college: "Gujarat University", course: "B.Com", department: "Commerce", semester: "4", passingYear: 2028 };

async function student(extra = EDUCATION) {
  const user = await prisma.user.create({
    data: { name: "Free Intern Student", email: `free${++seq}@example.com`, phone: "9876500000", passwordHash: "x", role: "student", ...extra },
  });
  return { id: user.id, email: user.email, token: signToken({ sub: user.id, role: "student", email: user.email }, { expiresIn: "1h" }) };
}

async function opening(overrides = {}) {
  const res = await asAdmin(request(app).post("/api/admin/job-openings")).send({
    title: `Free Intern ${++seq}`, summary: "Learn by building.", techCategory: "web",
    durationMinutes: 20, questionCounts: { quantitative: 1, logical: 1, verbal: 1, technical: 1 },
    audience: "free",
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.opening;
}

const apply = (s, o) => authed(request(app).post("/api/me/job-applications"), s.token).send({ opening: o.slug });
const uploadCv = (s, id, body = PDF, type = "application/pdf") =>
  authed(request(app).put(`/api/me/job-applications/${id}/cv`), s.token).set("Content-Type", type).set("X-File-Name", encodeURIComponent("My CV (final).pdf")).send(body);
const createOrder = (s, id) => authed(request(app).post(`/api/me/job-applications/${id}/create-order`), s.token).send({ acceptTerms: true, confirmAdult: true });
const verify = (orderId, paymentId) => request(app).post("/api/careers/verify").send({
  razorpay_order_id: orderId, razorpay_payment_id: paymentId,
  razorpay_signature: crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex"),
});
const unlock = (s, id) => authed(request(app).post(`/api/me/job-applications/${id}/unlock-free`), s.token).send({ acceptTerms: true, confirmAdult: true });

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin-free@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
  const rows = [];
  for (const category of ["quantitative", "logical", "verbal", "web"]) {
    for (let n = 1; n <= 3; n++) rows.push({ category, text: `${category} ${n}`, options: ["right", "wrong"], correctIndex: 0 });
  }
  await prisma.testQuestion.createMany({ data: rows });
  await asAdmin(request(app).put("/api/admin/careers/settings")).send({ generatedQuestionsPercent: 0 });
}, 180000); // wiping every table outruns the default in a full --runInBand run

afterAll(async () => {
  await teardownTestDb();
});

describe("Free internships", () => {
  it("keeps free-internship roles off /careers, and has no endpoint of their own (the page is static)", async () => {
    const free = await opening();
    const general = await opening({ audience: "general", title: `General ${++seq}` });

    const careers = await request(app).get("/api/careers/openings");
    const slugs = careers.body.openings.map((o) => o.slug);
    expect(slugs).toContain(general.slug);
    expect(slugs).not.toContain(free.slug);
    expect(careers.headers["cache-control"]).toBe("no-store");

    expect((await request(app).get("/api/careers/free/openings")).status).toBe(404);
  });

  it("has no free internships form link setting any more, and drops one stored before", async () => {
    await prisma.setting.upsert({
      where: { key: "careers" },
      create: { key: "careers", value: { freeApplyFormUrl: "https://forms.gle/old" } },
      update: { value: { freeApplyFormUrl: "https://forms.gle/old" } },
    });
    const res = await asAdmin(request(app).put("/api/admin/careers/settings")).send({ freeApplyFormUrl: "https://forms.gle/NewForm123" });
    expect(res.status).toBe(200);
    expect(res.body.settings).not.toHaveProperty("freeApplyFormUrl");
    const stored = await prisma.setting.findUnique({ where: { key: "careers" } });
    expect(stored.value).not.toHaveProperty("freeApplyFormUrl");
  });

  it("refuses an unknown audience", async () => {
    const res = await asAdmin(request(app).post("/api/admin/job-openings")).send({ title: "Odd", audience: "bca" });
    expect(res.status).toBe(400);
  });

  it("gives free roles the foundation general sections and their own technical bank", async () => {
    const { buildPaper } = require("../src/utils/careers");
    const counts = { quantitative: 2, logical: 2, verbal: 2, technical: 2 };
    const sections = (paper) => [...new Set(paper.map((q) => q.category))].sort();

    // No foundation bank yet: the standard general banks are used instead.
    const python = await opening({ techCategory: "python", questionCounts: counts });
    expect(python.techCategory).toBe("python");
    const rows = [];
    for (const category of ["quantitative_foundation", "logical_foundation", "verbal_foundation", "python"]) {
      for (let n = 1; n <= 3; n++) rows.push({ category, text: `${category} ${n}`, options: ["right", "wrong"], correctIndex: 0 });
    }
    const fallback = await buildPaper({ ...python, audience: "free", questionCounts: counts }, { generatedQuestionsPercent: 0 });
    expect(sections(fallback)).toEqual(["logical", "quantitative", "verbal"]);

    await prisma.testQuestion.createMany({ data: rows });
    try {
      const free = await buildPaper({ ...python, audience: "free", questionCounts: counts }, { generatedQuestionsPercent: 0 });
      expect(sections(free)).toEqual(["logical_foundation", "python", "quantitative_foundation", "verbal_foundation"]);
      expect(free).toHaveLength(8);
      const general = await buildPaper({ ...python, audience: "general", questionCounts: counts }, { generatedQuestionsPercent: 0 });
      expect(sections(general)).toEqual(["logical", "python", "quantitative", "verbal"]);
      // Generated questions exist for the new banks too.
      const mixed = await buildPaper({ ...python, audience: "free", questionCounts: counts }, { generatedQuestionsPercent: 100 });
      expect(mixed.filter((q) => q.generated && q.category === "python")).toHaveLength(2);
    } finally {
      await prisma.testQuestion.deleteMany({ where: { category: { in: ["quantitative_foundation", "logical_foundation", "verbal_foundation", "python"] } } });
    }
  });

  it("accepts every new technical question set for a role", async () => {
    for (const techCategory of ["frontend", "python", "webfundamentals", "aiml", "datascience"]) {
      expect((await opening({ techCategory })).techCategory).toBe(techCategory);
    }
  });

  it("answers a storage failure during the CV upload with a clear message, and lets the student retry", async () => {
    const o = await opening();
    const s = await student();
    const applied = await apply(s, o);
    const id = applied.body.application._id;
    storage.saveCv.mockRejectedValueOnce(Object.assign(new Error("not entitled"), { name: "AccessDenied" }));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const failed = await uploadCv(s, id);
    expect(failed.status).toBe(503);
    expect(failed.body).toMatchObject({ ok: false, code: "CV_STORAGE", error: expect.stringMatching(/couldn't save your CV/) });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("AccessDenied: not entitled"));
    spy.mockRestore();
    expect((await prisma.jobApplication.findUnique({ where: { id } })).cvKey).toBeFalsy();

    expect((await uploadCv(s, id)).status).toBe(200);
    expect((await prisma.jobApplication.findUnique({ where: { id } })).cvKey).toBe(`local:cv-${id}/cv.pdf`);
  });

  it("lets an admin, and only an admin, run the storage check", async () => {
    const s = await student();
    expect((await authed(request(app).get("/api/admin/careers/storage-check"), s.token)).status).toBe(403);
    const res = await asAdmin(request(app).get("/api/admin/careers/storage-check"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, inBucket: true, results: [{ area: "CVs", ok: false, error: "AccessDenied (HTTP 403): not entitled" }, { area: "Webcam photos", ok: true }] });
  });

  it("needs an account, then a PDF CV, before the free test unlocks", async () => {
    const o = await opening();
    expect((await request(app).post("/api/me/job-applications").send({ opening: o.slug })).status).toBe(401);

    const s = await student();
    const applied = await apply(s, o);
    expect(applied.status).toBe(201);
    const id = applied.body.application._id;

    const early = await unlock(s, id);
    expect(early.status).toBe(400);
    expect(early.body.code).toBe("CV_REQUIRED");

    expect((await uploadCv(s, id, Buffer.from("not a pdf at all"))).status).toBe(400);
    const other = await student();
    expect((await uploadCv(other, id)).status).toBe(404);

    const up = await uploadCv(s, id);
    expect(up.status).toBe(200);
    expect(up.body.cv.fileName).toBe("My CV (final).pdf");

    const unlocked = await unlock(s, id);
    expect(unlocked.status).toBe(200);
    expect(unlocked.body.application).toMatchObject({ status: "test_pending", cv: { fileName: "My CV (final).pdf" } });

    // A second CV replaces the first, and the old file is deleted.
    storage.deleteSnapshot.mockClear();
    expect((await uploadCv(s, id)).status).toBe(200);
    expect(storage.deleteSnapshot).toHaveBeenCalledWith(`local:cv-${id}/cv.pdf`);
  });

  it("needs the student's education from Profile before the test unlocks", async () => {
    const o = await opening();
    const s = await student({});
    const id = (await apply(s, o)).body.application._id;
    await uploadCv(s, id);
    const refused = await unlock(s, id);
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ code: "PROFILE_INCOMPLETE", missing: ["college name", "course", "branch / department", "semester", "year of passing"] });

    const me = (body) => authed(request(app).patch("/api/auth/me"), s.token).send(body);
    expect((await me({ semester: "11" })).status).toBe(400);
    expect((await me({ passingYear: 1800 })).status).toBe(400);
    expect((await me({ college: "x".repeat(151) })).status).toBe(400);
    const saved = await me({ ...EDUCATION, college: "  Gujarat   University " });
    expect(saved.status).toBe(200);
    expect(saved.body.user.education).toEqual({ ...EDUCATION, college: "Gujarat University" });

    expect((await unlock(s, id)).status).toBe(200);
    const detail = await asAdmin(request(app).get(`/api/admin/job-applications/${id}`));
    expect(detail.body.application.user.education).toMatchObject({ college: "Gujarat University", semester: "4", passingYear: 2028 });
    // The application keeps the details it was made with, even after the profile moves on.
    await me({ semester: "5" });
    const later = await asAdmin(request(app).get(`/api/admin/job-applications/${id}`));
    expect(later.body.application.education).toEqual(EDUCATION);
    expect(later.body.application.user.education.semester).toBe("5");
  });

  it("refuses a CV larger than 2 MB", async () => {
    const o = await opening();
    const s = await student();
    const id = (await apply(s, o)).body.application._id;
    const big = Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024 + 10, 0x20)]);
    expect((await uploadCv(s, id, big)).status).toBe(413);
  });

  it("lets the admin open the CV and select straight from the test", async () => {
    const o = await opening();
    const s = await student();
    const id = (await apply(s, o)).body.application._id;
    await uploadCv(s, id);
    await unlock(s, id);
    const started = await authed(request(app).post(`/api/me/job-applications/${id}/test/start`), s.token).send({ consent: true });
    expect(started.status).toBe(200);
    const t = started.body;
    const submitted = await authed(request(app).post(`/api/me/test/${t.attempt._id}/submit`), s.token).set("X-Test-Session", t.sessionId).send({});
    expect(submitted.status).toBe(200);

    // The CV can't be swapped once the test is in.
    expect((await uploadCv(s, id)).status).toBe(400);

    const cv = await asAdmin(request(app).get(`/api/admin/job-applications/${id}/cv`));
    expect(cv.status).toBe(200);
    expect(cv.headers["content-type"]).toMatch(/application\/pdf/);
    expect((await authed(request(app).get(`/api/admin/job-applications/${id}/cv`), s.token)).status).toBe(403);

    const list = await asAdmin(request(app).get("/api/admin/job-applications"));
    expect(list.body.applications.find((a) => a._id === id)).toMatchObject({ cv: { fileName: "My CV (final).pdf" }, opening: { audience: "free" } });

    mailer.sendApplicationStatusEmail.mockClear();
    const selected = await asAdmin(request(app).post(`/api/admin/job-applications/${id}/status`)).send({ action: "select" });
    expect(selected.status).toBe(200);
    expect(selected.body.application.status).toBe("selected");
    expect(mailer.sendApplicationStatusEmail).toHaveBeenCalledWith(expect.objectContaining({ status: "selected", free: true }));
  });

  it("sends the not-selected email without wallet talk for a free role", async () => {
    const o = await opening();
    const s = await student();
    const id = (await apply(s, o)).body.application._id;
    await uploadCv(s, id);
    await unlock(s, id);
    const t = (await authed(request(app).post(`/api/me/job-applications/${id}/test/start`), s.token).send({ consent: true })).body;
    await authed(request(app).post(`/api/me/test/${t.attempt._id}/submit`), s.token).set("X-Test-Session", t.sessionId).send({});

    mailer.sendApplicationStatusEmail.mockClear();
    const res = await asAdmin(request(app).post(`/api/admin/job-applications/${id}/status`)).send({ action: "not_shortlist" });
    expect(res.body.application.status).toBe("not_shortlisted");
    expect(mailer.sendApplicationStatusEmail).toHaveBeenCalledWith(expect.objectContaining({ status: "not_shortlisted", free: true }));
  });

  describe("with no processing fee", () => {
    it("has no payment step, even with the old fee settings sent again", async () => {
      // Settings from when there was a fee are ignored.
      expect((await asAdmin(request(app).put("/api/admin/careers/settings")).send({ processingFeeRupees: 94, testFeeRupees: 289 })).status).toBe(200);

      // So is a per-role "charge the fee" choice.
      const o = await opening({ waiveFee: false, feeRequired: true });
      const s = await student();
      const id = (await apply(s, o)).body.application._id;
      // The old "start paying" endpoint is gone.
      expect((await createOrder(s, id)).status).toBe(404);

      await uploadCv(s, id);
      const res = await unlock(s, id);
      expect(res.status).toBe(200);
      expect(res.body.application.status).toBe("test_pending");
      expect(await prisma.payment.count({ where: { jobApplicationId: id } })).toBe(0);
      expect(await prisma.creditEntry.count({ where: { userId: s.id } })).toBe(0);
    });

    it("still settles a processing-fee order made before the fee was removed", async () => {
      const o = await opening();
      const s = await student();
      const id = (await apply(s, o)).body.application._id;
      await uploadCv(s, id);
      const orderId = `order_free_${Math.random().toString(36).slice(2)}`;
      await prisma.payment.create({
        data: { termsAcceptedAt: new Date(), razorpayOrderId: orderId, amount: 9400, status: "created", userId: s.id, jobApplicationId: id, orderSnapshotBasePrice: 94, orderSnapshotDiscountPercent: 0 },
      });

      const paymentId = `pay_${Math.random().toString(36).slice(2)}`;
      expect((await verify(orderId, paymentId)).body).toMatchObject({ ok: true, unlocked: true });
      // A second confirmation (the webhook) changes nothing.
      await verify(orderId, paymentId);

      const app1 = await prisma.jobApplication.findUnique({ where: { id }, include: { payments: true } });
      expect(app1.status).toBe("test_pending");
      expect(app1.payments[0]).toMatchObject({ status: "paid", amount: 9400, receiptItemTitle: `Test Processing Fee - ${o.title}` });

      const credits = await prisma.creditEntry.findMany({ where: { userId: s.id } });
      expect(credits).toHaveLength(1);
      expect(credits[0]).toMatchObject({ amount: 9400, kind: "test_fee_credit" });
      expect(credits[0].note).toMatch(/^Test processing fee/);
      expect(mailer.sendTestPaymentEmail).toHaveBeenCalledWith(expect.objectContaining({ to: s.email, amount: 94, credits: 94 }));
    });
  });
});
