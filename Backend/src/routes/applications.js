const express = require("express");
const { prisma } = require("../db");
const { attachUserIfPresent } = require("../middleware/requireAuth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { sendApplicationEmail } = require("../utils/mailer");
const { isValidEmail, isValidPhone, isDisposableEmail, isValidName } = require("../utils/validators");
const { serialize } = require("../utils/serialize");
const { isTier } = require("../utils/tiers");
const { publicWriteLimiter } = require("../utils/rateLimit");

const router = express.Router();

// Stores both internship and course applications — same shape, distinguished
// by `type`. Used before payment for whichever entries are actually priced
// (attaches a Payment doc afterwards via /api/payments/create-order).
//
// An apply-only entry (no price) of either type stays fully guest — no
// login required (InquiryModal never requires one). A priced, open entry's
// "Buy now" is gated behind login on the frontend regardless of type; when
// a valid token is present it's attached here so the payment webhook can
// grant access afterwards.
router.post("/applications", publicWriteLimiter, attachUserIfPresent, async (req, res, next) => {
  try {
    const { type, refTitle, name, email, phone, college, track, courseSlug, tier } = req.body || {};
    if (!type || !refTitle || !name || !email || !phone) {
      return res.status(400).json({ ok: false, error: "type, refTitle, name, email and phone are required" });
    }
    if (!["internship", "course"].includes(type)) {
      return res.status(400).json({ ok: false, error: "type must be 'internship' or 'course'" });
    }
    // Same format rules as routes/contact.js and routes/auth.js (utils/validators.js)
    // — InquiryModal's own client-side checks mirror these, this is the
    // server-side backstop for a request that skips or tampers with them.
    if (!isValidName(name)) {
      return res.status(400).json({ ok: false, error: "Enter a valid name." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: "Enter a valid email address." });
    }
    // A disposable inbox won't be reachable by the time an admin follows up
    // on the application — same list InquiryModal already checks client-side.
    if (isDisposableEmail(email)) {
      return res.status(400).json({ ok: false, error: "Please use a permanent email address (not a temporary/disposable one)." });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ ok: false, error: "Enter a valid phone number." });
    }

    // Resolved for either type now that an internship may also be a real,
    // purchasable Course doc — InquiryModal already sends courseSlug
    // regardless of kind, so a plain "Apply" (no purchase) on a priced
    // internship still links its Application to the right Course too.
    let course = null;
    if (courseSlug) {
      course = await prisma.course.findUnique({ where: { slug: courseSlug } });
    }

    const application = await prisma.application.create({
      data: {
        type,
        refTitle,
        name,
        email,
        phone,
        college: college || "",
        track: track || "",
        userId: req.user ? req.user.sub : null,
        courseId: course ? course.id : null,
        // The plan (Basic/Plus/Pro) the buyer picked, when they picked one —
        // create-order re-stamps it from the plan it actually charges.
        tier: isTier(tier) ? tier : null,
      },
    });

    // Best-effort notification email; a delivery failure here shouldn't turn
    // a successfully-saved application into a 500 for the applicant. Not
    // awaited — same reasoning as routes/contact.js's own notification call.
    sendApplicationEmail({ type, refTitle }).catch((mailErr) => {
      console.error("[applications] notification email failed:", mailErr.message);
    });

    res.status(201).json({ ok: true, application: serialize(application, "application") });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: internship/course inquiries inbox ----------
// Lists every Application row — guest Apply/Inquire submissions and the
// Application docs the Buy-now flow creates on its way to payment alike —
// so a submission is never only visible by querying the database directly.
router.get("/admin/applications", requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const where = q
      ? {
          OR: [
            { name: { contains: q } },
            { email: { contains: q } },
            { refTitle: { contains: q } },
            { college: { contains: q } },
          ],
        }
      : {};
    if (req.query.type === "internship" || req.query.type === "course") where.type = req.query.type;

    const applications = await prisma.application.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ ok: true, applications: serialize(applications, "application") });
  } catch (e) {
    next(e);
  }
});

router.patch("/admin/applications/:id", requireAdmin, async (req, res, next) => {
  try {
    const { contacted } = req.body || {};
    if (typeof contacted !== "boolean") {
      return res.status(400).json({ ok: false, error: "contacted must be a boolean" });
    }
    const application = await prisma.application.update({ where: { id: req.params.id }, data: { contacted } }).catch(() => null);
    if (!application) return res.status(404).json({ ok: false, error: "Application not found" });
    res.json({ ok: true, application: serialize(application, "application") });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/applications/:id", requireAdmin, async (req, res, next) => {
  try {
    const application = await prisma.application.delete({ where: { id: req.params.id } }).catch(() => null);
    if (!application) return res.status(404).json({ ok: false, error: "Application not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
