const { setupTestDb, teardownTestDb } = require("./testDb");

// The switch to the 12-service IT list, done by the server itself on its first
// start after the change (utils/servicesSwitch.js) — once, then never again.
let prisma;
let switchServicesOnce;
let FLAG;
let services;

beforeAll(async () => {
  await setupTestDb();
  ({ prisma } = require("../src/db"));
  ({ switchServicesOnce, FLAG } = require("../src/utils/servicesSwitch"));
  ({ services } = require("../src/scripts/seedServices"));
}, 180000);
afterAll(async () => { await teardownTestDb(); });

beforeEach(async () => {
  await prisma.service.deleteMany({});
  await prisma.setting.deleteMany({ where: { key: FLAG } });
});

describe("switch to the new IT services list", () => {
  it("shows exactly the new list, in order, and hides old services without deleting them", async () => {
    await prisma.service.create({ data: { title: "Static Website", desc: "old", order: 1 } });
    await prisma.service.create({ data: { title: "Mobile App Development", desc: "old", order: 5, status: "inactive" } });

    expect(await switchServicesOnce()).toMatchObject({ ran: true, created: 11, updated: 1, hidden: 1 });

    const active = await prisma.service.findMany({ where: { status: "active" }, orderBy: { order: "asc" } });
    expect(active.map((s) => s.title)).toEqual(services.map((s) => s.title));
    expect(active.find((s) => s.title === "Mobile App Development").desc).toBe(services[5].desc);
    expect(await prisma.service.findFirst({ where: { title: "Static Website" } })).toMatchObject({ status: "inactive" });
  });

  it("runs only once, so later admin changes stay", async () => {
    await switchServicesOnce();
    await prisma.service.updateMany({ where: { title: services[0].title }, data: { status: "inactive" } });

    expect(await switchServicesOnce()).toMatchObject({ ran: false, reason: "already done" });
    expect(await prisma.service.findFirst({ where: { title: services[0].title } })).toMatchObject({ status: "inactive" });
  });
});
