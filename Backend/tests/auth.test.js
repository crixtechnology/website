const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { newStudent } = require("./helpers/newStudent");

let app;
let prisma;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
}, 60000);
afterAll(async () => { await teardownTestDb(); });

describe("the retired sign-up endpoint", () => {
  // Accounts are created from the login form now. A page still open from before
  // gets a message its old form can show, and nothing is created.
  it("says sign-up has moved, and creates nothing", async () => {
    const res = await request(app).post("/api/auth/signup").send({ ageConfirmed: true, name: "Old Page", email: "old-page@example.com", phone: "9876543210", password: "a-real-password" });
    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({ ok: false, code: "SIGNUP_MOVED" });
    expect(res.body.error).toMatch(/log in with your email and a password/);
    expect(await prisma.user.findUnique({ where: { email: "old-page@example.com" } })).toBeNull();
  });
});

describe("POST /api/auth/login", () => {
  const email = "login-test@example.com";
  const password = "a-real-password";

  beforeAll(async () => {
    await newStudent(app, { name: "Login Test", email, phone: "9876543211", password });
    // Creating the account starts a live session (a new user is
    // immediately logged in) — clear it so the login test below exercises
    // /login in isolation instead of tripping the single-device-login block
    // this same session would otherwise trigger against itself.
    await prisma.user.updateMany({ where: { email }, data: { activeSessionId: null, activeSessionLastSeenAt: null } });
  });

  it("logs in with the correct password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it("rejects the wrong password without revealing whether the email exists", async () => {
    const res = await request(app).post("/api/auth/login").send({ email, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  // A wrong password on a real account and a password attempt on a Google-only
  // account look the same from the outside — same status, same exact message.
  // (A nonexistent email is different by design: the login form offers to
  // create the account — see "creating an account from the login form".)
  it("returns the identical response for a wrong password and a Google-only account", async () => {
    const googleEmail = "google-only-login-test@example.com";
    await prisma.user.create({ data: { name: "Google Only", email: googleEmail, googleId: "fake-google-sub-123", role: "student" } });

    const [wrongPassword, googleOnly] = await Promise.all([
      request(app).post("/api/auth/login").send({ email, password: "wrong-password" }),
      request(app).post("/api/auth/login").send({ email: googleEmail, password: "whatever123" }),
    ]);

    for (const res of [wrongPassword, googleOnly]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ ok: false, error: "Invalid credentials" });
    }
  });
});

describe("single-device-login enforcement", () => {
  const email = "single-device-test@example.com";
  const password = "a-real-password";

  beforeAll(async () => {
    await newStudent(app, { name: "Single Device", email, phone: "9876543212", password });
  });

  // Each test starts from a clean slot regardless of what a previous test in
  // this block left behind — creating the account also starts a live session, same
  // as a real login does.
  beforeEach(async () => {
    await prisma.user.updateMany({ where: { email }, data: { activeSessionId: null, activeSessionLastSeenAt: null } });
  });

  it("blocks a second login while the first session is still live", async () => {
    const first = await request(app).post("/api/auth/login").send({ email, password });
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/auth/login").send({ email, password });
    expect(second.status).toBe(409);
    expect(second.body.ok).toBe(false);
    expect(second.body.error).toMatch(/already logged in on another device/i);
  });

  it("lets a second login through once the first session has gone idle, and invalidates the first device's token", async () => {
    const firstLogin = await request(app).post("/api/auth/login").send({ email, password });
    expect(firstLogin.status).toBe(200);
    const firstToken = firstLogin.body.token;

    // Simulate the first session having gone idle past IDLE_TIMEOUT_MS.
    await prisma.user.updateMany({ where: { email }, data: { activeSessionLastSeenAt: new Date(Date.now() - 31 * 60 * 1000) } });

    const secondLogin = await request(app).post("/api/auth/login").send({ email, password });
    expect(secondLogin.status).toBe(200);

    const firstDeviceReq = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${firstToken}`);
    expect(firstDeviceReq.status).toBe(401);
  });

  it("lets a fresh login through immediately after an explicit logout", async () => {
    const login1 = await request(app).post("/api/auth/login").send({ email, password });
    expect(login1.status).toBe(200);

    const logoutRes = await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${login1.body.token}`);
    expect(logoutRes.status).toBe(200);

    const login2 = await request(app).post("/api/auth/login").send({ email, password });
    expect(login2.status).toBe(200);
  });
});
