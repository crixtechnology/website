const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");

// The site has no separate sign-up form: /auth/login with an email that has no
// account offers to create one (routes/auth.js createFromLogin). Its own file
// so these logins don't use up auth.test.js's per-IP login allowance.
let app;
let prisma;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
}, 60000);
afterAll(async () => { await teardownTestDb(); });

describe("creating an account from the login form", () => {
  const login = (body) => request(app).post("/api/auth/login").send(body);

  it("asks to confirm a new email first, and creates nothing until then", async () => {
    const res = await login({ email: "fresh-one@example.com", password: "a-real-password" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NEW_ACCOUNT");
    expect(await prisma.user.count({ where: { email: "fresh-one@example.com" } })).toBe(0);
  });

  it("needs the age confirmation, a long-enough password and a permanent email", async () => {
    const base = { email: "fresh-two@example.com", password: "a-real-password", createAccount: true };
    expect((await login(base)).body.code).toBe("AGE_CONFIRMATION_REQUIRED");
    expect((await login({ ...base, ageConfirmed: true, password: "short" })).status).toBe(400);
    expect((await login({ ...base, ageConfirmed: true, email: "someone@mailinator.com" })).status).toBe(400);
    expect(await prisma.user.count({ where: { email: "fresh-two@example.com" } })).toBe(0);
  });

  it("creates the account with that password, a placeholder name and a pending profile", async () => {
    const res = await login({ email: "rahul.sharma99@example.com", password: "a-real-password", createAccount: true, ageConfirmed: true });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual(expect.objectContaining({ name: "Rahul Sharma", phone: "", profilePending: true }));
    const row = await prisma.user.findUnique({ where: { email: "rahul.sharma99@example.com" } });
    expect(row.role).toBe("student");
    expect(row.ageConfirmedAt).toBeInstanceOf(Date);

    // The same email and password now simply log in.
    await prisma.user.update({ where: { id: row.id }, data: { activeSessionId: null, activeSessionLastSeenAt: null } });
    const again = await login({ email: "rahul.sharma99@example.com", password: "a-real-password" });
    expect(again.status).toBe(200);
    expect(again.body.created).toBeUndefined();
    // ...and a wrong password is still just wrong — it never makes a second account.
    const wrong = await login({ email: "rahul.sharma99@example.com", password: "not-the-password", createAccount: true, ageConfirmed: true });
    expect(wrong.status).toBe(401);
  });

  it("clears the pending flag only when the owner confirms a name in Profile", async () => {
    const res = await login({ email: "fresh-three@example.com", password: "a-real-password", createAccount: true, ageConfirmed: true });
    const patch = (body) => request(app).patch("/api/auth/me").set("Authorization", `Bearer ${res.body.token}`).send(body);
    // Sending the placeholder back unchanged (e.g. an old page) doesn't count as confirming it.
    const echoed = await patch({ name: "Fresh Three", phone: "9876500003" });
    expect(echoed.body.user.profilePending).toBe(true);
    // The Profile page confirms it — even when the real name is the same as the placeholder.
    const saved = await patch({ name: "Fresh Three", phone: "9876500003", confirmName: true });
    expect(saved.status).toBe(200);
    expect(saved.body.user).toEqual(expect.objectContaining({ name: "Fresh Three", phone: "9876500003", profilePending: false }));
  });

  it("also clears it when a different name is saved", async () => {
    const res = await login({ email: "fresh-four@example.com", password: "a-real-password", createAccount: true, ageConfirmed: true });
    const saved = await request(app).patch("/api/auth/me").set("Authorization", `Bearer ${res.body.token}`).send({ name: "Meera Iyer" });
    expect(saved.body.user.profilePending).toBe(false);
  });
});
