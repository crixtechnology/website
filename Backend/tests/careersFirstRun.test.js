const { setupTestDb, teardownTestDb } = require("./testDb");

// The starter roles and question bank, added by the server itself on its first
// start (utils/careersFirstRun.js) — once, and only into an empty database.
jest.mock("../src/utils/proctorStorage", () => ({
  PENDING_PREFIX: "pending:",
  storageStatus: jest.fn(() => ({ inBucket: true, message: "" })),
  saveSnapshot: jest.fn(),
  readSnapshot: jest.fn(),
  deleteSnapshot: jest.fn(),
}));
const storage = require("../src/utils/proctorStorage");

let prisma;
let seedCareersOnce;
let FLAG;

beforeAll(async () => {
  await setupTestDb();
  ({ prisma } = require("../src/db"));
  ({ seedCareersOnce, FLAG } = require("../src/utils/careersFirstRun"));
}, 180000);
afterAll(async () => { await teardownTestDb(); });

const wipe = async () => {
  await prisma.testQuestion.deleteMany({});
  await prisma.jobOpening.deleteMany({});
  await prisma.setting.deleteMany({ where: { key: FLAG } });
};

describe("first-run careers setup", () => {
  beforeEach(wipe);

  it("fills an empty database once, with open roles when photos go to a bucket", async () => {
    const first = await seedCareersOnce();
    expect(first).toMatchObject({ ran: true, openingStatus: "open" });
    expect(await prisma.jobOpening.count({ where: { status: "open" } })).toBe(3);
    expect(await prisma.testQuestion.count()).toBe(300);

    // Deleted by the admin afterwards: never comes back.
    await prisma.jobOpening.deleteMany({ where: { slug: "data-science-intern" } });
    expect(await seedCareersOnce()).toMatchObject({ ran: false, reason: "already done" });
    expect(await prisma.jobOpening.count()).toBe(2);
  }, 60000);

  it("adds the roles closed while photos would only be kept on the server's disk", async () => {
    storage.storageStatus.mockReturnValueOnce({ inBucket: false, message: "" });
    expect(await seedCareersOnce()).toMatchObject({ ran: true, openingStatus: "closed" });
    expect(await prisma.jobOpening.count({ where: { status: "closed" } })).toBe(3);
  }, 60000);

  it("leaves a database that already has roles or questions alone, and doesn't ask again", async () => {
    await prisma.jobOpening.create({ data: { slug: "own-role", title: "Our own role", summary: "", questionCounts: {} } });
    expect(await seedCareersOnce()).toMatchObject({ ran: false, reason: "roles or questions already exist" });
    expect(await prisma.jobOpening.count()).toBe(1);
    expect(await prisma.testQuestion.count()).toBe(0);
    expect(await prisma.setting.findUnique({ where: { key: FLAG } })).not.toBeNull();
  });
});
