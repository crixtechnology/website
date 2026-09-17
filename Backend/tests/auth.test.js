const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");

let app;
let User;

beforeAll(async () => {
  app = await setupTestDb();
  User = require("../src/models/User");
}, 60000);
afterAll(async () => { await teardownTestDb(); });

// Covers the duplicate-signup fix from this session: routes/auth.js used to
// let a duplicate-email create() throw an uncaught E11000, which fell
// through to the generic error handler as a raw 500 with the Mongo error
// string (exposing db/collection/index names) instead of a clean 409.
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

  it("rejects a second signup with the same email as a clean 409, not a raw 500", async () => {
    const res = await request(app).post("/api/auth/signup").send(validSignup);
    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    // The bug this guards against specifically leaked the Mongo error
    // string (mentions "E11000"/"duplicate key") into the response body.
    expect(JSON.stringify(res.body)).not.toMatch(/E11000|duplicate key|MongoServerError/i);
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
    await User.updateOne({ email }, { $set: { activeSessionId: null, activeSessionLastSeenAt: null } });
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
    await User.updateOne({ email }, { $set: { activeSessionId: null, activeSessionLastSeenAt: null } });
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
    await User.updateOne({ email }, { $set: { activeSessionLastSeenAt: new Date(Date.now() - 31 * 60 * 1000) } });

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
