const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

let app, prisma, adminToken;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "reset-admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);

describe("admin resets a student's password", () => {
  it("hands back a one-time password that works, logs the old session out, and asks for a new one", async () => {
    const signup = await request(app).post("/api/auth/signup").send({ name: "Forgetful", email: "forgetful@example.com", phone: "9876500000", password: "old-password-1" });
    const userId = signup.body.user.id;
    const oldToken = signup.body.token;

    const reset = await authed(request(app).post(`/api/admin/users/${userId}/reset-password`), adminToken);
    expect(reset.status).toBe(200);
    expect(reset.headers["cache-control"]).toBe("no-store");
    const temp = reset.body.tempPassword;
    expect(temp).toMatch(/^[A-Za-z0-9]{12}$/);

    // The session that was open before is gone, and the old password no longer works.
    expect((await authed(request(app).get("/api/auth/me"), oldToken)).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: "forgetful@example.com", password: "old-password-1" })).status).toBe(401);

    const login = await request(app).post("/api/auth/login").send({ email: "forgetful@example.com", password: temp });
    expect(login.body.ok).toBe(true);
    expect(login.body.user.mustChangePassword).toBe(true);

    const changed = await authed(request(app).post("/api/auth/change-password"), login.body.token)
      .send({ currentPassword: temp, newPassword: "brand-new-password-2" });
    expect(changed.body.ok).toBe(true);
    const me = await authed(request(app).get("/api/auth/me"), login.body.token);
    expect(me.body.user.mustChangePassword).toBe(false);
  });

  it("is admin-only and won't reset an admin's password", async () => {
    const student = await request(app).post("/api/auth/signup").send({ name: "Nosy", email: "nosy@example.com", phone: "9876500001", password: "nosy-password-1" });
    const victim = await prisma.user.create({ data: { name: "Victim", email: "victim@example.com", passwordHash: "x" } });
    expect((await authed(request(app).post(`/api/admin/users/${victim.id}/reset-password`), student.body.token)).status).toBe(403);
    expect((await request(app).post(`/api/admin/users/${victim.id}/reset-password`)).status).toBe(401);

    const otherAdmin = await prisma.user.create({ data: { name: "Other admin", email: "other-admin@test.com", passwordHash: "x", role: "admin" } });
    const res = await authed(request(app).post(`/api/admin/users/${otherAdmin.id}/reset-password`), adminToken);
    expect(res.status).toBe(400);
  });
});
