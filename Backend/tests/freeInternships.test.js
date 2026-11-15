const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// Free internships: roles kept off /careers (the /free-internships page is
// static and applications go through a Google Form). Older on-site applications
// for a free role carry on like any other: an admin gives test access (no fee),
// and a CV uploaded back then can still be opened by an admin. Same stand-ins as
// careers.test.js: no real mail, storage, Razorpay call or rate limiting.
jest.mock("../src/utils/rateLimit", () => ({ publicWriteLimiter: (req, res, next) => next() }));
jest.mock("../src/utils/testRateLimit", () => ({ testApiLimiter: (req, res, next) => next() }));
jest.mock("../src/utils/mailer", () => ({
  sendWelcomeEmail: jest.fn(async () => ({})),
  sendTestSubmittedEmail: jest.fn(async () => ({})),
  sendApplicationStatusEmail: jest.fn(async () => ({})),
  sendTestAccessEmail: jest.fn(async () => ({})),
}));
jest.mock("../src/utils/receiptPdf", () => ({ buildReceiptPdfBuffer: jest.fn(() => Buffer.from("fake-pdf")) }));
jest.mock("../src/utils/proctorStorage", () => ({
  PENDING_PREFIX: "pending:",
  deleteSnapshot: jest.fn(async () => {}),
  saveSnapshot: jest.fn(async (attemptId) => `local:${attemptId}/test.jpg`),
  readSnapshot: jest.fn(async () => Buffer.from("%PDF-1.4 stored")),
  describeStorageError: (err) => `${err.name}: ${err.message}`,
  checkStorage: jest.fn(async () => ({ inBucket: true, message: "stored in bucket", results: [{ area: "CVs", ok: false, error: "AccessDenied (HTTP 403): not entitled" }, { area: "Webcam photos", ok: true }] })),
}));
const mailer = require("../src/utils/mailer");

let app, prisma, adminToken;
let seq = 0;

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
const asAdmin = (req) => authed(req, adminToken);

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

const apply = (s, o) => authed(request(app).post("/api/me/job-applications"), s.token).send({ opening: o.slug, acceptTerms: true, confirmAdult: true });
const grant = (id) => asAdmin(request(app).post(`/api/admin/job-applications/${id}/grant-test`)).send({});

// Applies for a free role, an admin gives access, and the candidate sits and submits the test.
async function takenTest(o) {
  const s = await student();
  const id = (await apply(s, o)).body.application._id;
  expect((await grant(id)).status).toBe(200);
  const started = await authed(request(app).post(`/api/me/job-applications/${id}/test/start`), s.token).send({ consent: true });
  expect(started.status).toBe(200);
  const t = started.body;
  const submitted = await authed(request(app).post(`/api/me/test/${t.attempt._id}/submit`), s.token).set("X-Test-Session", t.sessionId).send({});
  expect(submitted.status).toBe(200);
  return { s, id };
}

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

  it("lets an admin, and only an admin, run the storage check", async () => {
    const s = await student();
    expect((await authed(request(app).get("/api/admin/careers/storage-check"), s.token)).status).toBe(403);
    const res = await asAdmin(request(app).get("/api/admin/careers/storage-check"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, inBucket: true, results: [{ area: "CVs", ok: false, error: "AccessDenied (HTTP 403): not entitled" }, { area: "Webcam photos", ok: true }] });
  });

  it("has no CV upload any more; a CV uploaded before can still be opened by an admin", async () => {
    const o = await opening();
    const s = await student();
    const id = (await apply(s, o)).body.application._id;
    const upload = await authed(request(app).put(`/api/me/job-applications/${id}/cv`), s.token).set("Content-Type", "application/pdf").send(Buffer.from("%PDF-1.4"));
    expect(upload.status).toBe(404);

    await prisma.jobApplication.update({ where: { id }, data: { cvKey: `local:cv-${id}/cv.pdf`, cvFileName: "My CV (final).pdf", cvUploadedAt: new Date() } });
    const cv = await asAdmin(request(app).get(`/api/admin/job-applications/${id}/cv`));
    expect(cv.status).toBe(200);
    expect(cv.headers["content-type"]).toMatch(/application\/pdf/);
    expect((await authed(request(app).get(`/api/admin/job-applications/${id}/cv`), s.token)).status).toBe(403);
    const list = await asAdmin(request(app).get("/api/admin/job-applications"));
    expect(list.body.applications.find((a) => a._id === id)).toMatchObject({ cv: { fileName: "My CV (final).pdf" }, opening: { audience: "free" } });
  });

  it("gives a free role's applicant the test once an admin gives access, and lets the admin select straight from it", async () => {
    const o = await opening();
    const { id } = await takenTest(o);
    mailer.sendApplicationStatusEmail.mockClear();
    const selected = await asAdmin(request(app).post(`/api/admin/job-applications/${id}/status`)).send({ action: "select" });
    expect(selected.status).toBe(200);
    expect(selected.body.application.status).toBe("selected");
    expect(mailer.sendApplicationStatusEmail).toHaveBeenCalledWith(expect.objectContaining({ status: "selected" }));
  });

  it("sends the not-shortlisted email with no wallet or fee talk", async () => {
    const o = await opening();
    const { id } = await takenTest(o);
    mailer.sendApplicationStatusEmail.mockClear();
    const res = await asAdmin(request(app).post(`/api/admin/job-applications/${id}/status`)).send({ action: "not_shortlist" });
    expect(res.body.application.status).toBe("not_shortlisted");
    const args = mailer.sendApplicationStatusEmail.mock.calls[0][0];
    expect(args).toMatchObject({ status: "not_shortlisted" });
    expect(args).not.toHaveProperty("free");
  });
});
