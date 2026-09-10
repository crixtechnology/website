const mongoose = require("mongoose");

// Covers both paid courses and (unpaid, apply-only) internships — one
// admin-managed collection, distinguished by `type`. Internships never
// carry a price (no online purchase for them, matches the existing
// guest-apply flow) — routes/courses.js enforces that server-side
// regardless of what a request sends.
const courseSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["course", "internship"], default: "course" },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    tag: { type: String, default: "" },
    desc: { type: String, default: "" },
    points: { type: [String], default: [] },
    price: { type: Number, default: null, min: 0 }, // in INR rupees — courses only
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    durationDays: { type: Number, default: null, min: 1 },
    status: { type: String, enum: ["open", "closed"], default: "open" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);
