const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");

// Clean program addresses ("<domain>-<length>"), moved once for existing
// programs (utils/programSlugsOnce.js), with every old address still working.
let prisma;
let app;
let cleanProgramSlugsOnce;
let FLAG;
let programSlugBase;

beforeAll(async () => {
  await setupTestDb();
  ({ prisma } = require("../src/db"));
  app = require("../src/app");
  ({ cleanProgramSlugsOnce, FLAG } = require("../src/utils/programSlugsOnce"));
  ({ programSlugBase } = require("../src/utils/programs"));
}, 180000);
afterAll(async () => { await teardownTestDb(); });

it("builds the address from the domain and the length", () => {
  expect(programSlugBase({ title: "MERN Stack Developer", group: "MERN Stack", durationDays: 90 })).toBe("mern-stack-3-months");
  expect(programSlugBase({ title: "Data Science / Analytics", durationDays: 30 })).toBe("data-science-analytics-1-month");
  expect(programSlugBase({ title: "Cyber Security", durationDays: 45 })).toBe("cyber-security-45-days");
  expect(programSlugBase({ title: "Open Track" })).toBe("open-track");
});

it("moves existing programs once, and old addresses still open them", async () => {
  const tag = Date.now();
  const a = await prisma.course.create({ data: { type: "internship", title: `Data Science ${tag}`, desc: "", slug: `android-development-${tag}`, durationDays: 90 } });
  const b = await prisma.course.create({ data: { type: "internship", title: `Web ${tag}`, group: `Web ${tag}`, desc: "", slug: `web-${tag}-2`, durationDays: 180 } });

  const first = await cleanProgramSlugsOnce();
  expect(first.ran).toBe(true);
  const after = await prisma.course.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { createdAt: "asc" } });
  expect(after.map((c) => c.slug)).toEqual([`data-science-${tag}-3-months`, `web-${tag}-6-months`]);

  // The old address answers with the program under its new one.
  const res = await request(app).get(`/api/courses/android-development-${tag}`);
  expect(res.status).toBe(200);
  expect(res.body.course.slug).toBe(`data-science-${tag}-3-months`);

  // Once only: a later start changes nothing, even after a rename.
  await prisma.course.update({ where: { id: a.id }, data: { title: "Renamed" } });
  expect(await cleanProgramSlugsOnce()).toEqual({ ran: false, reason: "already done" });
  expect((await prisma.course.findUnique({ where: { id: a.id } })).slug).toBe(`data-science-${tag}-3-months`);
  expect(await prisma.setting.findUnique({ where: { key: FLAG } })).not.toBeNull();
});
