const express = require("express");
const { prisma } = require("../db");
const { sendContactEmail } = require("../utils/mailer");
const { requireAdmin } = require("../middleware/requireAdmin");
const { isValidEmail, isValidPhone, isDisposableEmail, isValidName } = require("../utils/validators");
const { serialize } = require("../utils/serialize");
const { publicWriteLimiter } = require("../utils/rateLimit");

const router = express.Router();

// Matches src/services/api.js's existing fetch(`${API}/contact`, ...) call —
// no frontend change needed once REACT_APP_API_URL points here. Also what
// the IT Services "Inquiry" form (ServiceInquiryModal) posts to, with
// company/phone set and email/message possibly blank — see prisma/schema.prisma's Contact model.
router.post("/contact", publicWriteLimiter, async (req, res, next) => {
  try {
    const { name, email, phone, company, interest, message } = req.body || {};
    if (!name || (!email && !phone)) {
      return res.status(400).json({ ok: false, error: "name and either an email or phone number are required" });
    }
    if (!isValidName(name)) {
      return res.status(400).json({ ok: false, error: "Enter a valid name." });
    }
    // Both were an always-required, browser-validated `type="email"` field
    // before email became optional here — a light server-side format check
    // replaces what that HTML5 validation used to guarantee for free.
    // Shared with routes/auth.js's own email/phone validation (utils/validators.js)
    // so "a valid email"/"a valid phone number" means the same thing everywhere.
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: "Enter a valid email address." });
    }
    // A disposable inbox is typically dead within days/hours, so "we'll
    // reply within two working days" would go nowhere — same list InquiryModal
    // and ServiceInquiryModal already check client-side.
    if (email && isDisposableEmail(email)) {
      return res.status(400).json({ ok: false, error: "Please use a permanent email address (not a temporary/disposable one)." });
    }
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ ok: false, error: "Enter a valid phone number." });
    }

    // Persist first — this is now the admin panel's inbox (AdminMessages.jsx)
    // and must not be lost even if the notification email below hiccups.
    await prisma.contact.create({
      data: {
        name,
        email: email ? String(email).toLowerCase().trim() : "",
        phone: phone || "",
        company: company || "",
        interest: interest || "",
        message: message || "",
      },
    });

    // Best-effort notification email; a delivery failure here shouldn't turn
    // a successfully-saved message into a 500 for the visitor. Not awaited:
    // the response below doesn't depend on whether this succeeds, so it
    // shouldn't wait on a third-party round trip either — the 10s timeout
    // inside sendContactEmail bounds this to a background task, not
    // something that can delay (or, if that timeout were ever removed
    // again, hang) the visitor's own request.
    sendContactEmail({ interest }).catch((mailErr) => {
      console.error("[contact] notification email failed:", mailErr.message);
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: the contact-form inbox ----------
router.get("/admin/contacts", requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const where = q
      ? {
          OR: [
            { name: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
            { company: { contains: q } },
            { message: { contains: q } },
          ],
        }
      : {};
    if (req.query.status === "new" || req.query.status === "read") where.status = req.query.status;

    const contacts = await prisma.contact.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ ok: true, contacts: serialize(contacts) });
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
    const contact = await prisma.contact.update({ where: { id: req.params.id }, data: { status } }).catch(() => null);
    if (!contact) return res.status(404).json({ ok: false, error: "Message not found" });
    res.json({ ok: true, contact: serialize(contact) });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/contacts/:id", requireAdmin, async (req, res, next) => {
  try {
    const contact = await prisma.contact.delete({ where: { id: req.params.id } }).catch(() => null);
    if (!contact) return res.status(404).json({ ok: false, error: "Message not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
