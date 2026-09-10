const Razorpay = require("razorpay");

// Reads whatever keys are in .env — TEST keys now, LIVE keys later.
// No code change needed to go live, only the .env values change.
const keyId = process.env.RAZORPAY_KEY_ID || "";
const keySecret = process.env.RAZORPAY_KEY_SECRET || "";

// Loud, one-line heads-up at boot if the keys are missing or still the
// placeholders — otherwise the only symptom is a 401 "Authentication failed"
// buried in the logs the first time someone tries to pay.
const looksUnset = (v) => !v || /placeholder|changeme|xxxx|your_key/i.test(v);
if (looksUnset(keyId) || looksUnset(keySecret)) {
  console.warn(
    "⚠ Razorpay keys are missing or placeholders in Backend/.env — " +
    "order creation will fail with 401 until real keys are set " +
    "(Razorpay Dashboard → Settings → API Keys)."
  );
}

const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

module.exports = razorpay;
