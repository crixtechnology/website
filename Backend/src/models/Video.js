const mongoose = require("mongoose");

// One recorded lecture for a course. The actual video file lives in a
// private Backblaze B2 bucket (never public) and is only ever served
// through the Cloudflare Worker gateway using a short-lived signed URL
// minted by routes/videos.js — this row just holds the metadata.
//
// Rows are created by scripts/drive-to-b2-sync (which uploads the file from
// the Google Meet -> Drive recording folder into B2 and then calls
// POST /api/internal/videos), or by an admin via routes/videos.js.
const videoSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    title: { type: String, required: true, trim: true },
    // Object key inside the private B2 bucket. Unique so the sync script
    // can't register the same upload twice.
    b2Key: { type: String, required: true, unique: true, trim: true },
    // The Google Drive file id this was synced from — lets the sync script
    // and an admin trace a video back to its source recording. Null for a
    // video added by hand.
    sourceDriveFileId: { type: String, default: null, trim: true },
    // Display/ordering label only (e.g. "Day 3") — every video is playable
    // any time once a student is enrolled. Auto-assigned as "existing video
    // count in this course + 1" when the sync script doesn't pass one.
    dayNumber: { type: Number, required: true, min: 1 },
    durationSeconds: { type: Number, default: null, min: 0 },
  },
  { timestamps: true }
);

videoSchema.index({ course: 1, dayNumber: 1 });

module.exports = mongoose.model("Video", videoSchema);
