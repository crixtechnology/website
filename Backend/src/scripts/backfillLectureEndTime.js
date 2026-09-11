// One-time migration: Lecture.scheduledEndAt was added so the student-facing
// "Join live" button can disappear once a class actually ends, instead of
// staying up forever. Existing lectures predate the field and won't pass
// schema validation without it — this backfills each one to scheduledAt + 1
// hour (a reasonable default class length; edit the times afterward in
// /admin/lectures for any that ran longer or shorter).
// Safe to re-run — only touches rows where scheduledEndAt is missing.
//   node src/scripts/backfillLectureEndTime.js
require("dotenv").config();
const { connectDB } = require("../db");
const Lecture = require("../models/Lecture");
const mongoose = require("mongoose");

const DEFAULT_DURATION_MS = 60 * 60 * 1000; // 1 hour

async function run() {
  await connectDB();

  // Schema validation would reject a save with scheduledEndAt missing, so
  // read as plain objects (skips Mongoose casting/validation) rather than
  // hydrated documents.
  const missing = await Lecture.find({ scheduledEndAt: { $in: [null, undefined] } })
    .select("_id scheduledAt")
    .lean();

  let updated = 0;
  for (const lec of missing) {
    const scheduledAt = new Date(lec.scheduledAt);
    const scheduledEndAt = new Date(scheduledAt.getTime() + DEFAULT_DURATION_MS);
    await Lecture.updateOne({ _id: lec._id }, { $set: { scheduledEndAt } });
    updated++;
  }
  console.log(`Backfilled scheduledEndAt (scheduledAt + 1h) on ${updated} lecture(s).`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
