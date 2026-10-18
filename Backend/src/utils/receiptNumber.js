const { prisma } = require("../db");

// The ONE place a receipt/invoice number is made — every kind of purchase
// (course, internship, plan upgrade, payment request, wallet purchase,
// aptitude-test fee) gets its number here, so no two receipts can ever carry
// the same number, whatever they were for.
//
// Format: CRX-<type>-<yy>-<5+ digit serial>, e.g. CRX-CR-26-00001.
//   type   CR course · IN internship · AT aptitude-test fee (Careers) — taken
//          from the receipt's item type, so an upgrade or a payment request
//          is filed under the course/internship it was for.
//   yy     the Indian-time year the receipt was issued in.
//   serial one running series PER TYPE, never reset (not even at the new
//          year): course receipts count 1, 2, 3… on their own, as do
//          internship and test-fee receipts — "multiple series", each
//          consecutive, which GST invoicing allows. The type code keeps the
//          series apart, so CRX-CR-26-00001 and CRX-IN-26-00001 never clash.
// 15 characters up to serial 99999, and room to grow within GST's 16-character
// limit to 999999 per type. Receipts issued before this format (CRX-2026-00001)
// keep their numbers; the two formats can't collide.
//
// How it stays unique AND consecutive (no numbers skipped):
//   - The payment's row is locked first; a payment that already has a number
//     (the other of /verify and the webhook got there first) takes nothing
//     from a counter, so a race never burns a number.
//   - The series' counter is incremented inside the same transaction, so if
//     saving the receipt fails the increment is rolled back with it.
//   - payments.receiptNumber is UNIQUE in the database. If a counter is ever
//     behind the numbers already issued (a restored backup, a reset counters
//     table), the clash is caught, the counter is moved past the highest
//     number of its series, and the receipt is numbered again.
const PREFIX = "CRX";
const MAX_TRIES = 5;

// Receipt item type -> the code in the number. Anything else (shouldn't
// happen) is filed under OT, "other", so it still gets a unique number.
const TYPE_CODES = { course: "CR", internship: "IN", aptitude_test: "AT" };
const typeCode = (itemType) => TYPE_CODES[itemType] || "OT";
const counterName = (code) => `receipt_${code}`;

const istYear = (d) => Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }).format(d));
const formatReceiptNumber = (seq, issuedAt = new Date(), code = "OT") =>
  `${PREFIX}-${code}-${String(istYear(issuedAt) % 100).padStart(2, "0")}-${String(seq).padStart(5, "0")}`;

// Moves a series' counter past every serial already used in that series.
async function catchUpCounter(code) {
  const [row] = await prisma.$queryRaw`
    SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(receiptNumber, '-', -1) AS UNSIGNED)), 0) AS top
    FROM payments WHERE receiptNumber LIKE ${`${PREFIX}-${code}-%`}`;
  const top = Number(row.top) || 0;
  await prisma.$executeRaw`INSERT IGNORE INTO counters (name, seq) VALUES (${counterName(code)}, 0)`;
  await prisma.$executeRaw`UPDATE counters SET seq = GREATEST(seq, ${top}) WHERE name = ${counterName(code)}`;
}

// Gives the payment its receipt number and saves `fields` (the receipt
// snapshot, including receiptItemType, which picks the series) with it.
// Returns { receiptNumber, issuedAt } to the one caller that numbered it, or
// null when the payment already had a number (or is gone).
async function issueReceiptNumber(paymentId, fields = {}) {
  const code = typeCode(fields.receiptItemType);
  const name = counterName(code);
  // The counter row must exist before any transaction locks it: creating it
  // inside one (INSERT IGNORE takes a shared lock) deadlocks two receipts
  // being numbered at the same moment.
  await prisma.$executeRaw`INSERT IGNORE INTO counters (name, seq) VALUES (${name}, 0)`;
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Lock order, always: the payment, then the counter.
        const [row] = await tx.$queryRaw`SELECT receiptNumber FROM payments WHERE id = ${paymentId} FOR UPDATE`;
        if (!row || row.receiptNumber) return null;
        const [counter] = await tx.$queryRaw`SELECT seq FROM counters WHERE name = ${name} FOR UPDATE`;
        const next = Number(counter.seq) + 1;
        await tx.$executeRaw`UPDATE counters SET seq = ${next} WHERE name = ${name}`;
        const issuedAt = new Date();
        const receiptNumber = formatReceiptNumber(next, issuedAt, code);
        await tx.payment.update({ where: { id: paymentId }, data: { ...fields, receiptNumber, receiptIssuedAt: issuedAt } });
        return { receiptNumber, issuedAt };
      }, { timeout: 15000 });
    } catch (e) {
      if (attempt >= MAX_TRIES) throw e;
      // That number is already on another receipt: the counter is behind.
      if (e && e.code === "P2002") {
        console.error(`[receipts] receipt number already in use — moving the ${code} counter past the highest one (try ${attempt})`);
        await catchUpCounter(code);
        continue;
      }
      // MySQL picked this transaction to undo a lock wait cycle: nothing was saved, try again.
      if (e && (e.code === "P2034" || /1213|Deadlock/i.test(String(e.message)))) continue;
      throw e;
    }
  }
}

module.exports = { issueReceiptNumber, formatReceiptNumber, catchUpCounter, TYPE_CODES };
