const mongoose = require("mongoose");

// The access-control record: a student can see a course's live schedule and
// its recorded videos only if an "active" Enrollment exists for them.
// Created/upserted by the Razorpay webhook (routes/payments.js) the moment a
// payment for that user+course is confirmed paid — never created directly
// from client input.
const enrollmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
    // This student's personal "day 1" for the recorded-video drip schedule
    // (middleware/requireEnrollment.js computes which dayNumber they've
    // unlocked from it). Defaults to the moment the Enrollment is created
    // i.e. payment confirmation. Existing rows are backfilled with their
    // createdAt by scripts/backfillEnrollmentStartDate.js.
    startDate: { type: Date, default: Date.now },
    // Optional access expiry, admin-set (AdminSubscriptions.jsx) — null means
    // lifetime access, same as before this field existed. Past this date the
    // student loses access (live schedule + videos) same as a revoked
    // enrollment, without an admin having to remember to remove it manually.
    // See utils/enrollmentAccess.js for the single place this is checked.
    endDate: { type: Date, default: null },
    status: { type: String, enum: ["active"], default: "active" },
  },
  { timestamps: true }
);

enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = mongoose.model("Enrollment", enrollmentSchema);
