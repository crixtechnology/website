const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    tag: { type: String, default: "" },
    desc: { type: String, default: "" },
    points: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0 }, // in INR rupees
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    durationDays: { type: Number, default: null, min: 1 },
    status: { type: String, enum: ["open", "closed"], default: "open" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);
