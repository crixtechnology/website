const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");

// Users must be 16+, and anyone under 18 needs a parent's or guardian's
// permission (DPDP Act 2023): creating an account (from the login form)
// requires the box confirming one or the other. (Its own file: login is rate
// limited per address.)
let app, prisma;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
}, 60000);
afterAll(async () => { await teardownTestDb(); });

describe("age confirmation when an account is created", () => {
  const form = { email: "no-age@example.com", password: "a-real-password", createAccount: true };

  it("refuses to create the account without the 18+ / parent-permission confirmation", async () => {
    for (const ageConfirmed of [undefined, false, "true"]) {
      const res = await request(app).post("/api/auth/login").send({ ...form, ageConfirmed });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("AGE_CONFIRMATION_REQUIRED");
    }
    expect(await prisma.user.findUnique({ where: { email: form.email } })).toBeNull();
  });

  it("creates the account once it's confirmed, and records when", async () => {
    const res = await request(app).post("/api/auth/login").send({ ...form, ageConfirmed: true });
    expect(res.status).toBe(201);
    expect((await prisma.user.findUnique({ where: { email: form.email } })).ageConfirmedAt).toBeInstanceOf(Date);
  });
});
