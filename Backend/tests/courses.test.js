const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");
const { newStudent } = require("./helpers/newStudent");

let app, prisma, adminToken;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req) => req.set("Authorization", `Bearer ${adminToken}`);
const uniqueTitle = () => `Test Course ${Date.now()}-${Math.random()}`;

// status is Admin's Open/Closed switch: whether the track takes applications.
// Tracks are joined by applying, so it has nothing to do with the plans.
describe("PUT /admin/courses/:id — the Open/Closed switch", () => {
  let courseId;

  beforeEach(async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({
      type: "internship", title: uniqueTitle(), tiers: [{ tier: "basic", price: 999 }],
    });
    expect(create.status).toBe(201);
    courseId = create.body.course._id;
    expect(create.body.course.status).toBe("open"); // a new track takes applications
  });

  it("keeps a track open when every plan is cleared — an apply-only track can be open", async () => {
    const res = await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ tiers: [] });
    expect(res.status).toBe(200);
    expect(res.body.course.tiers).toEqual([]);
    expect(res.body.course.status).toBe("open");
  });

  it("closes and reopens an apply-only track", async () => {
    await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ tiers: [] });
    const closed = await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ status: "closed" });
    expect(closed.body.course.status).toBe("closed");
    const opened = await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ status: "open" });
    expect(opened.status).toBe(200);
    expect(opened.body.course.status).toBe("open");
  });

  it("refuses new applications for a closed track, and takes them again once reopened", async () => {
    const course = (await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ status: "closed" })).body.course;
    const signup = await newStudent(app, { name: "Asha", email: "asha@gmail.com", phone: "9876500000", password: "a-real-password" });
    const apply = () => request(app).post("/api/applications").set("Authorization", `Bearer ${signup.body.token}`).send({
      type: "internship", refTitle: course.title, courseSlug: course.slug, name: "Asha", email: "asha@gmail.com", phone: "9876500000",
    });
    const refused = await apply();
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/isn't taking applications/);
    await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ status: "open" });
    expect((await apply()).status).toBe(201);
  });

  it("leaves an already-open, already-priced course open on an unrelated field edit", async () => {
    const res = await authed(request(app).put(`/api/admin/courses/${courseId}`)).send({ tag: "Popular" });
    expect(res.status).toBe(200);
    expect(res.body.course.status).toBe("open");
    expect(res.body.course.tiers.map((t) => [t.tier, t.price])).toEqual([["basic", 999]]);
  });
});

describe("POST /admin/courses — duplicate slug handling", () => {
  it("appends a numeric suffix instead of colliding when titles produce the same slug", async () => {
    const title = "Same Title Course";
    const first = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title, tiers: [{ tier: "basic", price: 100 }] });
    const second = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title, tiers: [{ tier: "basic", price: 100 }] });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.course.slug).not.toBe(second.body.course.slug);
  });
});

