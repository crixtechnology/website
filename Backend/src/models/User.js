const mongoose = require("mongoose");

// Unified account model — students self-signup with role "student" (the
// default); "admin" accounts are only ever created by scripts/seedAdmin.js
// (or promoted directly in the DB), never through the public signup route.
//
// An account has either a passwordHash (email/password signup) or a
// googleId (Google Sign-In), or both once a password account links Google
// by matching email — see routes/auth.js's /google handler.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone: { type: String, default: "", trim: true },
    passwordHash: { type: String, default: null },
    // No `default: null` here on purpose — a sparse unique index only
    // excludes documents where the field is genuinely *absent*, not ones
    // where it's explicitly set to null. A default of null would mean
    // every non-Google account gets googleId: null written to it, and the
    // unique constraint would then only ever allow ONE such account to
    // exist at a time. Leaving it unset keeps the field truly absent for
    // password-only accounts.
    googleId: { type: String },
    role: { type: String, enum: ["admin", "student"], default: "student" },
  },
  { timestamps: true }
);

userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("User", userSchema);
