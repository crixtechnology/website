// Re-number a course's drip videos by the date embedded in their title
// (Google Meet names recordings "... - 2026/07/09 18:45 IST - Recording"),
// so dayNumber 1..N follows the real class chronology.
//
// Useful after a sync run where Drive returned files out of order. Videos
// whose title has no parseable date keep their relative order and sort last.
//
//   node src/scripts/resequenceCourseVideos.js <courseId>
//   node src/scripts/resequenceCourseVideos.js <courseId> --dry-run
require("dotenv").config();
const { connectDB } = require("../db");
const Video = require("../models/Video");
const mongoose = require("mongoose");

function dateKey(title) {
  const m = String(title || "").match(/(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : Number.MAX_SAFE_INTEGER;
}

async function run() {
  const courseId = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!mongoose.isValidObjectId(courseId)) {
    console.error("Usage: node src/scripts/resequenceCourseVideos.js <courseId> [--dry-run]");
    process.exit(1);
  }

  await connectDB();

  const videos = await Video.find({ course: courseId });
  if (!videos.length) {
    console.log("No videos for that course.");
    await mongoose.disconnect();
    process.exit(0);
  }

  videos.sort((a, b) => {
    const d = dateKey(a.title) - dateKey(b.title);
    return d !== 0 ? d : String(a._id).localeCompare(String(b._id));
  });

  let changed = 0;
  for (let i = 0; i < videos.length; i++) {
    const want = i + 1;
    const v = videos[i];
    const flag = v.dayNumber === want ? "" : `  (was day ${v.dayNumber})`;
    console.log(`day ${want}  ${v.title}${flag}`);
    if (v.dayNumber !== want) {
      changed++;
      if (!dryRun) await Video.updateOne({ _id: v._id }, { $set: { dayNumber: want } });
    }
  }

  console.log(dryRun ? `\n${changed} would change (dry run — nothing written).` : `\n${changed} video(s) renumbered.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
