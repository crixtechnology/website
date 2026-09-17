const mongoose = require("mongoose");

// A completed Payment doubles as the "payment entry" record a receipt is
// generated from — see routes/payments.js's grantAccessForPayment, which
// fills in `user`/`course`/`receipt` the moment a payment is confirmed paid.
// `receipt` is a snapshot (buyer details, item title/price at time of
// purchase) rather than live refs, so a receipt never silently changes if
// the course is later renamed/repriced or the user edits their profile.
const receiptSchema = new mongoose.Schema(
  {
    // No `default: null` here on purpose — the unique+sparse index below on
    // "receipt.number" only excludes documents where the field is genuinely
    // *absent*, not ones explicitly set to null. A default would make every
    // not-yet-paid Payment (created at checkout, before attachReceipt ever
    // runs) write an explicit null, and since a unique index can't hold two
    // of those, the second such Payment anywhere would fail to insert with
    // E11000. Same bug class as User.googleId, see that field's own comment.
    number: { type: String }, // e.g. "CRX-2026-00001"
    issuedAt: { type: Date, default: null },
    buyerName: { type: String, default: "" },
    buyerEmail: { type: String, default: "" },
    buyerPhone: { type: String, default: "" },
    itemType: { type: String, enum: ["course", "internship", null], default: null },
    itemTitle: { type: String, default: "" },
    basePrice: { type: Number, default: 0 }, // rupees, pre-discount
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 }, // rupees
    totalPaid: { type: Number, default: 0 }, // rupees, what was actually charged
    paymentMode: { type: String, default: "Razorpay (Online)" },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    razorpay_order_id: { type: String, required: true },
    razorpay_payment_id: { type: String, default: null },
    razorpay_signature: { type: String, default: null },
    amount: { type: Number, required: true }, // in paise (Razorpay unit)
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["created", "paid", "failed"], default: "created" },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
    // Denormalized from Application at grant time, once — lets receipt
    // ownership/listing be checked directly off Payment without a join.
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    // Price/discount AS THEY WERE when the order was created (routes/
    // payments.js's /create-order) — a real gap between then and payment
    // confirmation is normal (the customer is off filling in card details,
    // or the webhook lags), and an admin can edit a course's price at any
    // time with no lock against in-flight orders. Without this snapshot,
    // attachReceipt would price the receipt off whatever the course costs
    // *now* (at grant time) instead of what was actually charged, so a
    // mid-checkout price edit could produce a receipt whose Subtotal minus
    // Discount doesn't equal Total Paid. null for payments created before
    // this field existed (backfillPaymentReceipts.js falls back to the
    // live course price for those, same as before this fix).
    orderSnapshot: {
      basePrice: { type: Number, default: null },
      discountPercent: { type: Number, default: null },
    },
    receipt: { type: receiptSchema, default: () => ({}) },
  },
  { timestamps: true }
);

paymentSchema.index({ "receipt.number": 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Payment", paymentSchema);
