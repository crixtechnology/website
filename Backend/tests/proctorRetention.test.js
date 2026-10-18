const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// Aptitude-test webcam photos are deleted — the FILES, not just their database
// rows — when the student's account is deleted, 6 months after the application
// is closed, and in any case 12 months after the test. Real files are written
// to a throwaway folder so the tests can see them go.
const PHOTO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "crix-proctor-"));
process.env.PROCTOR_LOCAL_DIR = PHOTO_DIR;
process.env.PROCTOR_BUCKET = ""; // local disk, never a real bucket

jest.mock("../src/utils/mailer", () => ({
  sendApplicationStatusEmail: jest.fn(async () => ({})),
  sendWalletCreditEmail: jest.fn(async () => ({})),
  sendSignupBonusEmail: jest.fn(async () => ({})),
}));

let app, prisma, storage, retention, adminToken, opening;
let seq = 0;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const DAY = 24 * 3600 * 1000;
const asAdmin = (req) => req.set("Authorization", `Bearer ${adminToken}`);

// A student with one application whose test has `photos` webcam photos on disk.
async function candidate({ status = "submitted", closedAt = null, startedAt = new Date(), photos = 2 } = {}) {
  const user = await prisma.user.create({ data: { name: "Cand", email: `ret${++seq}@example.com`, passwordHash: "x", role: "student" } });
  const application = await prisma.jobApplication.create({ data: { userId: user.id, openingId: opening.id, status, closedAt } });
  const attempt = await prisma.testAttempt.create({
    data: {
      applicationId: application.id, userId: user.id, status: "submitted", startedAt, endsAt: new Date(startedAt.getTime() + 30 * 60000),
      submittedAt: new Date(startedAt.getTime() + 20 * 60000), settings: {}, paper: [],
    },
  });
  const keys = [];
  for (let i = 0; i < photos; i++) {
    const storageKey = await storage.saveSnapshot(attempt.id, JPEG);
    await prisma.testSnapshot.create({ data: { attemptId: attempt.id, storageKey } });
    keys.push(storageKey);
  }
  return { user, application, attempt, keys };
}
const fileOf = (key) => path.join(PHOTO_DIR, ...key.slice("local:".length).split("/"));
const onDisk = (keys) => keys.filter((k) => fs.existsSync(fileOf(k))).length;
const rowsOf = (attempt) => prisma.testSnapshot.count({ where: { attemptId: attempt.id } });

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  storage = require("../src/utils/proctorStorage");
  retention = require("../src/utils/proctorRetention");
  const admin = await prisma.user.create({ data: { name: "Admin", email: "ret-admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
  opening = await prisma.jobOpening.create({ data: { slug: "ret-role", title: "Retention Role", summary: "x" } });
}, 60000);
afterAll(async () => {
  await teardownTestDb();
  fs.rmSync(PHOTO_DIR, { recursive: true, force: true });
});

describe("deleting a student's account", () => {
  it("deletes their webcam photo files, and nobody else's", async () => {
    const leaving = await candidate();
    const staying = await candidate();
    expect(onDisk(leaving.keys)).toBe(2);

    const res = await asAdmin(request(app).delete(`/api/admin/users/${leaving.user.id}`));
    expect(res.status).toBe(200);
    expect(onDisk(leaving.keys)).toBe(0);
    expect(fs.existsSync(path.join(PHOTO_DIR, leaving.attempt.id))).toBe(false); // the empty folder goes too
    expect(await prisma.testSnapshot.count({ where: { storageKey: { in: leaving.keys } } })).toBe(0);
    expect(onDisk(staying.keys)).toBe(2);
    expect(await rowsOf(staying.attempt)).toBe(2);
  });

  it("keeps the account when a photo can't be removed from storage, so it can be retried", async () => {
    const stuck = await candidate({ photos: 1 });
    await prisma.testSnapshot.create({ data: { attemptId: stuck.attempt.id, storageKey: "nowhere:photo.jpg" } });
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await asAdmin(request(app).delete(`/api/admin/users/${stuck.user.id}`));
    errors.mockRestore();
    expect(res.status).toBe(502);
    expect(await prisma.user.findUnique({ where: { id: stuck.user.id } })).not.toBeNull();
    // The one it couldn't delete keeps its row, so it is tried again later.
    expect(await prisma.testSnapshot.count({ where: { storageKey: "nowhere:photo.jpg" } })).toBe(1);
  });
});

describe("a photo still being uploaded", () => {
  it("has nothing in storage to delete, so it never blocks a clean-up", async () => {
    await expect(storage.deleteSnapshot(`${storage.PENDING_PREFIX}abc123`)).resolves.toBeUndefined();
    await expect(storage.readSnapshot(`${storage.PENDING_PREFIX}abc123`)).rejects.toThrow();
  });
});

describe("retention period", () => {
  it("deletes photos 6 months after the application closes, or 12 months after the test, and keeps the rest", async () => {
    const now = new Date();
    const closedLongAgo = await candidate({ status: "rejected", closedAt: new Date(now - 200 * DAY) });
    const closedRecently = await candidate({ status: "not_shortlisted", closedAt: new Date(now - 60 * DAY) });
    const undecidedOld = await candidate({ status: "submitted", startedAt: new Date(now - 400 * DAY) });
    const undecidedRecent = await candidate({ status: "submitted", startedAt: new Date(now - 30 * DAY) });
    // Closed before closedAt existed: its last change is when it closed.
    const legacy = await candidate({ status: "selected", closedAt: null });
    await prisma.$executeRaw`UPDATE job_applications SET updatedAt = ${new Date(now - 200 * DAY)} WHERE id = ${legacy.application.id}`;

    await retention.purgeExpiredSnapshots(now);

    for (const gone of [closedLongAgo, undecidedOld, legacy]) {
      expect(onDisk(gone.keys)).toBe(0);
      expect(await rowsOf(gone.attempt)).toBe(0);
    }
    for (const kept of [closedRecently, undecidedRecent]) {
      expect(onDisk(kept.keys)).toBe(2);
      expect(await rowsOf(kept.attempt)).toBe(2);
    }
    // The application and its result stay; only the photos go.
    expect(await prisma.testAttempt.findUnique({ where: { id: closedLongAgo.attempt.id } })).not.toBeNull();
  });

  it("starts the clock when an admin closes an application, and stops it if it is reopened", async () => {
    const c = await candidate({ status: "submitted" });
    const closed = await asAdmin(request(app).post(`/api/admin/job-applications/${c.application.id}/status`)).send({ action: "not_shortlist" });
    expect(closed.status).toBe(200);
    expect((await prisma.jobApplication.findUnique({ where: { id: c.application.id } })).closedAt).toBeInstanceOf(Date);

    const reopened = await asAdmin(request(app).post(`/api/admin/job-applications/${c.application.id}/status`)).send({ action: "shortlist" });
    expect(reopened.status).toBe(200);
    expect((await prisma.jobApplication.findUnique({ where: { id: c.application.id } })).closedAt).toBeNull();
  });
});
