const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// BCA internships: roles listed only on the unlinked /bca-internships page,
// free, and unlocked only once the candidate has uploaded a CV (a PDF). Same
// stand-ins as careers.test.js: no real mail, storage or rate limiting.
jest.mock("../src/utils/rateLimit", () => ({ publicWriteLimiter: (req, res, next) => next() }));
jest.mock("../src/utils/testRateLimit", () => ({ testApiLimiter: (req, res, next) => next() }));
jest.mock("../src/utils/mailer", () => ({
  sendWelcomeEmail: jest.fn(async () => ({})),
  sendTestSubmittedEmail: jest.fn(async () => ({})),
  sendApplicationStatusEmail: jest.fn(async () => ({})),
}));
jest.mock("../src/utils/proctorStorage", () => ({
  PENDING_PREFIX: "pending:",
  deleteSnapshot: jest.fn(async () => {}),
  saveSnapshot: jest.fn(async (attemptId) => `local:${attemptId}/test.jpg`),
  saveCv: jest.fn(async (applicationId) => `local:cv-${applicationId}/cv.pdf`),
  readSnapshot: jest.fn(async () => Buffer.from("%PDF-1.4 stored")),
}));
const storage = require("../src/utils/proctorStorage");
const mailer = require("../src/utils/mailer");

let app, prisma, adminToken;
let seq = 0;

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
const asAdmin = (req) => authed(req, adminToken);
const PDF = Buffer.from("%PDF-1.4\n% a tiny test CV\n%%EOF");

async function student() {
  const user = await prisma.user.create({
    data: { name: "BCA Student", email: `bca${++seq}@example.com`, phone: "9876500000", passwordHash: "x", role: "student" },
  });
  return { id: user.id, email: user.email, token: signToken({ sub: user.id, role: "student", email: user.email }, { expiresIn: "1h" }) };
}

async function opening(overrides = {}) {
  const res = await asAdmin(request(app).post("/api/admin/job-openings")).send({
    title: `BCA Intern ${++seq}`, summary: "Learn by building.", techCategory: "web",
    durationMinutes: 20, questionCounts: { quantitative: 1, logical: 1, verbal: 1, technical: 1 },
    feeRequired: false, audience: "bca",
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.opening;
}

const apply = (s, o) => authed(request(app).post("/api/me/job-applications"), s.token).send({ opening: o.slug });
const uploadCv = (s, id, body = PDF, type = "application/pdf") =>
  authed(request(app).put(`/api/me/job-applications/${id}/cv`), s.token).set("Content-Type", type).set("X-File-Name", encodeURIComponent("My CV (final).pdf")).send(body);
const unlock = (s, id) => authed(request(app).post(`/api/me/job-applications/${id}/unlock-free`), s.token).send({ acceptTerms: true, confirmAdult: true });

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin-bca@test.com", passwordHash: "x", role: "admin" } });
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

describe("BCA internships", () => {
  it("lists BCA roles only on their own endpoint, never on /careers", async () => {
    const bca = await opening();
    const general = await opening({ audience: "general", title: `General ${++seq}` });

    const careers = await request(app).get("/api/careers/openings");
    const slugs = careers.body.openings.map((o) => o.slug);
    expect(slugs).toContain(general.slug);
    expect(slugs).not.toContain(bca.slug);

    const page = await request(app).get("/api/careers/bca/openings");
    expect(page.status).toBe(200);
    expect(page.body.openings.map((o) => o.slug)).toEqual(expect.arrayContaining([bca.slug]));
    expect(page.body.openings.every((o) => o.audience === "bca" && o.feeRequired === false)).toBe(true);
  });

  it("refuses an unknown audience", async () => {
    const res = await asAdmin(request(app).post("/api/admin/job-openings")).send({ title: "Odd", audience: "mba" });
    expect(res.status).toBe(400);
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
    expect(list.body.applications.find((a) => a._id === id)).toMatchObject({ cv: { fileName: "My CV (final).pdf" }, opening: { audience: "bca" } });

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
});
