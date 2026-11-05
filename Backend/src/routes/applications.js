const express = require("express");
const { prisma } = require("../db");
const { isProgram, PROGRAM_WHERE, COURSES_DROPPED } = require("../utils/programs");
const { attachUserIfPresent } = require("../middleware/requireAuth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { sendApplicationEmail } = require("../utils/mailer");
const { isValidEmail, isValidPhone, isDisposableEmail, isValidName } = require("../utils/validators");
const { serialize } = require("../utils/serialize");
const { isTier } = require("../utils/tiers");
const { publicWriteLimiter } = require("../utils/rateLimit");
const { emailDomainError } = require("../utils/emailDomain");

const { queryText } = require("../utils/validators");
const router = express.Router();

// Stores both internship and course applications — same shape, distinguished
// by `type`. Used before payment for whichever entries are actually priced
// (attaches a Payment doc afterwards via /api/payments/create-order).
//
// A course's apply-only request stays fully guest — no login required. A
// Training + Internship application needs an account (see below). A priced, open entry's
// "Buy now" is gated behind login on the frontend regardless of type; when
// a valid token is present it's attached here so the payment webhook can
// grant access afterwards.
router.post("/applications", publicWriteLimiter, attachUserIfPresent, async (req, res, next) => {
  try {
    const { type, refTitle, name, email, phone, college, track, courseSlug, tier } = req.body || {};
    if ([refTitle, name, email, phone, college, track].some((v) => v && String(v).length > 150)) {
      return res.status(400).json({ ok: false, error: "One of the fields is too long." });
    }
    if (!type || !refTitle || !name || !email || !phone) {
      return res.status(400).json({ ok: false, error: "type, refTitle, name, email and phone are required" });
    }
    if (type !== "internship") {
      return res.status(400).json({ ok: false, error: type === "course" ? COURSES_DROPPED : "type must be 'internship'" });
    }
    // Training + Internship is paid through a payment request, which can only be
    // sent to an account — so applying needs one, and the application carries
    // the account's own email (the admin's "Send payment request" looks it up).
    let accountEmail = null;
    if (type === "internship") {
      const account = req.user ? await prisma.user.findUnique({ where: { id: req.user.sub }, select: { email: true } }) : null;
      if (!account) {
        return res.status(401).json({ ok: false, code: "LOGIN_REQUIRED", error: "Log in or create your free account to apply — that's where we send your payment request." });
      }
      accountEmail = account.email;
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
    // Nobody can follow up at a domain that takes no mail ("gmial.com").
    const domainProblem = await emailDomainError(email);
    if (domainProblem) {
      return res.status(400).json({ ok: false, error: domainProblem });
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
      const found = await prisma.course.findUnique({ where: { slug: courseSlug } });
      course = isProgram(found) ? found : null;
    }
    // A track the admin closed (Admin → Training + Internship's Open/Closed
    // switch) takes no new applications.
    if (course && course.status === "closed") {
      return res.status(400).json({ ok: false, error: "This track isn't taking applications right now." });
    }

    const application = await prisma.application.create({
      data: {
        type,
        refTitle,
        name,
        email: accountEmail || email,
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
    const q = queryText(req.query.q);
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
    // Training + Internship applications only (old course requests were test data).
    where.type = "internship";

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
