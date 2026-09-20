const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// Admins can open every course and internship — recorded videos, the live
// schedule, and the dashboard list — without an enrollment or a payment.
// Students still can't; a demoted admin's old token must stop working as one.

let app;
let prisma;
let admin, student;
let adminToken, studentToken;
let course, internship, video;

const tokenFor = (u) => signToken({ sub: u.id, role: u.role, email: u.email }, { expiresIn: "1h" });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  admin = await prisma.user.create({ data: { name: "Admin", email: "admin-access@test.com", passwordHash: "x", role: "admin" } });
  student = await prisma.user.create({ data: { name: "Student", email: "student-access@test.com", passwordHash: "x", role: "student" } });
  adminToken = tokenFor(admin);
  studentToken = tokenFor(student);
  course = await prisma.course.create({ data: { type: "course", title: "Paid Course", slug: "paid-course", desc: "d" } });
  internship = await prisma.course.create({ data: { type: "internship", title: "Some Internship", slug: "some-internship", desc: "d" } });
  video = await prisma.video.create({ data: { courseId: course.id, title: "Day 1", b2Key: "admin-access/day1.mp4", dayNumber: 1 } });
  process.env.VIDEO_GATEWAY_URL = "https://gateway.test";
  process.env.SIGNING_SECRET = "test-signing-secret";
}, 60000);
afterAll(async () => { await teardownTestDb(); });

describe("admin access without enrolling", () => {
  it("lists a course's videos", async () => {
    const res = await request(app).get(`/api/courses/${course.id}/videos`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.videos).toHaveLength(1);
  });

  it("mints a play URL", async () => {
    const res = await request(app).get(`/api/courses/${course.id}/videos/${video.id}/play-url`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.url).toContain("https://gateway.test");
  });

  it.each([["course", () => course], ["internship", () => internship]])("opens the /learn page of a %s", async (_kind, get) => {
    const res = await request(app).get(`/api/learn/${get().slug}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.course.slug).toBe(get().slug);
  });

  it("shows every course and internship on the dashboard, flagged as admin access", async () => {
    const res = await request(app).get("/api/me/enrollments").set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.enrollments.map((e) => e.course.slug).sort()).toEqual(["paid-course", "some-internship"]);
    for (const e of res.body.enrollments) {
      expect(e.adminAccess).toBe(true);
      expect(e.expired).toBe(false);
    }
  });
});

describe("students are still gated", () => {
  it("403s the video list, play URL and /learn page without an enrollment", async () => {
    expect((await request(app).get(`/api/courses/${course.id}/videos`).set(auth(studentToken))).status).toBe(403);
    expect((await request(app).get(`/api/courses/${course.id}/videos/${video.id}/play-url`).set(auth(studentToken))).status).toBe(403);
    expect((await request(app).get(`/api/learn/${course.slug}`).set(auth(studentToken))).status).toBe(403);
  });

  it("shows a student only their own enrollments", async () => {
    const res = await request(app).get("/api/me/enrollments").set(auth(studentToken));
    expect(res.status).toBe(200);
    expect(res.body.enrollments).toEqual([]);
  });
});

describe("a demoted admin", () => {
  it("loses the pass immediately, even though their token still says admin", async () => {
    const demoted = await prisma.user.create({ data: { name: "Ex Admin", email: "ex-admin@test.com", passwordHash: "x", role: "admin" } });
    const token = tokenFor(demoted);
    expect((await request(app).get(`/api/learn/${course.slug}`).set(auth(token))).status).toBe(200);

    await prisma.user.update({ where: { id: demoted.id }, data: { role: "student" } });
    expect((await request(app).get(`/api/learn/${course.slug}`).set(auth(token))).status).toBe(403);
    expect((await request(app).get(`/api/courses/${course.id}/videos`).set(auth(token))).status).toBe(403);
    expect((await request(app).get("/api/me/enrollments").set(auth(token))).body.enrollments).toEqual([]);
  });
});
