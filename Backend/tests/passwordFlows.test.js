// Forgot password (emailed OTP), change password, Google starter password +
// view-after-OTP, and the SMTP receipt sender. nodemailer and Google's token
// verifier are mocked: no network, and the emails' contents can be read back.
const mockSendMail = jest.fn();
jest.mock("nodemailer", () => ({ createTransport: jest.fn(() => ({ sendMail: mockSendMail })) }));
const mockVerifyIdToken = jest.fn();
jest.mock("google-auth-library", () => ({ OAuth2Client: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })) }));

// Must be set before ../src/app is first required (inside setupTestDb).
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";

const request = require("supertest");
const bcrypt = require("bcryptjs");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

let app;
let prisma;
// Required inside beforeAll, AFTER setupTestDb() has pointed DATABASE_URL at
// crix_test — requiring these at file top (or in a describe body) would bind
// Prisma to the real dev database.
let issueOtp, verifyOtp, sendReceiptEmail, encryptPassword, decryptPassword, generateDefaultPassword;

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const tokenFor = (u) => signToken({ sub: u.id, role: u.role, email: u.email }, { expiresIn: "1h" });
const mailsTo = (addr) => mockSendMail.mock.calls.map((c) => c[0]).filter((m) => m.to === addr);
const lastCode = (addr) => {
  const m = mailsTo(addr).filter((x) => /\b\d{6}\b/.test(x.text)).pop();
  return m ? m.text.match(/\b(\d{6})\b/)[1] : null;
};
// Lets a second code be requested without waiting out the 60s resend cooldown.
const skipCooldown = () => prisma.emailOtp.updateMany({ data: { createdAt: new Date(Date.now() - 120000) } });

async function makeUser(email, password, extra = {}) {
  return prisma.user.create({
    data: { name: "Test Person", email, phone: "9876543210", role: "student", passwordHash: password ? await bcrypt.hash(password, 4) : null, ...extra },
  });
}

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  ({ issueOtp, verifyOtp } = require("../src/utils/otp"));
  ({ sendReceiptEmail } = require("../src/utils/mailer"));
  ({ encryptPassword, decryptPassword, generateDefaultPassword } = require("../src/utils/passwordVault"));
  process.env.SMTP_HOST = "smtp.test.local"; // read lazily by the mailer
  process.env.SMTP_FROM = "Crix <no-reply@test.local>";
}, 90000);
afterAll(async () => { await teardownTestDb(); });
beforeEach(() => { mockSendMail.mockReset(); mockSendMail.mockResolvedValue({ messageId: "<m1@test>" }); });

describe("forgot password", () => {
  it("answers identically for an unknown email and sends nothing", async () => {
    const known = await makeUser("known-forgot@example.com", "OldPassword1");
    const a = await request(app).post("/api/auth/forgot-password").send({ email: "nobody-here@example.com" });
    const b = await request(app).post("/api/auth/forgot-password").send({ email: known.email });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body).toEqual(b.body);
    expect(mailsTo("nobody-here@example.com")).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 50)); // the send is fire-and-forget
    expect(mailsTo(known.email)).toHaveLength(1);

    // The email carries a 6-digit code; the DB holds only a hash of it.
    const code = lastCode(known.email);
    expect(code).toMatch(/^\d{6}$/);
    const row = await prisma.emailOtp.findUnique({ where: { userId_purpose: { userId: known.id, purpose: "reset_password" } } });
    expect(row.codeHash).not.toContain(code);
  });

  it("rejects a malformed email", async () => {
    expect((await request(app).post("/api/auth/forgot-password").send({ email: "not-an-email" })).status).toBe(400);
  });
});

