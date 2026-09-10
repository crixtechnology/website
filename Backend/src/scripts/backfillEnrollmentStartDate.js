// One-time migration: the Enrollment.startDate field was added with the
// drip-video system. Existing enrollments predate it — this sets each one's
// startDate to its createdAt so current students aren't all stuck at drip
// "day 1". Safe to re-run — only touches rows where startDate is missing.
//   node src/scripts/backfillEnrollmentStartDate.js
require("dotenv").config();
const { connectDB } = require("../db");
const Enrollment = require("../models/Enrollment");
const mongoose = require("mongoose");

async function run() {
  await connectDB();

  const missing = await Enrollment.find({ startDate: { $in: [null, undefined] } }).select("_id createdAt");
  let updated = 0;
  for (const en of missing) {
    await Enrollment.updateOne({ _id: en._id }, { $set: { startDate: en.createdAt || new Date() } });
    updated++;
  }
  console.log(`Backfilled startDate on ${updated} enrollment(s).`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
