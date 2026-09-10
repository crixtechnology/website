const express = require("express");
const { sendContactEmail } = require("../utils/mailer");

const router = express.Router();

// Matches src/services/api.js's existing fetch(`${API}/contact`, ...) call —
// no frontend change needed once REACT_APP_API_URL points here.
router.post("/contact", async (req, res, next) => {
  try {
    const { name, email, interest, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: "name, email and message are required" });
    }
    // Emails CONTACT_TO_EMAIL (support@crixtechnology.com) via SMTP once
    // SMTP_HOST/USER/PASS are set in .env — until then it just logs, so the
    // form still responds "sent" during local/test setup.
    await sendContactEmail({ name, email, interest, message });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
