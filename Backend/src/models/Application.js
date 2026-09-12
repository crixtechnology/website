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
    // Set when the applicant was logged in at submission time (course
    // purchases only) — this is what lets the payment webhook grant course
    // access via an Enrollment. Internship applications stay guest/no-login,
    // so these stay null there.
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    // Admin follow-up flag for guest inquiries (Apply / Inquire to enroll) —
    // mirrors Contact's new/read status, surfaced in AdminApplications.jsx.
    // Left false for the Buy-now flow's own Application rows (payment status
    // already tracks those; this is specifically for "did someone call/email
    // this person back yet").
    contacted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", applicationSchema);
