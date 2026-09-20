// Backblaze is mocked: no network, and every call the route makes can be inspected.
const mockS3Send = jest.fn();
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  ListObjectVersionsCommand: jest.fn(function (input) { this.input = input; this.kind = "list"; }),
  DeleteObjectsCommand: jest.fn(function (input) { this.input = input; this.kind = "delete"; }),
}));

const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// PUT /api/admin/videos/:id — fixing a recording the sync filed under the wrong
// course or internship, plus the existing title/day edits.

let app;
let prisma;
let adminToken, studentToken, student;
let webDev, dataInternship;

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const tokenFor = (u) => signToken({ sub: u.id, role: u.role, email: u.email }, { expiresIn: "1h" });
let n = 0;
const makeVideo = (courseId, dayNumber, title = `Recording ${++n}`) =>
  prisma.video.create({ data: { courseId, title, b2Key: `admin-videos/${n}-${Date.now()}.mp4`, dayNumber } });
const put = (id, body, token = adminToken) => request(app).put(`/api/admin/videos/${id}`).set(auth(token)).send(body);

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin-videos@test.com", passwordHash: "x", role: "admin" } });
  student = await prisma.user.create({ data: { name: "Student", email: "student-videos@test.com", passwordHash: "x", role: "student" } });
  adminToken = tokenFor(admin);
  studentToken = tokenFor(student);
  webDev = await prisma.course.create({ data: { type: "course", title: "Web Dev", slug: "web-dev", desc: "d" } });
  dataInternship = await prisma.course.create({ data: { type: "internship", title: "Data Internship", slug: "data-internship", desc: "d" } });
}, 90000);
afterAll(async () => { await teardownTestDb(); });

describe("moving a video to another course or internship", () => {
  it("moves it and puts it at the end of the target's list", async () => {
    await makeVideo(dataInternship.id, 1);
    await makeVideo(dataInternship.id, 2);
    const misfiled = await makeVideo(webDev.id, 7, "Actually an internship class");

    const res = await put(misfiled.id, { courseId: dataInternship.id });
    expect(res.status).toBe(200);
    expect(res.body.video.course).toBe(dataInternship.id);
    expect(res.body.video.dayNumber).toBe(3);
    // Only the row moved — the stored file key is untouched.
    expect(res.body.video.b2Key).toBe(misfiled.b2Key);
  });

  it("honours an explicit day when one is given", async () => {
    const v = await makeVideo(webDev.id, 1);
    const res = await put(v.id, { courseId: dataInternship.id, dayNumber: 10 });
    expect(res.status).toBe(200);
    expect(res.body.video).toMatchObject({ course: dataInternship.id, dayNumber: 10 });
  });

  it("starts at day 1 in a course that has no videos yet", async () => {
    const empty = await prisma.course.create({ data: { type: "course", title: "Empty Course", slug: "empty-course", desc: "d" } });
    const v = await makeVideo(webDev.id, 4);
    const res = await put(v.id, { courseId: empty.id });
    expect(res.body.video).toMatchObject({ course: empty.id, dayNumber: 1 });
  });

  it("leaves the day alone when 'moving' to the course it's already in", async () => {
    const v = await makeVideo(webDev.id, 5);
    const res = await put(v.id, { courseId: webDev.id });
    expect(res.status).toBe(200);
    expect(res.body.video).toMatchObject({ course: webDev.id, dayNumber: 5 });
  });

  it("rejects a course that doesn't exist and a malformed id, changing nothing", async () => {
    const v = await makeVideo(webDev.id, 6);
    expect((await put(v.id, { courseId: "no-such-course" })).status).toBe(404);
    expect((await put(v.id, { courseId: 123 })).status).toBe(400);
    expect((await put(v.id, { courseId: "" })).status).toBe(400);
    expect((await prisma.video.findUnique({ where: { id: v.id } })).courseId).toBe(webDev.id);
  });

  it("404s for a video that doesn't exist", async () => {
    expect((await put("no-such-video", { courseId: webDev.id })).status).toBe(404);
  });

  it("is admin-only", async () => {
    const v = await makeVideo(webDev.id, 8);
    expect((await put(v.id, { courseId: dataInternship.id }, studentToken)).status).toBe(403);
    expect((await request(app).put(`/api/admin/videos/${v.id}`).send({ courseId: dataInternship.id })).status).toBe(401);
    expect((await prisma.video.findUnique({ where: { id: v.id } })).courseId).toBe(webDev.id);
  });

  it("changes who can watch it: the target's students gain it, the old course's lose it", async () => {
    await prisma.enrollment.create({ data: { userId: student.id, courseId: dataInternship.id, status: "active" } });
    const v = await makeVideo(webDev.id, 9, "Moves to the internship");
    const before = await request(app).get(`/api/courses/${dataInternship.id}/videos`).set(auth(studentToken));
    expect(before.body.videos.map((x) => x.title)).not.toContain("Moves to the internship");

    await put(v.id, { courseId: dataInternship.id });

    const after = await request(app).get(`/api/courses/${dataInternship.id}/videos`).set(auth(studentToken));
    expect(after.body.videos.map((x) => x.title)).toContain("Moves to the internship");
    // Not enrolled in the old course, so they never had it — and it's gone from that list.
    const oldList = await request(app).get(`/api/admin/videos?courseId=${webDev.id}`).set(auth(adminToken));
    expect(oldList.body.videos.map((x) => x.title)).not.toContain("Moves to the internship");
  });
});

