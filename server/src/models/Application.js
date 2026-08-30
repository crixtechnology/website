const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["internship", "course"], required: true },
    refTitle: { type: String, required: true }, // which internship/course track (by title)
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    college: { type: String, default: "" },
    track: { type: String, default: "" },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", applicationSchema);
