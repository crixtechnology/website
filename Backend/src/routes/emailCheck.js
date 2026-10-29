const express = require("express");
const rateLimit = require("express-rate-limit");
const { checkEmailDomain } = require("../utils/emailDomain");

const router = express.Router();

// Every email field on the site asks this as the visitor types (debounced,
// see Frontend useEmailCheck), so the budget is generous — but each call can
// cost a DNS lookup, so a script can't use it as a free resolver.
const emailCheckLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please try again in a few minutes." },
});

// GET /api/email-check?email=… → { ok: true, valid, error, suggestion }.
// Only says whether the address's domain can take mail — never whether an
// account exists here, so it leaks nothing about who has signed up.
router.get("/email-check", emailCheckLimiter, async (req, res, next) => {
  try {
    const email = typeof req.query.email === "string" ? req.query.email.slice(0, 254) : "";
    const result = await checkEmailDomain(email);
    res.json({ ok: true, valid: result.ok, error: result.error, suggestion: result.suggestion });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
