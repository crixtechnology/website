const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");

// An address under /api that no route claims must answer with JSON like every
// other API reply — not Express's HTML "Cannot GET" page, which the frontend
// then fails to parse.

let app;
beforeAll(async () => { app = await setupTestDb(); }, 90000);
afterAll(async () => { await teardownTestDb(); });

describe("unknown /api addresses", () => {
  it.each([["get", "/api/no-such-thing"], ["post", "/api/payments/no-such-thing"], ["delete", "/api/admin/nothing-here"], ["put", "/api/auth/nope"]])(
    "%s %s answers 404 with JSON",
    async (method, path) => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body).toEqual({ ok: false, error: "Not found" });
    }
  );

  it("leaves real routes alone", async () => {
    expect((await request(app).get("/api/health")).status).toBe(200);
    expect((await request(app).get("/api/courses")).status).toBe(200);
    // A real route that answers 404 itself keeps its own message.
    const missing = await request(app).get("/api/courses/definitely-not-a-course");
    expect(missing.status).toBe(404);
    expect(missing.body.ok).toBe(false);
  });
});
