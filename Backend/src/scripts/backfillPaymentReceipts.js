// One-time migration: the Payment.receipt snapshot (and the /me/receipts,
// "Download Receipt" feature it powers) was added after some real purchases
// already existed. This mints a receipt number for every already-paid,
// access-granting payment that doesn't have one yet, using the exact same
// attachReceipt() logic the live payment flow uses going forward — so a
// student's older purchases get a downloadable receipt too, not just future
// ones. Safe to re-run: attachReceipt() is itself idempotent (skips a
// payment that already has receipt.number set).
//   node src/scripts/backfillPaymentReceipts.js
require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../db");
const Payment = require("../models/Payment");
const Application = require("../models/Application");
const { attachReceipt } = require("../routes/payments");

async function run() {
  await connectDB();

  // Older Payment docs predate the `user`/`course`/`receipt` fields entirely
  // (genuinely absent in Mongo, not just null) — querying "receipt.number":
  // null still matches those via Mongo's usual missing-field-matches-null
  // dot-path semantics, so this correctly picks up every un-receipted paid
  // payment regardless of when it was created.
  const payments = await Payment.find({ status: "paid", "receipt.number": null });

  let minted = 0;
  let skipped = 0;
  for (const payment of payments) {
    const application = await Application.findById(payment.application);
    if (!application || !application.user || !application.course) {
      skipped++;
      continue;
    }
    await attachReceipt(payment, application);
    minted++;
  }
  console.log(`Minted receipts for ${minted} payment(s), skipped ${skipped} with no linked application.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