describe("the existing title and day edits still work", () => {
  it("renames and renumbers without moving", async () => {
    const v = await makeVideo(webDev.id, 2, "Old title");
    const res = await put(v.id, { title: "  New title ", dayNumber: 12 });
    expect(res.status).toBe(200);
    expect(res.body.video).toMatchObject({ title: "New title", dayNumber: 12, course: webDev.id });
  });

  it("still validates the title and the day", async () => {
    const v = await makeVideo(webDev.id, 3);
    expect((await put(v.id, { title: "   " })).status).toBe(400);
    expect((await put(v.id, { dayNumber: 0 })).status).toBe(400);
    expect((await put(v.id, { dayNumber: 1.5 })).status).toBe(400);
  });
});

describe("removing a video: site only, or the Backblaze file too", () => {
  const B2_ENV = { B2_S3_ENDPOINT: "s3.test.backblazeb2.com", B2_REGION: "test-1", B2_BUCKET: "lectures", B2_KEY_ID: "kid", B2_APP_KEY: "secret" };
  const savedEnv = {};
  const del = (id, query = "", token = adminToken) => request(app).delete(`/api/admin/videos/${id}${query}`).set(auth(token));
  const exists = async (id) => !!(await prisma.video.findUnique({ where: { id } }));

  // A fake bucket: `objects` = [{ Key, VersionId, marker? }]. Records what gets deleted.
  let deletedFromBucket;
  const fakeBucket = (objects) => {
    deletedFromBucket = [];
    mockS3Send.mockImplementation(async (cmd) => {
      if (cmd.kind === "list") {
        const hits = objects.filter((o) => o.Key.startsWith(cmd.input.Prefix));
        return {
          Versions: hits.filter((o) => !o.marker).map(({ Key, VersionId }) => ({ Key, VersionId })),
          DeleteMarkers: hits.filter((o) => o.marker).map(({ Key, VersionId }) => ({ Key, VersionId })),
          IsTruncated: false,
        };
      }
      deletedFromBucket.push(...cmd.input.Delete.Objects);
      return { Deleted: cmd.input.Delete.Objects };
    });
  };

  beforeAll(() => { for (const k of Object.keys(B2_ENV)) { savedEnv[k] = process.env[k]; process.env[k] = B2_ENV[k]; } });
  afterAll(() => { for (const k of Object.keys(B2_ENV)) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; } });
  beforeEach(() => { mockS3Send.mockReset(); });

  it("by default removes it from the site only and never touches Backblaze", async () => {
    const v = await makeVideo(webDev.id, 20);
    const res = await del(v.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, storage: "kept", filesRemoved: 0 });
    expect(await exists(v.id)).toBe(false);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("with deleteFile=true removes the row and every version of exactly that file", async () => {
    const v = await makeVideo(webDev.id, 21);
    fakeBucket([
      { Key: v.b2Key, VersionId: "v1" },
      { Key: v.b2Key, VersionId: "v2" },
      { Key: v.b2Key, VersionId: "m1", marker: true },
      { Key: `${v.b2Key}.other`, VersionId: "x1" }, // starts with the same text but is a different file
    ]);
    const res = await del(v.id, "?deleteFile=true");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, storage: "deleted", filesRemoved: 3 });
    expect(await exists(v.id)).toBe(false);
    expect(deletedFromBucket.map((o) => o.VersionId).sort()).toEqual(["m1", "v1", "v2"]);
    expect(deletedFromBucket.every((o) => o.Key === v.b2Key)).toBe(true);
  });

  it("still removes the row when the file is already gone from Backblaze", async () => {
    const v = await makeVideo(webDev.id, 22);
    fakeBucket([]);
    const res = await del(v.id, "?deleteFile=true");
    expect(res.body).toMatchObject({ ok: true, storage: "deleted", filesRemoved: 0 });
    expect(await exists(v.id)).toBe(false);
  });

  it("changes nothing if Backblaze fails (call error, or per-file error)", async () => {
    const v = await makeVideo(webDev.id, 23);
    mockS3Send.mockRejectedValue(new Error("AccessDenied"));
    const res = await del(v.id, "?deleteFile=true");
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/AccessDenied.*Nothing was changed/);
    expect(await exists(v.id)).toBe(true);

    mockS3Send.mockReset();
    mockS3Send.mockImplementation(async (cmd) =>
      cmd.kind === "list"
        ? { Versions: [{ Key: v.b2Key, VersionId: "v1" }], IsTruncated: false }
        : { Deleted: [], Errors: [{ Key: v.b2Key, Code: "AccessDenied", Message: "not allowed" }] });
    const res2 = await del(v.id, "?deleteFile=true");
    expect(res2.status).toBe(502);
    expect(await exists(v.id)).toBe(true);
    // ...and the site-only removal still works when Backblaze is the problem.
    expect((await del(v.id)).status).toBe(200);
    expect(await exists(v.id)).toBe(false);
  });

  it("refuses to delete the file (row kept) when this server isn't connected to Backblaze", async () => {
    const v = await makeVideo(webDev.id, 24);
    const saved = process.env.B2_APP_KEY;
    delete process.env.B2_APP_KEY;
    try {
      const res = await del(v.id, "?deleteFile=true");
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/isn't connected to Backblaze/);
      expect(await exists(v.id)).toBe(true);
      expect(mockS3Send).not.toHaveBeenCalled();
    } finally { process.env.B2_APP_KEY = saved; }
  });

  it("404s for an unknown video and is admin-only", async () => {
    expect((await del("no-such-video", "?deleteFile=true")).status).toBe(404);
    const v = await makeVideo(webDev.id, 25);
    expect((await del(v.id, "?deleteFile=true", studentToken)).status).toBe(403);
    expect((await request(app).delete(`/api/admin/videos/${v.id}?deleteFile=true`)).status).toBe(401);
    expect(await exists(v.id)).toBe(true);
    expect(mockS3Send).not.toHaveBeenCalled();
  });
});
