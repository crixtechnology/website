// Fire a signed Razorpay-style webhook at the local server so the
// /api/payments/webhook handler can be tested without a public tunnel
// (Razorpay blocks shared tunnel domains from its webhook allowlist).
//
//   node src/scripts/testWebhook.js <razorpay_order_id> [payment.captured|payment.failed]
//
// Get an order id by starting a real checkout, or from the `payments`
// collection (razorpay_order_id of a "created" row).
require("dotenv").config();
const crypto = require("crypto");

const orderId = process.argv[2];
const eventName = process.argv[3] || "payment.captured";
const base = process.env.SELF_URL || "http://localhost:5000";
const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

if (!orderId) {
  console.error("Usage: node src/scripts/testWebhook.js <razorpay_order_id> [payment.captured|payment.failed]");
  process.exit(1);
}
if (!secret) {
  console.error("RAZORPAY_WEBHOOK_SECRET is not set in Backend/.env");
  process.exit(1);
}

const event = {
  event: eventName,
  payload: {
    payment: {
      entity: {
        id: "pay_TEST" + Date.now(),
        order_id: orderId,
        status: eventName === "payment.captured" ? "captured" : "failed",
      },
    },
  },
};

const raw = Buffer.from(JSON.stringify(event));
const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");

(async () => {
  const res = await fetch(`${base}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signature },
    body: raw,
  });
  console.log(`${eventName} → ${res.status}`, await res.text());
})().catch((e) => { console.error(e); process.exit(1); });
