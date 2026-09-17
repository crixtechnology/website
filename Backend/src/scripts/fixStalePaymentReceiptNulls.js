// One-time cleanup for the "receipt.number: null" duplicate-key bug (see the
// doc comment on receiptSchema's `number` field in models/Payment.js): every
// not-yet-paid Payment used to have receipt.number explicitly written as
// null (instead of omitted), which a unique+sparse index treats as a real,
// colliding value. Only one such document could ever exist at a time — this
// unsets the field on every OTHER offending doc so new orders stop hitting
// E11000 on insert.
//
// Run `npm run migrate:payment-receipts` FIRST (mints real receipt numbers
// for already-*paid* payments that are missing one) — this script only
// touches payments that were never actually paid (created/failed), since a
// paid payment without a receipt number is a real bug attachReceipt should
// fix, not data to unset.
//   node src/scripts/fixStalePaymentReceiptNulls.js
require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../db");
const Payment = require("../models/Payment");

async function run() {
  await connectDB();

  const stalePaid = await Payment.countDocuments({ status: "paid", "receipt.number": null });
  if (stalePaid > 0) {
    console.log(
      `${stalePaid} paid payment(s) still have receipt.number: null — run ` +
      `"npm run migrate:payment-receipts" first so they get a real receipt instead of being unset.`
    );
  }

  const result = await Payment.updateMany(
    { status: { $ne: "paid" }, "receipt.number": null },
    { $unset: { "receipt.number": "" } }
  );
  console.log(`Unset receipt.number on ${result.modifiedCount} non-paid payment(s).`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