describe("reset password with the emailed code", () => {
  let user, code;
  beforeAll(async () => {
    user = await makeUser("reset-me@example.com", "OldPassword1", { activeSessionId: "some-session", activeSessionLastSeenAt: new Date() });
    await request(app).post("/api/auth/forgot-password").send({ email: user.email });
    await new Promise((r) => setTimeout(r, 50));
    code = lastCode(user.email);
  });

  it("refuses a wrong code and a too-short password", async () => {
    const wrong = await request(app).post("/api/auth/reset-password").send({ email: user.email, otp: code === "000000" ? "111111" : "000000", newPassword: "BrandNewPass9" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatch(/invalid or has expired/i);
    const short = await request(app).post("/api/auth/reset-password").send({ email: user.email, otp: code, newPassword: "short" });
    expect(short.status).toBe(400);
    expect((await prisma.user.findUnique({ where: { id: user.id } })).passwordHash).toEqual(user.passwordHash); // untouched
  });

  it("sets the new password with the right code, signs other devices out, and the code is single-use", async () => {
    const ok = await request(app).post("/api/auth/reset-password").send({ email: user.email, otp: code, newPassword: "BrandNewPass9" });
    expect(ok.status).toBe(200);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await bcrypt.compare("BrandNewPass9", after.passwordHash)).toBe(true);
    expect(after.activeSessionId).toBeNull();

    const reuse = await request(app).post("/api/auth/reset-password").send({ email: user.email, otp: code, newPassword: "AnotherPass77" });
    expect(reuse.status).toBe(400);

    expect((await request(app).post("/api/auth/login").send({ email: user.email, password: "OldPassword1" })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: user.email, password: "BrandNewPass9" })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(mailsTo(user.email).some((m) => /password was changed/i.test(m.subject))).toBe(true);
  });
});

describe("OTP rules", () => {
  let u;
  beforeAll(async () => { u = await makeUser("otp-rules@example.com", "SomePassword1"); });

  it("dies after 5 wrong tries, even if the right code follows", async () => {
    const { code } = await issueOtp(u.id, "reset_password");
    const wrong = code === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) expect(await verifyOtp(u.id, "reset_password", wrong)).toBe(false);
    expect(await verifyOtp(u.id, "reset_password", code)).toBe(false);
  });

  it("expires after its lifetime", async () => {
    await skipCooldown();
    const { code } = await issueOtp(u.id, "reset_password");
    await prisma.emailOtp.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await verifyOtp(u.id, "reset_password", code)).toBe(false);
  });

  it("won't issue a second code inside the resend cooldown, and codes are per purpose", async () => {
    await skipCooldown();
    const first = await issueOtp(u.id, "view_password");
    expect(first.code).toBeTruthy();
    const second = await issueOtp(u.id, "view_password");
    expect(second.wait).toBeGreaterThan(0);
    // A reset code can't be used to view a password.
    expect(await verifyOtp(u.id, "reset_password", first.code)).toBe(false);
    expect(await verifyOtp(u.id, "view_password", first.code)).toBe(true);
  });
});

