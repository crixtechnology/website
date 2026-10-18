const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");

// Users must be 16+, and anyone under 18 needs a parent's or guardian's
// permission (DPDP Act 2023): sign-up requires the box confirming one or the
// other. (Its own file: the sign-up route is rate limited per address.)
let app, prisma;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
}, 60000);
afterAll(async () => { await teardownTestDb(); });

describe("age confirmation at sign-up", () => {
  const form = { name: "Young Person", email: "no-age@example.com", phone: "9876543210", password: "a-real-password" };

  it("refuses a signup without the 18+ / parent-permission confirmation", async () => {
    for (const ageConfirmed of [undefined, false, "true"]) {
      const res = await request(app).post("/api/auth/signup").send({ ...form, ageConfirmed });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("AGE_CONFIRMATION_REQUIRED");
    }
    expect(await prisma.user.findUnique({ where: { email: form.email } })).toBeNull();
  });

  it("creates the account once it's confirmed, and records when", async () => {
    const res = await request(app).post("/api/auth/signup").send({ ...form, ageConfirmed: true });
    expect(res.status).toBe(201);
    expect((await prisma.user.findUnique({ where: { email: form.email } })).ageConfirmedAt).toBeInstanceOf(Date);
  });
});
