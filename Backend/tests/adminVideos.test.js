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
