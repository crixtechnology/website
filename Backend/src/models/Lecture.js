const mongoose = require("mongoose");

// One row per scheduled live class for a course (recorded on Google Meet).
// Admin-managed via routes/lectures.js; students only ever see these through
// GET /api/learn/:courseSlug, gated by an active Enrollment.
//
// Recorded lectures are NOT stored here anymore — they live in the Video
// model and are delivered on a per-student drip schedule (see models/Video.js
// and routes/videos.js).
const lectureSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    title: { type: String, required: true, trim: true },
    scheduledAt: { type: Date, required: true },
    // End time — routes/lectures.js enforces this is after scheduledAt on
    // create/update. Drives when the student-facing "Join live" button
    // disappears (Frontend/src/pages/student/Learn.jsx) and when a session
    // stops counting as "upcoming" for GET /api/learn/:courseSlug.
    scheduledEndAt: { type: Date, required: true },
    link: { type: String, required: true, trim: true }, // Google Meet link
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

lectureSchema.index({ course: 1, scheduledAt: 1 });

module.exports = mongoose.model("Lecture", lectureSchema);
