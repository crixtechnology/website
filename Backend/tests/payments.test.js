const request = require("supertest");
const { setupTestDb, teardownTestDb } = require("./testDb");
const { signToken } = require("../src/utils/jwt");

// Mocked so the race test below can actually distinguish "the atomic guard
// worked, exactly one caller minted the receipt" from "it didn't, and both
// calls proceeded" — see that test's own comment for why asserting on the
// DB's final state alone can't tell the two apart.
jest.mock("../src/utils/receiptPdf", () => ({
  buildReceiptPdfBuffer: jest.fn(() => Buffer.from("fake-pdf")),
}));
const { buildReceiptPdfBuffer } = require("../src/utils/receiptPdf");

let app, prisma, attachReceipt;
let adminToken;

beforeAll(async () => {
  app = await setupTestDb();
  ({ prisma } = require("../src/db"));
  ({ attachReceipt } = require("../src/routes/payments"));

  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.com", passwordHash: "x", role: "admin" } });
  adminToken = signToken({ sub: admin.id, role: "admin", email: admin.email }, { expiresIn: "1h" });
}, 60000);
afterAll(async () => { await teardownTestDb(); });

const authed = (req, token) => req.set("Authorization", `Bearer ${token}`);

// Creates a real, purchasable course through the actual admin API (price
// set, then explicitly opened via the separate two-step flow the app
// enforces — see courses.js) rather than inserting one directly, so these
// tests exercise the same state a real course purchase would ever
// actually encounter.
async function createPricedCourse(overrides = {}) {
  const create = await authed(request(app).post("/api/admin/courses"), adminToken).send({
    type: "course", title: `Course ${Date.now()}-${Math.random()}`, price: 5000, ...overrides,
  });
  const open = await authed(request(app).put(`/api/admin/courses/${create.body.course._id}`), adminToken).send({ status: "open" });
  return open.body.course;
}

async function createStudent(email) {
  const signup = await request(app).post("/api/auth/signup").send({
    name: "Student", email, phone: "9876500000", password: "a-real-password",
  });
  return { user: signup.body.user, token: signup.body.token };
}

// Covers two of this session's new server-side guards on /create-order —
// both fixed gaps where the frontend gated the button but nothing stopped
// a direct API call from bypassing it.
describe("POST /api/payments/create-order — server-side guards", () => {
  it("rejects a course with no price instead of silently computing a ₹0 order", async () => {
    // The admin API itself refuses to ever leave a course open with no
    // price (that's the courses.js invariant tested separately in
    // courses.test.js) — so the only realistic way this state exists is
    // exactly how it has before in this codebase: a script/migration
    // creating a Course doc directly, bypassing the route layer entirely
    // (see Backend/src/scripts/seedPrograms.js's own history). Simulating
    // that directly here is what actually exercises this guard, since
    // going through the admin API can't reach it.
    const course = await prisma.course.create({ data: { type: "internship", title: `Unpriced ${Date.now()}`, slug: `unpriced-${Date.now()}`, desc: "", price: null, status: "open" } });
    const { token } = await createStudent("unpriced-buyer@example.com");
    const appRes = await authed(request(app).post("/api/applications"), token).send({
      type: "internship", refTitle: course.title, courseSlug: course.slug,
      name: "Student", email: "unpriced-buyer@example.com", phone: "9876500000",
    });
    const order = await request(app).post("/api/payments/create-order").send({
      applicationId: appRes.body.application._id, courseSlug: course.slug,
    });
    expect(order.status).toBe(400);
    expect(order.body.error).toMatch(/not available/i);
  });

  it("rejects a purchase attempt from a user who already has valid access", async () => {
    const course = await createPricedCourse();
    const { user, token } = await createStudent("repeat-buyer@example.com");
    // Simulates an existing successful purchase directly (bypassing the
    // real Razorpay round-trip, which needs live network access) — this is
    // exactly the state grantAccessForPayment leaves behind after a real
    // payment succeeds.
    await prisma.enrollment.create({ data: { userId: user.id, courseId: course._id, status: "active" } });

    const appRes = await authed(request(app).post("/api/applications"), token).send({
      type: "course", refTitle: course.title, courseSlug: course.slug,
      name: "Student", email: "repeat-buyer@example.com", phone: "9876500000",
    });
    const order = await request(app).post("/api/payments/create-order").send({
      applicationId: appRes.body.application._id, courseSlug: course.slug,
    });
    expect(order.status).toBe(400);
    expect(order.body.error).toMatch(/already have access/i);
  });
});

// Covers the attachReceipt race fix: /verify and the Razorpay webhook can
// both reach attachReceipt for the SAME payment within milliseconds of each
// other in production. Before the fix, a plain "check receipt.number, then
// mutate, then save()" let two concurrent callers both pass the check
// before either had saved, minting two different receipt numbers and
// sending two emails for one purchase. The fix made the mint step a single
// atomic findOneAndUpdate matched on receipt.number still being null.
describe("attachReceipt — concurrent /verify + webhook race", () => {
  it("only the winning call proceeds to build/send the receipt — the loser is a true no-op", async () => {
    const course = await createPricedCourse();
    const { user } = await createStudent("race-buyer@example.com");
    const application = await prisma.application.create({
      data: {
        type: "course", refTitle: course.title, name: "Race Buyer", email: "race-buyer@example.com",
        phone: "9876500000", userId: user.id, courseId: course._id,
      },
    });
    const payment = await prisma.payment.create({
      data: { razorpayOrderId: `order_test_${Date.now()}`, amount: 500000, status: "paid", applicationId: application.id },
    });

    // Two independent row fetches pointing at the same DB record — exactly
    // what /verify and the webhook each produce with their own separate
    // Payment lookup.
    const [paymentA, paymentB] = await Promise.all([
      prisma.payment.findUnique({ where: { id: payment.id } }),
      prisma.payment.findUnique({ where: { id: payment.id } }),
    ]);

    buildReceiptPdfBuffer.mockClear();
    const results = await Promise.allSettled([
      attachReceipt(paymentA, application),
      attachReceipt(paymentB, application),
    ]);
    // Neither concurrent call should throw, regardless of which one
    // actually won the race to mint the receipt.
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const final = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(final.receiptNumber).toEqual(expect.any(String));

    // The real invariant the atomic guard protects: only the caller whose
    // findOneAndUpdate actually matched should ever reach the build/send
    // step. A single Payment document can only ever end up with one
    // receipt.number regardless of whether the race guard works — so
    // asserting on the document's final state alone (as an earlier version
    // of this test did) can't tell "the guard worked" apart from "it
    // didn't, and one racing write simply landed last." This call-count
    // check can: with the old check-then-save() pattern, BOTH concurrent
    // calls would pass the pre-save check and both would reach this step.
    expect(buildReceiptPdfBuffer).toHaveBeenCalledTimes(1);
  });
});
