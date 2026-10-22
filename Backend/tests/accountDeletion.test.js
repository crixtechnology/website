const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// A student deleting their own account (routes/account.js) — the DPDP Act
// right to erasure — and the shared erasure it runs (utils/accountDeletion.js).
jest.mock("../src/utils/rateLimit", () => ({ publicWriteLimiter: (req, res, next) => next() }));
jest.mock("../src/utils/mailer", () => ({
  sendOtpEmail: jest.fn(async () => ({ sent: true })),
  sendAccountDeletedEmail: jest.fn(async () => ({ sent: true })),
  sendApplicationEmail: jest.fn(async () => ({})),
  sendWelcomeEmail: jest.fn(async () => ({})),
  sendReceiptEmail: jest.fn(async () => ({})),
  sendContactEmail: jest.fn(async () => ({})),
  sendWalletCreditEmail: jest.fn(async () => ({})),
}));
jest.mock("../src/utils/proctorStorage", () => ({
  PENDING_PREFIX: "pending:",
  saveSnapshot: jest.fn(async () => "local:x/y.jpg"),
  readSnapshot: jest.fn(async () => Buffer.from([])),
  deleteSnapshot: jest.fn(async () => {}),
}));
const mailer = require("../src/utils/mailer");

let app, prisma, adminToken;
let seq = 0;

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);
const lastCode = () => mailer.sendOtpEmail.mock.calls[mailer.sendOtpEmail.mock.calls.length - 1][0].code;
const sendCode = (s) => authed(request(app).post("/api/me/account/deletion/send-code"), s.token).send({});
const confirmDelete = (s, body) => authed(request(app).post("/api/me/account/deletion"), s.token).send(body);

async function student(label = "leaver") {
  const user = await prisma.user.create({
    data: { name: "Leaving Student", email: `${label}${++seq}@example.com`, phone: "9876500000", passwordHash: "x", role: "student" },
  });
  return { id: user.id, email: user.email, token: signToken({ sub: user.id, role: "student", email: user.email }, { expiresIn: "1h" }) };
}

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 180000);
afterAll(async () => { await teardownTestDb(); });

describe("deleting my own account", () => {
  it("shows what goes and what is kept, then needs the emailed code and a confirmation", async () => {
    const s = await student();
    await prisma.creditEntry.create({ data: { userId: s.id, amount: 25000, kind: "adjustment" } });
    const application = await prisma.application.create({
      data: { type: "course", refTitle: "Some course", name: "Leaving Student", email: s.email, phone: "9876500000", college: "Some College", userId: s.id },
    });
    const payment = await prisma.payment.create({
      data: { razorpayOrderId: `order_del_${seq}`, amount: 99900, status: "paid", userId: s.id, applicationId: application.id, receiptNumber: `CRX-CR-26-9${seq}`, receiptBuyerName: "Leaving Student", receiptBuyerEmail: s.email },
    });
    await prisma.contact.create({ data: { name: "Leaving Student", email: s.email, message: "Hello" } });
    await prisma.notification.create({ data: { userId: s.id, title: "Hi", body: "There" } });

    const summary = await authed(request(app).get("/api/me/account/deletion"), s.token);
    expect(summary.status).toBe(200);
    expect(summary.body.summary).toMatchObject({ walletCredits: 250, paymentsKept: 1, jobApplications: 0 });

    // No code, a wrong code, or no confirmation: nothing happens.
    mailer.sendOtpEmail.mockClear();
    expect((await sendCode(s)).status).toBe(200);
    expect(mailer.sendOtpEmail).toHaveBeenCalledWith(expect.objectContaining({ to: s.email, purpose: "delete_account" }));
    const code = lastCode();
    expect((await confirmDelete(s, { code, confirm: false })).status).toBe(400);
    expect((await confirmDelete(s, { code: code === "000000" ? "111111" : "000000", confirm: true })).status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id: s.id } })).not.toBeNull();

    const done = await confirmDelete(s, { code, confirm: true });
    expect(done.status).toBe(200);
    expect(done.body.paymentsKept).toBe(1);

    // Gone: the account, its credit, notifications, contact messages.
    expect(await prisma.user.findUnique({ where: { id: s.id } })).toBeNull();
    expect(await prisma.creditEntry.count({ where: { userId: s.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: s.id } })).toBe(0);
    expect(await prisma.contact.count({ where: { email: s.email } })).toBe(0);
    // Kept, with no link to the account: the payment and its receipt; the application is blanked.
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ userId: null, receiptNumber: payment.receiptNumber });
    expect(await prisma.application.findUnique({ where: { id: application.id } })).toMatchObject({ name: "Deleted user", email: "", phone: "", college: "", userId: null });
    // A record that it was done, without the address itself.
    const record = await prisma.accountDeletion.findFirst({ where: { formerUserId: s.id } });
    expect(record).toMatchObject({ requestedBy: "self", adminId: null });
    expect(record.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(record)).not.toContain(s.email);
    // The confirmation email, and the old login no longer works.
    expect(mailer.sendAccountDeletedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: s.email, paymentsKept: 1 }));
    expect((await authed(request(app).get("/api/me/account/deletion"), s.token)).status).toBe(404);
  });

  it("deletes nothing when the test photos can't be removed from storage", async () => {
    const s = await student("stuck");
    const opening = await prisma.jobOpening.create({ data: { slug: `del-role-${seq}`, title: "Role", summary: "", questionCounts: {} } });
    const appl = await prisma.jobApplication.create({ data: { userId: s.id, openingId: opening.id, status: "submitted" } });
    const attempt = await prisma.testAttempt.create({ data: { applicationId: appl.id, userId: s.id, startedAt: new Date(), endsAt: new Date(), settings: {}, paper: [], status: "submitted" } });
    await prisma.testSnapshot.create({ data: { attemptId: attempt.id, storageKey: "local:a/b.jpg" } });
    const storage = require("../src/utils/proctorStorage");
    storage.deleteSnapshot.mockRejectedValueOnce(new Error("storage down"));

    await sendCode(s);
    const res = await confirmDelete(s, { code: lastCode(), confirm: true });
    expect(res.status).toBe(502);
    expect(await prisma.user.findUnique({ where: { id: s.id } })).not.toBeNull();
    expect(await prisma.accountDeletion.count({ where: { formerUserId: s.id } })).toBe(0);
  });

  it("isn't available to admin accounts", async () => {
    expect((await authed(request(app).post("/api/me/account/deletion/send-code"), adminToken).send({})).status).toBe(400);
  });

  it("is recorded the same way when an admin deletes an account", async () => {
    const s = await student("byadmin");
    const res = await authed(request(app).delete(`/api/admin/users/${s.id}`), adminToken);
    expect(res.status).toBe(200);
    expect(await prisma.accountDeletion.findFirst({ where: { formerUserId: s.id } })).toMatchObject({ requestedBy: "admin" });
  });
});
