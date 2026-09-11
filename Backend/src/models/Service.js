const mongoose = require("mongoose");

// Admin-managed IT services shown on the public /services page (AdminServices
// .jsx). Deliberately no price field — services are quoted per engagement,
// never sold with an on-site price (see the no-pricing rule on this content,
// content.js's engagementModels). `order` controls display order on the
// public page; `status` lets an admin take a service off the public page
// without deleting its history.
const serviceSchema = new mongoose.Schema(
  {
    tag: { type: String, default: "" },
    title: { type: String, required: true, trim: true },
    desc: { type: String, default: "" },
    points: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

serviceSchema.index({ title: "text", tag: "text", desc: "text" });

module.exports = mongoose.model("Service", serviceSchema);
