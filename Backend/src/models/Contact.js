const mongoose = require("mongoose");

// One row per contact-form submission (routes/contact.js). Persisted so the
// admin panel has a real inbox (AdminMessages.jsx) instead of the message
// only ever existing as an outgoing email — email delivery is best-effort
// and layered on top, never a precondition for saving the message.
const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    interest: { type: String, default: "" },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ["new", "read"], default: "new" },
  },
  { timestamps: true }
);

contactSchema.index({ name: "text", email: "text", message: "text" });

module.exports = mongoose.model("Contact", contactSchema);
