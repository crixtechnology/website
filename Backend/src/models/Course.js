const mongoose = require("mongoose");

// Covers both courses and internships — one admin-managed collection,
// distinguished by `type`. `price` is optional for either type: null means
// apply-only (the public site shows "Apply"/"Request to enroll", no online
// purchase); a real price + status "open" means it's buyable ("Buy now")
// the same way for both — an internship isn't required to be free, some
// slots are priced and some are offered free/discounted as promos, decided
// per entry rather than forced by type.
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
