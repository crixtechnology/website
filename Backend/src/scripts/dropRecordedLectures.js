// One-time cleanup for the move to the drip-video system: the Lecture model
// used to also hold "recorded" rows (kind: "recorded", a raw Google Drive /
// YouTube link). Those are gone from the schema now. This deletes any such
// leftover rows so the live-class schedule query doesn't trip over them.
// Safe to re-run.
//   node src/scripts/dropRecordedLectures.js
//
// It also drops the now-unused { course: 1, kind: 1 } index if present.
require("dotenv").config();
const { connectDB } = require("../db");
const Lecture = require("../models/Lecture");
const mongoose = require("mongoose");

async function run() {
  await connectDB();

  const { deletedCount } = await Lecture.collection.deleteMany({ kind: "recorded" });
  console.log(`Deleted ${deletedCount} legacy recorded lecture row(s).`);

  // Clear the leftover kind field on any remaining (live) rows.
  const { modifiedCount } = await Lecture.collection.updateMany(
    { kind: { $exists: true } },
    { $unset: { kind: "" } }
  );
  console.log(`Removed the 'kind' field from ${modifiedCount} live lecture row(s).`);

  try {
    await Lecture.collection.dropIndex("course_1_kind_1");
    console.log("Dropped stale index course_1_kind_1.");
  } catch (e) {
    // Index wasn't there — fine.
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
