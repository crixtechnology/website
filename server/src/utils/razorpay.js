const Razorpay = require("razorpay");

// Reads whatever keys are in .env — TEST keys now, LIVE keys later.
// No code change needed to go live, only the .env values change.
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

module.exports = razorpay;
