const { setupTestDb, teardownTestDb } = require("./testDb");

// Every receipt on the site (courses, internships, upgrades, payment requests,
// wallet purchases, aptitude-test fees) is numbered by utils/receiptNumber.js:
// CRX-<CR|IN|AT>-<yy>-<serial>, one consecutive series per type. No two
// receipts may ever share a number, and races must not skip numbers.
let prisma, receipts;
let seq = 0;

const newPayment = () => prisma.payment.create({ data: { razorpayOrderId: `order_rn_${++seq}`, amount: 10000, status: "paid" } });
const serial = (n) => Number(String(n).split("-").pop());
const counterValue = async (code) => (await prisma.counter.findUnique({ where: { name: `receipt_${code}` } }))?.seq || 0;
const issue = async (itemType) => receipts.issueReceiptNumber((await newPayment()).id, { receiptItemType: itemType, receiptItemTitle: "Item" });

beforeAll(async () => {
  await setupTestDb();
  ({ prisma } = require("../src/db"));
  receipts = require("../src/utils/receiptNumber");
}, 60000);
afterAll(async () => { await teardownTestDb(); });

describe("receipt numbers", () => {
  it("files each kind of purchase under its own initials, each series counting from 1", async () => {
    const course = await issue("course");
    const internship = await issue("internship");
    const test = await issue("aptitude_test");
    const yy = String(new Date().getFullYear() % 100).padStart(2, "0");
    expect(course.receiptNumber).toBe(`CRX-CR-${yy}-00001`);
    expect(internship.receiptNumber).toBe(`CRX-IN-${yy}-00001`);
    expect(test.receiptNumber).toBe(`CRX-AT-${yy}-00001`);
    expect((await issue("course")).receiptNumber).toBe(`CRX-CR-${yy}-00002`);
    // Within GST's 16-character limit.
    for (const r of [course, internship, test]) expect(r.receiptNumber.length).toBeLessThanOrEqual(16);
  });

  it("gives many payments numbered at the same moment all different, consecutive numbers in each series", async () => {
    const kinds = Array.from({ length: 18 }, (_, i) => ["course", "internship", "aptitude_test"][i % 3]);
    const issued = await Promise.all(kinds.map((k) => issue(k)));
    const numbers = issued.map((x) => x.receiptNumber);
    expect(new Set(numbers).size).toBe(18);
    for (const code of ["CR", "IN", "AT"]) {
      const serials = numbers.filter((n) => n.startsWith(`CRX-${code}-`)).map(serial).sort((a, b) => a - b);
      expect(serials).toHaveLength(6);
      expect(serials).toEqual(Array.from({ length: 6 }, (_, i) => serials[0] + i)); // no gaps
    }
  });

  it("numbers a payment once when /verify and the webhook race, without skipping a number", async () => {
    const payment = await newPayment();
    const before = await counterValue("CR");
    const results = await Promise.all(Array.from({ length: 5 }, () => receipts.issueReceiptNumber(payment.id, { receiptItemType: "course" })));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await counterValue("CR")).toBe(before + 1);
    const saved = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(saved.receiptNumber).toBe(results.find(Boolean).receiptNumber);
    expect(saved.receiptIssuedAt).toBeInstanceOf(Date);
  });

  it("never reuses a number when a counter has fallen behind (restored backup, reset table)", async () => {
    const used = (await prisma.payment.findMany({ where: { receiptNumber: { startsWith: "CRX-IN-" } } })).map((p) => serial(p.receiptNumber));
    await prisma.counter.update({ where: { name: "receipt_IN" }, data: { seq: 0 } });
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const issued = await issue("internship");
    errors.mockRestore();
    expect(serial(issued.receiptNumber)).toBe(Math.max(...used) + 1);
    const all = (await prisma.payment.findMany({ where: { receiptNumber: { not: null } } })).map((p) => p.receiptNumber);
    expect(new Set(all).size).toBe(all.length);
  });

  it("can't clash with receipts issued in the old CRX-<year>-<serial> format", async () => {
    await prisma.payment.create({ data: { razorpayOrderId: "order_rn_old", amount: 100, status: "paid", receiptNumber: "CRX-2026-00001" } });
    const fresh = await issue("course");
    expect(fresh.receiptNumber).toMatch(/^CRX-CR-\d{2}-\d{5}$/);
  });

  it("uses the year in India, and a serial that never resets or runs out", () => {
    // 31 Dec 2026, 19:00 UTC is already 1 Jan 2027 in India.
    expect(receipts.formatReceiptNumber(7, new Date("2026-12-31T19:00:00Z"), "CR")).toBe("CRX-CR-27-00007");
    expect(receipts.formatReceiptNumber(123456, new Date("2026-06-01T00:00:00Z"), "IN")).toBe("CRX-IN-26-123456");
  });
});
