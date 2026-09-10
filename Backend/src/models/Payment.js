const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    razorpay_order_id: { type: String, required: true },
    razorpay_payment_id: { type: String, default: null },
    razorpay_signature: { type: String, default: null },
    amount: { type: Number, required: true }, // in paise (Razorpay unit)
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["created", "paid", "failed"], default: "created" },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
