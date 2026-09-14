const mongoose = require("mongoose");

// One row per contact-form submission (routes/contact.js). Persisted so the
// admin panel has a real inbox (AdminMessages.jsx) instead of the message
// only ever existing as an outgoing email — email delivery is best-effort
// and layered on top, never a precondition for saving the message.
const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Neither contact field is individually required — routes/contact.js
    // requires at least one of the two, so there's always a way to reach
    // back within the promised two working days, without forcing e.g. the
    // IT Services inquiry form (phone required, email optional) to collect
    // a field it doesn't ask for.
    email: { type: String, default: "", trim: true, lowercase: true },
    phone: { type: String, default: "", trim: true },
    // "Business/Company name" — set by the IT Services inquiry form, blank
    // for the plain Contact Us page and internship/course applications.
    company: { type: String, default: "", trim: true },
    interest: { type: String, default: "" },
    // Optional so the IT Services form's "Details about your business"
    // field can be left blank — Contact Us's own client still requires one
    // before it will submit.
    message: { type: String, default: "", trim: true },
    status: { type: String, enum: ["new", "read"], default: "new" },
  },
  { timestamps: true }
);

contactSchema.index({ name: "text", email: "text", message: "text" });

module.exports = mongoose.model("Contact", contactSchema);
