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

const bank = require("../src/scripts/careerQuestions");
const roleBanks = require("../src/scripts/careerQuestionsRoles");
const count = (b) => Object.values(b).reduce((n, rows) => n + rows.length, 0);

let prisma;
let seedCareersOnce;
let addRoleBanksOnce;
let FLAG;
let ROLE_BANKS_FLAG;

beforeAll(async () => {
  await setupTestDb();
  ({ prisma } = require("../src/db"));
  ({ seedCareersOnce, addRoleBanksOnce, FLAG, ROLE_BANKS_FLAG } = require("../src/utils/careersFirstRun"));
}, 180000);
afterAll(async () => { await teardownTestDb(); });

const wipe = async () => {
  await prisma.testQuestion.deleteMany({});
  await prisma.jobOpening.deleteMany({});
  await prisma.setting.deleteMany({ where: { key: { in: [FLAG, ROLE_BANKS_FLAG] } } });
};

describe("first-run careers setup", () => {
  beforeEach(wipe);

  it("fills an empty database once, with open roles when photos go to a bucket", async () => {
    const first = await seedCareersOnce();
    expect(first).toMatchObject({ ran: true, openingStatus: "open" });
    expect(await prisma.jobOpening.count({ where: { status: "open" } })).toBe(3);
    expect(await prisma.testQuestion.count()).toBe(count(bank));

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

describe("free-internship role banks, added once on startup", () => {
  beforeEach(wipe);

  // A live database as it was before: the original six banks, 50 questions each.
  const seedOriginalBank = async () => {
    const original = { ...bank, datascience: bank.datascience.slice(0, 50) };
    for (const c of Object.keys(roleBanks)) if (c !== "datascience") delete original[c];
    const data = Object.entries(original).flatMap(([category, rows]) => rows.map(([text, options, correctIndex]) => ({ category, text, options, correctIndex })));
    await prisma.testQuestion.createMany({ data });
    return data.length;
  };

  it("adds the new banks to a database that already has its starter bank, once", async () => {
    expect(await seedOriginalBank()).toBe(300);
    expect(await addRoleBanksOnce()).toEqual({ ran: true, addedQuestions: count(roleBanks) });
    expect(await prisma.testQuestion.count()).toBe(count(bank));
    for (const category of ["frontend", "python", "webfundamentals", "aiml", "quantitative_foundation", "logical_foundation", "verbal_foundation"]) {
      expect(await prisma.testQuestion.count({ where: { category } })).toBe(roleBanks[category].length);
    }
    expect(await prisma.testQuestion.count({ where: { category: "datascience" } })).toBe(50 + roleBanks.datascience.length);

    // A question the admin deletes afterwards stays deleted.
    await prisma.testQuestion.deleteMany({ where: { category: "python" } });
    expect(await addRoleBanksOnce()).toMatchObject({ ran: false, reason: "already done" });
    expect(await prisma.testQuestion.count({ where: { category: "python" } })).toBe(0);
  }, 60000);

  it("adds nothing after a first-run seed, which already has them", async () => {
    await seedCareersOnce();
    expect(await addRoleBanksOnce()).toEqual({ ran: true, addedQuestions: 0 });
    expect(await prisma.testQuestion.count()).toBe(count(bank));
    expect(await prisma.setting.findUnique({ where: { key: ROLE_BANKS_FLAG } })).not.toBeNull();
  }, 60000);
});
