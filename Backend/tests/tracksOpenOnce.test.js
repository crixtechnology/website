const { setupTestDb, teardownTestDb } = require("./testDb");

// Opening every existing track once, on the server's first start after status
// became the applications switch (utils/tracksOpenOnce.js) — then never again.
let prisma;
let openTracksOnce;
let FLAG;

beforeAll(async () => {
  await setupTestDb();
  ({ prisma } = require("../src/db"));
  ({ openTracksOnce, FLAG } = require("../src/utils/tracksOpenOnce"));
}, 180000);
afterAll(async () => { await teardownTestDb(); });

const track = (title, data = {}) => prisma.course.create({
  data: { type: "internship", title, desc: "", slug: `${title.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}`, ...data },
});

it("opens every closed track once, and leaves later changes alone", async () => {
  const a = await track("Web Development", { status: "closed" });
  const b = await track("Python Developer", { status: "closed" });
  const c = await track("AI ML Developer", { status: "open" });

  expect(await openTracksOnce()).toEqual({ ran: true, opened: 2 });
  const statuses = await prisma.course.findMany({ where: { id: { in: [a.id, b.id, c.id] } }, select: { status: true } });
  expect(statuses.map((s) => s.status)).toEqual(["open", "open", "open"]);

  // The admin closes one afterwards: a later start doesn't reopen it.
  await prisma.course.update({ where: { id: a.id }, data: { status: "closed" } });
  expect(await openTracksOnce()).toEqual({ ran: false, reason: "already done" });
  expect((await prisma.course.findUnique({ where: { id: a.id } })).status).toBe("closed");
  expect(await prisma.setting.findUnique({ where: { key: FLAG } })).not.toBeNull();
});
