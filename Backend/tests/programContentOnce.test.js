const { setupTestDb, teardownTestDb } = require("./testDb");
const { PROGRAM_CONTENT, OLD_DESCS } = require("../src/utils/programContent");

// Own content for each length of every program, applied once
// (utils/programContentOnce.js) — never over an admin's own edits.
let prisma;
let applyProgramContentOnce;
let FLAG;

beforeAll(async () => {
  await setupTestDb();
  ({ prisma } = require("../src/db"));
  ({ applyProgramContentOnce, FLAG } = require("../src/utils/programContentOnce"));
}, 180000);
afterAll(async () => { await teardownTestDb(); });

const MERN_OLD = OLD_DESCS[0];
const program = (slug, data = {}) => prisma.course.create({
  data: { type: "internship", title: "MERN Stack Developer", group: "MERN Stack", desc: MERN_OLD, slug, durationDays: 180, tag: "Flagship", ...data },
});

it("gives every length its own description, points, outcomes, audience and FAQs", () => {
  const all = Object.values(PROGRAM_CONTENT);
  expect(all).toHaveLength(30);
  for (const field of ["desc", "points", "skills", "responsibilities", "outcomes", "audience", "prerequisites", "faqs"]) {
    const values = all.map((c) => JSON.stringify(c[field]));
    // No two programs share a description or point list.
    if (field === "desc" || field === "points") expect(new Set(values).size).toBe(values.length);
  }
  for (const c of all) {
    expect(c.desc.length).toBeGreaterThan(80);
    expect(c.points.length).toBe(4);
    expect(c.faqs.every((f) => f.q && f.a)).toBe(true);
    // A stipend is only mentioned by the paid-internship versions.
    if (!c.title) expect(JSON.stringify(c)).not.toMatch(/stipend/i);
  }
});

it("updates programs with the old shared text once, and leaves admin edits alone", async () => {
  const paid = await program("mern-stack-6-months-2", { stipend: "₹3000 - ₹7000/ month", tiers: undefined });
  const plain = await program("mern-stack-6-months");
  const edited = await program("mern-stack-3-months", { desc: "Written by the admin.", durationDays: 90 });
  const ds = await program("data-science-analytics-1-month", { title: "Data Science / Analytics", group: "Data Science / Analytics", desc: OLD_DESCS[2], tag: "Mobile", durationDays: 30 });

  const result = await applyProgramContentOnce();
  expect(result.ran).toBe(true);
  expect(result.updated.sort()).toEqual(["data-science-analytics-1-month", "mern-stack-6-months", "mern-stack-6-months-2"]);
  expect(result.skipped).toEqual(["mern-stack-3-months"]);

  const get = (id) => prisma.course.findUnique({ where: { id } });
  const p = await get(paid.id);
  expect(p.title).toBe("MERN Stack Developer with Paid Internship");
  expect(p.desc).toBe(PROGRAM_CONTENT["mern-stack-6-months-2"].desc);
  expect(p.stipend).toBe("₹3000 - ₹7000/ month");
  expect(p.faqs).toEqual(PROGRAM_CONTENT["mern-stack-6-months-2"].faqs);

  const q = await get(plain.id);
  expect(q.title).toBe("MERN Stack Developer");
  expect(q.outcomes).toEqual(PROGRAM_CONTENT["mern-stack-6-months"].outcomes);
  expect(q.tag).toBe("Flagship");

  expect((await get(edited.id)).desc).toBe("Written by the admin.");
  expect((await get(ds.id)).tag).toBe("");

  // An admin edit after the first run sticks.
  await prisma.course.update({ where: { id: plain.id }, data: { desc: MERN_OLD } });
  expect(await applyProgramContentOnce()).toEqual({ ran: false, reason: "already done" });
  expect((await get(plain.id)).desc).toBe(MERN_OLD);
  expect(await prisma.setting.findUnique({ where: { key: FLAG } })).not.toBeNull();
});
