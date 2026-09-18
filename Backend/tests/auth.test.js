const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");

let app;
let prisma;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
}, 60000);
afterAll(async () => { await teardownTestDb(); });

describe("POST /api/auth/signup", () => {
  const email = "duplicate-test@example.com";
  const validSignup = { name: "Test User", email, phone: "9876543210", password: "a-real-password" };

  it("creates a new account", async () => {
    const res = await request(app).post("/api/auth/signup").send(validSignup);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email);
  });

  // Anti-enumeration: a duplicate-email signup must look the same, from the
  // outside, as a real one — same status code, same `ok: true`, nothing that
  // distinguishes it (an old "An account already exists" 409 let anyone
  // probe arbitrary addresses and learn which ones are registered). It must
  // NOT get a real session token though — that would log the caller straight
  // into someone else's account, an actual account-takeover bug.
  it("responds ambiguously to a duplicate email instead of confirming the account exists", async () => {
    const res = await request(app).post("/api/auth/signup").send(validSignup);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeFalsy();
    expect(JSON.stringify(res.body)).not.toMatch(/already exists|P2002|Unique constraint|PrismaClientKnownRequestError/i);

    // And no second account was actually created for the same email.
    const count = await prisma.user.count({ where: { email } });
    expect(count).toBe(1);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await request(app).post("/api/auth/signup").send({ ...validSignup, email: "short-pw@example.com", password: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects a disposable email domain", async () => {
    const res = await request(app).post("/api/auth/signup").send({ ...validSignup, email: "someone@mailinator.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/disposable|temporary/i);
  });
});

describe("POST /api/auth/login", () => {
  const email = "login-test@example.com";
  const password = "a-real-password";

  beforeAll(async () => {
    await request(app).post("/api/auth/signup").send({ name: "Login Test", email, phone: "9876543211", password });
    // Signup itself starts a live session (a freshly-signed-up user is
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

  // Anti-enumeration: a nonexistent email, a wrong password on a real
  // account, and a password attempt on a Google-only account must all be
  // indistinguishable from the outside — same status, same exact message.
  // (Timing is the other half of this leak — see routes/auth.js's
  // DUMMY_PASSWORD_HASH — but response time isn't something worth asserting
  // on in a test; it's covered by always calling bcrypt.compare() in the
  // same code path regardless of branch.)
  it("returns the identical response for a nonexistent email, a wrong password, and a Google-only account", async () => {
    const googleEmail = "google-only-login-test@example.com";
    await prisma.user.create({ data: { name: "Google Only", email: googleEmail, googleId: "fake-google-sub-123", role: "student" } });

    const [noSuchUser, wrongPassword, googleOnly] = await Promise.all([
      request(app).post("/api/auth/login").send({ email: "nobody-here@example.com", password: "whatever123" }),
      request(app).post("/api/auth/login").send({ email, password: "wrong-password" }),
      request(app).post("/api/auth/login").send({ email: googleEmail, password: "whatever123" }),
    ]);

    for (const res of [noSuchUser, wrongPassword, googleOnly]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ ok: false, error: "Invalid credentials" });
    }
  });
});

describe("single-device-login enforcement", () => {
  const email = "single-device-test@example.com";
  const password = "a-real-password";

  beforeAll(async () => {
    await request(app).post("/api/auth/signup").send({ name: "Single Device", email, phone: "9876543212", password });
  });

  // Each test starts from a clean slot regardless of what a previous test in
  // this block left behind — signup itself also starts a live session, same
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