describe("change password (logged in)", () => {
  let user, token;
  beforeAll(async () => { user = await makeUser("change-me@example.com", "CurrentPass1"); token = tokenFor(user); });

  it("validates the old password (as a 400, never a 401 that would log them out) and the new one", async () => {
    const wrong = await request(app).post("/api/auth/change-password").set(auth(token)).send({ currentPassword: "nope-nope", newPassword: "NewPassword22" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatch(/current password is incorrect/i);
    expect((await request(app).post("/api/auth/change-password").set(auth(token)).send({ currentPassword: "CurrentPass1", newPassword: "short" })).status).toBe(400);
    expect((await request(app).post("/api/auth/change-password").set(auth(token)).send({ currentPassword: "CurrentPass1", newPassword: "CurrentPass1" })).status).toBe(400);
    expect((await request(app).post("/api/auth/change-password").send({ currentPassword: "CurrentPass1", newPassword: "NewPassword22" })).status).toBe(401);
  });

  it("changes it when the old one is right", async () => {
    const ok = await request(app).post("/api/auth/change-password").set(auth(token)).send({ currentPassword: "CurrentPass1", newPassword: "NewPassword22" });
    expect(ok.status).toBe(200);
    expect(await bcrypt.compare("NewPassword22", (await prisma.user.findUnique({ where: { id: user.id } })).passwordHash)).toBe(true);
  });
});

describe("Google accounts get a starter password they can view after an OTP", () => {
  const googleProfile = (email, sub) => ({ getPayload: () => ({ email, email_verified: true, sub, name: "Gee Oh" }) });
  let token, userId, revealed, revealCode;

  it("creates a working starter password on first Google sign-in", async () => {
    mockVerifyIdToken.mockResolvedValue(googleProfile("newgoogle@example.com", "g-1"));
    const res = await request(app).post("/api/auth/google").send({ credential: "tok" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ hasPassword: true, hasDefaultPassword: true, isGoogleAccount: true });
    expect(JSON.stringify(res.body)).not.toMatch(/defaultPasswordEnc|passwordHash/);
    token = res.body.token;
    userId = res.body.user.id;
    const row = await prisma.user.findUnique({ where: { id: userId } });
    expect(row.passwordHash).toBeTruthy();
    expect(row.defaultPasswordEnc).toBeTruthy();
  });

  it("does not show it without a valid code", async () => {
    const req1 = await request(app).post("/api/auth/password/reveal/request").set(auth(token));
    expect(req1.status).toBe(200);
    expect(mailsTo("newgoogle@example.com")).toHaveLength(1);
    revealCode = lastCode("newgoogle@example.com"); // kept for the next test (the mail mock resets between tests)
    const bad = await request(app).post("/api/auth/password/reveal/verify").set(auth(token)).send({ otp: revealCode === "000000" ? "111111" : "000000" });
    expect(bad.status).toBe(400);
    expect(bad.body.password).toBeUndefined();
    // requesting again straight away is throttled
    expect((await request(app).post("/api/auth/password/reveal/request").set(auth(token))).status).toBe(429);
  });

  it("shows it after the right code, and that password really logs in", async () => {
    const code = revealCode;
    const ok = await request(app).post("/api/auth/password/reveal/verify").set(auth(token)).send({ otp: code });
    expect(ok.status).toBe(200);
    expect(ok.headers["cache-control"]).toMatch(/no-store/);
    revealed = ok.body.password;
    expect(revealed).toMatch(/^[A-Za-z0-9]{12}$/);
    // The code is single-use.
    expect((await request(app).post("/api/auth/password/reveal/verify").set(auth(token)).send({ otp: code })).status).toBe(400);
    // Free the single-device slot the Google login took, then log in with the password.
    await request(app).post("/api/auth/logout").set(auth(token));
    const login = await request(app).post("/api/auth/login").send({ email: "newgoogle@example.com", password: revealed });
    expect(login.status).toBe(200);
  });

  it("stops being viewable once the owner sets their own password", async () => {
    const t = tokenFor({ id: userId, role: "student", email: "newgoogle@example.com" });
    const change = await request(app).post("/api/auth/change-password").set(auth(t)).send({ currentPassword: revealed, newPassword: "MyOwnChoice123" });
    expect(change.status).toBe(200);
    const row = await prisma.user.findUnique({ where: { id: userId } });
    expect(row.defaultPasswordEnc).toBeNull();
    const again = await request(app).post("/api/auth/password/reveal/request").set(auth(t));
    expect(again.status).toBe(400);
    expect(again.body.code).toBe("NOT_REVEALABLE");
  });

  it("leaves a password account that links Google alone, and can't reveal a self-chosen password", async () => {
    const pw = await makeUser("linkme@example.com", "MyRealPassword1");
    mockVerifyIdToken.mockResolvedValue(googleProfile("linkme@example.com", "g-2"));
    const res = await request(app).post("/api/auth/google").send({ credential: "tok" });
    expect(res.body.user).toMatchObject({ hasPassword: true, hasDefaultPassword: false, isGoogleAccount: true });
    const row = await prisma.user.findUnique({ where: { id: pw.id } });
    expect(row.passwordHash).toEqual(pw.passwordHash);
    const reveal = await request(app).post("/api/auth/password/reveal/request").set(auth(res.body.token));
    expect(reveal.status).toBe(400);
    expect(reveal.body.code).toBe("NOT_REVEALABLE");
  });

  it("gives an older Google-only account (no password yet) one on its next Google sign-in", async () => {
    const legacy = await makeUser("legacy-google@example.com", null, { googleId: "g-3" });
    mockVerifyIdToken.mockResolvedValue(googleProfile("legacy-google@example.com", "g-3"));
    const res = await request(app).post("/api/auth/google").send({ credential: "tok" });
    expect(res.body.user).toMatchObject({ hasPassword: true, hasDefaultPassword: true });
    expect((await prisma.user.findUnique({ where: { id: legacy.id } })).passwordHash).toBeTruthy();
  });

  it("says so plainly (503) if the code email can't be sent, and lets them retry at once", async () => {
    const u = await makeUser("smtp-down@example.com", null, { googleId: "g-4" });
    mockVerifyIdToken.mockResolvedValue(googleProfile("smtp-down@example.com", "g-4"));
    const login = await request(app).post("/api/auth/google").send({ credential: "tok" });
    mockSendMail.mockRejectedValueOnce(new Error("connect ETIMEDOUT"));
    const down = await request(app).post("/api/auth/password/reveal/request").set(auth(login.body.token));
    expect(down.status).toBe(503);
    const retry = await request(app).post("/api/auth/password/reveal/request").set(auth(login.body.token));
    expect(retry.status).toBe(200);
    expect(u.id).toBe(login.body.user.id);
  });
});

describe("purchase receipt over SMTP", () => {
  const base = { receiptNumber: "CRX-2026-00042", buyerName: "Asha", buyerEmail: "asha@example.com", itemTitle: "Some Program", tier: "plus", totalPaid: 4999 };

  it.each(["course", "internship"])("emails the PDF receipt for a %s", async (itemType) => {
    const pdf = Buffer.from("%PDF-1.4 fake");
    const res = await sendReceiptEmail({ receipt: { ...base, itemType }, pdfBuffer: pdf });
    expect(res.sent).toBe(true);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe("asha@example.com");
    expect(mail.from).toBe("Crix <no-reply@test.local>");
    expect(mail.subject).toContain("CRX-2026-00042");
    expect(mail.html).toContain(itemType);
    expect(mail.attachments[0]).toMatchObject({ filename: "Receipt-CRX-2026-00042.pdf", contentType: "application/pdf", content: pdf });
  });

  it("escapes buyer-supplied text in the HTML", async () => {
    await sendReceiptEmail({ receipt: { ...base, itemType: "course", buyerName: "<script>x</script>" }, pdfBuffer: Buffer.from("x") });
    expect(mockSendMail.mock.calls[0][0].html).not.toContain("<script>");
  });

  it("does nothing (and doesn't throw) when SMTP isn't configured", async () => {
    const saved = process.env.SMTP_HOST;
    process.env.SMTP_HOST = "";
    try {
      const res = await sendReceiptEmail({ receipt: { ...base, itemType: "course" }, pdfBuffer: Buffer.from("x") });
      expect(res.sent).toBe(false);
      expect(mockSendMail).not.toHaveBeenCalled();
    } finally { process.env.SMTP_HOST = saved; }
  });
});

describe("starter-password vault", () => {
  it("round-trips, generates unique readable passwords, and rejects tampering or a different key", () => {
    const p = generateDefaultPassword();
    expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
    expect(p).not.toBe(generateDefaultPassword());
    const blob = encryptPassword(p);
    expect(blob).not.toContain(p);
    expect(decryptPassword(blob)).toBe(p);
    const raw = Buffer.from(blob, "base64");
    raw[raw.length - 1] ^= 1;
    expect(decryptPassword(raw.toString("base64"))).toBeNull();
    const saved = process.env.DEFAULT_PASSWORD_KEY;
    process.env.DEFAULT_PASSWORD_KEY = "a-different-key";
    try { expect(decryptPassword(blob)).toBeNull(); } finally { if (saved === undefined) delete process.env.DEFAULT_PASSWORD_KEY; else process.env.DEFAULT_PASSWORD_KEY = saved; }
  });
});
