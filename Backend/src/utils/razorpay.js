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

// Safety guard: a "rzp_live_..." key can charge real money the moment an
// order is created. Requiring a separate, explicit opt-in (rather than just
// whatever happens to be in .env) means switching to live keys can't
// silently start processing real payments — routes/payments.js checks this
// flag and refuses to create an order while it's true.
const isLiveKey = keyId.startsWith("rzp_live_");
const liveGuardOk = process.env.ALLOW_LIVE_PAYMENTS === "true";
const liveBlocked = isLiveKey && !liveGuardOk;
if (liveBlocked) {
  console.warn(
    "🛑 LIVE Razorpay key detected (rzp_live_...) but ALLOW_LIVE_PAYMENTS is not set to \"true\" in Backend/.env — " +
    "order creation will be refused (503) to prevent accidental real charges. Only set ALLOW_LIVE_PAYMENTS=true " +
    "once you deliberately intend to process real payments."
  );
}

module.exports = { razorpay, isLiveBlocked: liveBlocked };