// Basic / Plus / Pro plans: each course or internship offers up to three,
// each with its own price, discount and feature list.
describe("course plans (basic / plus / pro)", () => {
  it("stores up to three plans and returns them in basic -> plus -> pro order", async () => {
    // Sent out of order on purpose.
    const res = await authed(request(app).post("/api/admin/courses")).send({
      type: "internship", title: uniqueTitle(), tiers: [
        { tier: "pro", price: 9999, discountPercent: 10, features: ["1:1 mentoring", " Code review "] },
        { tier: "basic", price: 2999 },
        { tier: "plus", price: 5999, features: ["Live classes"] },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.course.tiers.map((t) => t.tier)).toEqual(["basic", "plus", "pro"]);
    const pro = res.body.course.tiers[2];
    expect(pro.price).toBe(9999);
    expect(pro.discountPercent).toBe(10);
    expect(pro.features).toEqual(["1:1 mentoring", "Code review"]); // trimmed
    expect(res.body.course.tiers[0].features).toEqual([]);
    expect(res.body.course.status).toBe("open"); // takes applications unless the admin closes it
  });

  it("serves the same plans on the public endpoint", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: uniqueTitle(), tiers: [{ tier: "plus", price: 4000 }] });
    const pub = await request(app).get(`/api/courses/${create.body.course.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.course.tiers).toHaveLength(1);
    expect(pub.body.course.tiers[0]).toMatchObject({ tier: "plus", price: 4000 });
  });

  it("treats a blank price as plan-not-offered instead of an error", async () => {
    const res = await authed(request(app).post("/api/admin/courses")).send({
      type: "internship", title: uniqueTitle(), tiers: [{ tier: "basic", price: 1500 }, { tier: "plus", price: "" }, { tier: "pro", price: null }],
    });
    expect(res.status).toBe(201);
    expect(res.body.course.tiers.map((t) => t.tier)).toEqual(["basic"]);
  });

  it("replaces the whole plan set on update, removing plans that are left out", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({
      type: "internship", title: uniqueTitle(), tiers: [{ tier: "basic", price: 1000 }, { tier: "plus", price: 2000 }, { tier: "pro", price: 3000 }],
    });
    const id = create.body.course._id;
    const res = await authed(request(app).put(`/api/admin/courses/${id}`)).send({
      tiers: [{ tier: "plus", price: 2500, discountPercent: 20, features: ["Live classes"] }, { tier: "pro", price: 3000 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.course.tiers.map((t) => [t.tier, t.price, t.discountPercent])).toEqual([["plus", 2500, 20], ["pro", 3000, 0]]);
    expect(await prisma.courseTier.count({ where: { courseId: id } })).toBe(2);
  });

  it("leaves the plans alone when an update does not mention them", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({
      type: "internship", title: uniqueTitle(), tiers: [{ tier: "basic", price: 1000 }, { tier: "pro", price: 3000 }],
    });
    const res = await authed(request(app).put(`/api/admin/courses/${create.body.course._id}`)).send({ tag: "Popular" });
    expect(res.body.course.tiers.map((t) => t.tier)).toEqual(["basic", "pro"]);
  });

  it("adding the first plan doesn't change whether a track is open or closed", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: uniqueTitle(), status: "closed" });
    expect(create.status).toBe(201);
    expect(create.body.course.tiers).toEqual([]);
    expect(create.body.course.status).toBe("closed");
    const id = create.body.course._id;
    const withPlan = await authed(request(app).put(`/api/admin/courses/${id}`)).send({ tiers: [{ tier: "basic", price: 500 }] });
    expect(withPlan.body.course.status).toBe("closed");
  });

  it("refuses to create or turn anything into a course — courses were dropped", async () => {
    const made = await authed(request(app).post("/api/admin/courses")).send({ type: "course", title: uniqueTitle(), tiers: [{ tier: "basic", price: 100 }] });
    expect(made.status).toBe(400);
    expect(made.body.error).toMatch(/no longer offered/);
    const track = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: uniqueTitle() });
    expect(track.status).toBe(201);
    const turned = await authed(request(app).put(`/api/admin/courses/${track.body.course._id}`)).send({ type: "course" });
    expect(turned.status).toBe(400);
  });

  it("hides any old course row everywhere", async () => {
    const old = await prisma.course.create({ data: { type: "course", title: uniqueTitle(), slug: `old-course-${Date.now()}`, desc: "", status: "open" } });
    expect((await request(app).get(`/api/courses/${old.slug}`)).status).toBe(404);
    expect((await request(app).get("/api/courses")).body.courses.map((c) => c._id)).not.toContain(old.id);
    expect((await request(app).get("/api/courses?type=course")).body.courses.map((c) => c._id)).not.toContain(old.id);
    expect((await authed(request(app).get("/api/admin/courses"))).body.courses.map((c) => c._id)).not.toContain(old.id);
    expect((await authed(request(app).put(`/api/admin/courses/${old.id}`)).send({ title: "x" })).status).toBe(404);
  });

  it.each([
    ["an unknown tier", [{ tier: "gold", price: 100 }]],
    ["a duplicated tier", [{ tier: "basic", price: 100 }, { tier: "basic", price: 200 }]],
    ["a negative price", [{ tier: "basic", price: -5 }]],
    ["a discount over 100", [{ tier: "basic", price: 100, discountPercent: 101 }]],
    ["a fractional discount", [{ tier: "basic", price: 100, discountPercent: 12.5 }]],
    ["a non-numeric price", [{ tier: "basic", price: "abc" }]],
  ])("rejects %s", async (_label, tiers) => {
    const res = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: uniqueTitle(), tiers });
    expect(res.status).toBe(400);
  });

  it("deletes a course together with its plans", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: uniqueTitle(), tiers: [{ tier: "basic", price: 100 }] });
    const id = create.body.course._id;
    const del = await authed(request(app).delete(`/api/admin/courses/${id}`));
    expect(del.status).toBe(200);
    expect(await prisma.courseTier.count({ where: { courseId: id } })).toBe(0);
  });
});

describe("DELETE /admin/courses/:id", () => {
  it("answers 404 only for a course that really doesn't exist", async () => {
    const res = await authed(request(app).delete("/api/admin/courses/does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("refuses to delete a course with enrolled students, and says why (was a misleading 404)", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: uniqueTitle(), tiers: [{ tier: "basic", price: 100 }] });
    const id = create.body.course._id;
    const student = await prisma.user.create({ data: { name: "Enrolled", email: `enrolled-${Date.now()}@test.com`, passwordHash: "x" } });
    await prisma.enrollment.create({ data: { userId: student.id, courseId: id } });
    const res = await authed(request(app).delete(`/api/admin/courses/${id}`));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/enrolled/i);
    expect(await prisma.course.count({ where: { id } })).toBe(1);
  });

  it("deletes a course together with its lectures and videos when nobody is enrolled", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: uniqueTitle(), tiers: [{ tier: "basic", price: 100 }] });
    const id = create.body.course._id;
    await prisma.lecture.create({ data: { courseId: id, title: "L1", scheduledAt: new Date(), scheduledEndAt: new Date(Date.now() + 3600000), link: "https://meet.example.com/x" } });
    await prisma.video.create({ data: { courseId: id, title: "V1", b2Key: `key-${Date.now()}`, dayNumber: 1 } });
    const res = await authed(request(app).delete(`/api/admin/courses/${id}`));
    expect(res.status).toBe(200);
    expect(await prisma.course.count({ where: { id } })).toBe(0);
    expect(await prisma.lecture.count({ where: { courseId: id } })).toBe(0);
    expect(await prisma.video.count({ where: { courseId: id } })).toBe(0);
  });
});

describe("course field validation", () => {
  it("rejects a blank title and a junk duration instead of a 500", async () => {
    const blank = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: "   ", tiers: [{ tier: "basic", price: 100 }] });
    expect(blank.status).toBe(400);
    const junk = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: uniqueTitle(), durationDays: "abc", tiers: [{ tier: "basic", price: 100 }] });
    expect(junk.status).toBe(400);
    const ok = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: uniqueTitle(), durationDays: "30", tiers: [{ tier: "basic", price: 100 }] });
    expect(ok.status).toBe(201);
    expect(ok.body.course.durationDays).toBe(30);
  });

  it("rejects unparseable lecture dates instead of a 500", async () => {
    const create = await authed(request(app).post("/api/admin/courses")).send({ type: "internship", title: uniqueTitle(), tiers: [{ tier: "basic", price: 100 }] });
    const res = await authed(request(app).post("/api/admin/lectures")).send({
      course: create.body.course._id, title: "Bad dates", scheduledAt: "not-a-date", scheduledEndAt: "also-not", link: "https://meet.example.com/x",
    });
    expect(res.status).toBe(400);
  });
});

describe("internship durations: 15 days, 1 month, 3 months or 6 months", () => {
  const internship = (extra = {}) => ({ type: "internship", title: uniqueTitle(), ...extra });

  it.each([15, 30, 90, 180])("accepts %i days for an internship", async (days) => {
    const res = await authed(request(app).post("/api/admin/courses")).send(internship({ durationDays: days }));
    expect(res.status).toBe(201);
    expect(res.body.course.durationDays).toBe(days);
  });

  it("accepts an internship with no duration set", async () => {
    const res = await authed(request(app).post("/api/admin/courses")).send(internship());
    expect(res.status).toBe(201);
    expect(res.body.course.durationDays).toBeNull();
  });

  it.each([7, 45, 60, 365, "45"])("refuses %p days for a new internship, with a clear message", async (days) => {
    const res = await authed(request(app).post("/api/admin/courses")).send(internship({ durationDays: days }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("An internship's duration must be 15 days, 1 month, 3 months or 6 months.");
  });

  it("applies the same rule when editing", async () => {
    const created = await authed(request(app).post("/api/admin/courses")).send(internship({ durationDays: 30 }));
    const id = created.body.course._id;
    expect((await authed(request(app).put(`/api/admin/courses/${id}`)).send({ durationDays: 90 })).body.course.durationDays).toBe(90);
    expect((await authed(request(app).put(`/api/admin/courses/${id}`)).send({ durationDays: 50 })).status).toBe(400);
    expect((await prisma.course.findUnique({ where: { id } })).durationDays).toBe(90); // refused edit changed nothing
  });

  it("lets an older internship with another length be saved unchanged, but not moved to another odd length", async () => {
    // Created before the rule existed: put the odd value straight into the database.
    const made = await authed(request(app).post("/api/admin/courses")).send(internship({ durationDays: 30 }));
    const legacy = await prisma.course.update({ where: { id: made.body.course._id }, data: { durationDays: 45 } });
    const keep = await authed(request(app).put(`/api/admin/courses/${legacy.id}`)).send({ title: "Legacy internship renamed", durationDays: 45 });
    expect(keep.status).toBe(200);
    expect(keep.body.course.durationDays).toBe(45);
    expect((await authed(request(app).put(`/api/admin/courses/${legacy.id}`)).send({ durationDays: 60 })).status).toBe(400);
    expect((await authed(request(app).put(`/api/admin/courses/${legacy.id}`)).send({ durationDays: 90 })).status).toBe(200);
  });
});
