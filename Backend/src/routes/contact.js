const express = require("express");
const Contact = require("../models/Contact");
const { sendContactEmail } = require("../utils/mailer");
const { requireAdmin } = require("../middleware/requireAdmin");
const { searchRegex } = require("../utils/searchRegex");

const router = express.Router();

// Matches src/services/api.js's existing fetch(`${API}/contact`, ...) call —
// no frontend change needed once REACT_APP_API_URL points here. Also what
// the IT Services "Inquiry" form (ServiceInquiryModal) posts to, with
// company/phone set and email/message possibly blank — see models/Contact.js.
router.post("/contact", async (req, res, next) => {
  try {
    const { name, email, phone, company, interest, message } = req.body || {};
    if (!name || (!email && !phone)) {
      return res.status(400).json({ ok: false, error: "name and either an email or phone number are required" });
    }
    // Both were an always-required, browser-validated `type="email"` field
    // before email became optional here — a light server-side format check
    // replaces what that HTML5 validation used to guarantee for free.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ ok: false, error: "Enter a valid email address." });
    }
    // Same digit-count rule as routes/auth.js's own phone validation
    // (PATCH /me), so "a valid phone number" means the same thing everywhere.
    if (phone) {
      const digits = String(phone).replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) {
        return res.status(400).json({ ok: false, error: "Enter a valid phone number." });
      }
    }

    // Persist first — this is now the admin panel's inbox (AdminMessages.jsx)
    // and must not be lost even if the notification email below hiccups.
    await Contact.create({
      name, email: email ? String(email).toLowerCase().trim() : "", phone: phone || "", company: company || "",
      interest: interest || "", message: message || "",
    });

    // Best-effort notification email; a delivery failure here shouldn't turn
    // a successfully-saved message into a 500 for the visitor.
    try {
      await sendContactEmail({ name, email, phone, company, interest, message });
    } catch (mailErr) {
      console.error("[contact] notification email failed:", mailErr.message);
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: the contact-form inbox ----------
router.get("/admin/contacts", requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const filter = q
      ? { $or: [{ name: searchRegex(q) }, { email: searchRegex(q) }, { phone: searchRegex(q) }, { company: searchRegex(q) }, { message: searchRegex(q) }] }
      : {};
    if (req.query.status === "new" || req.query.status === "read") filter.status = req.query.status;

    const contacts = await Contact.find(filter).sort({ createdAt: -1 });
    res.json({ ok: true, contacts });
  } catch (e) {
    next(e);
  }
});

router.patch("/admin/contacts/:id", requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!["new", "read"].includes(status)) {
      return res.status(400).json({ ok: false, error: "status must be new or read" });
    }
    const contact = await Contact.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!contact) return res.status(404).json({ ok: false, error: "Message not found" });
    res.json({ ok: true, contact });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/contacts/:id", requireAdmin, async (req, res, next) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) return res.status(404).json({ ok: false, error: "Message not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
