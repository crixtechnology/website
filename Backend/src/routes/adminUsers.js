const express = require("express");
const { prisma } = require("../db");
const { requireAdmin } = require("../middleware/requireAdmin");
const { serializeEnrollment } = require("../utils/enrollmentAccess");
const { serialize } = require("../utils/serialize");

const { queryText } = require("../utils/validators");
const router = express.Router();

const SAFE_FIELDS = { id: true, name: true, email: true, phone: true, role: true, createdAt: true };

// ---------- admin: user directory, search + full CRUD ----------
// This is the "user data" section of the admin panel's search — separate
// from /admin/enrollments (subscriptions), which is where granting/editing/
// revoking course access actually happens (see routes/enrollments.js). This
// file just manages the accounts themselves.
router.get("/admin/users", requireAdmin, async (req, res, next) => {
  try {
    const q = queryText(req.query.q);
    const where = q
      ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] }
      : {};
    const users = await prisma.user.findMany({ where, select: SAFE_FIELDS, orderBy: { createdAt: "desc" } });
    res.json({ ok: true, users: serialize(users) });
  } catch (e) {
    next(e);
  }
});

// Detail view: the account plus its subscriptions and applications, so the
// admin can grant/edit/revoke access right from a user's page too.
router.get("/admin/users/:id", requireAdmin, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: SAFE_FIELDS });
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    const [enrollments, applications] = await Promise.all([
      prisma.enrollment.findMany({
        where: { userId: user.id, status: "active" },
        include: { course: { select: { id: true, title: true, slug: true, type: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.application.findMany({
        where: { userId: user.id },
        select: { id: true, type: true, refTitle: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      ok: true,
      user: serialize(user),
      enrollments: enrollments.map((e) => serializeEnrollment(e)),
      applications: serialize(applications),
    });
  } catch (e) {
    next(e);
  }
});

router.patch("/admin/users/:id", requireAdmin, async (req, res, next) => {
  try {
    const { name, phone, role } = req.body || {};
    const update = {};

    if (name !== undefined) {
      const n = String(name).trim();
      if (!n) return res.status(400).json({ ok: false, error: "Name can't be empty." });
      update.name = n;
    }
    if (phone !== undefined) update.phone = String(phone).trim();
    if (role !== undefined) {
      if (!["admin", "student"].includes(role)) {
        return res.status(400).json({ ok: false, error: "role must be admin or student" });
      }
      // Don't let an admin strip their own admin access by mistake through
      // this generic form — same self-protection as the delete route below.
      if (String(req.admin.sub) === String(req.params.id) && role !== "admin") {
        return res.status(400).json({ ok: false, error: "You can't change your own role." });
      }
      update.role = role;
    }

    const user = await prisma.user
      .update({ where: { id: req.params.id }, data: update, select: SAFE_FIELDS })
      .catch(() => null);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    res.json({ ok: true, user: serialize(user) });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/users/:id", requireAdmin, async (req, res, next) => {
  try {
    if (String(req.admin.sub) === String(req.params.id)) {
      return res.status(400).json({ ok: false, error: "You can't delete your own account." });
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ ok: false, error: "User not found" });

    if (target.role === "admin") {
      const otherAdmins = await prisma.user.count({ where: { role: "admin", id: { not: target.id } } });
      if (otherAdmins === 0) {
        return res.status(400).json({ ok: false, error: "Can't delete the only remaining admin account." });
      }
    }

    // A commission an ambassador has already asked to be paid for (or been paid
    // for) is a financial record — it isn't erased because the student it came
    // from is being deleted.
    const lockedCommissions = await prisma.ambassadorEarning.count({
      where: { payoutId: { not: null }, OR: [{ referral: { refereeId: target.id } }, { ambassador: { userId: target.id } }] },
    });
    if (lockedCommissions > 0) {
      return res.status(409).json({ ok: false, error: "This account is tied to ambassador commissions that have been requested or paid out, so it can't be deleted." });
    }

    await prisma.$transaction([
      prisma.enrollment.deleteMany({ where: { userId: target.id } }),
      prisma.creditEntry.deleteMany({ where: { userId: target.id } }),
      // Ambassador side first: commissions (their own, and ones earned off this
      // student's purchase), then payout requests, then the profile itself.
      prisma.ambassadorEarning.deleteMany({ where: { OR: [{ ambassador: { userId: target.id } }, { referral: { refereeId: target.id } }] } }),
      prisma.ambassadorPayout.deleteMany({ where: { ambassador: { userId: target.id } } }),
      prisma.referral.deleteMany({ where: { OR: [{ referrerId: target.id }, { refereeId: target.id }] } }),
      prisma.ambassador.deleteMany({ where: { userId: target.id } }),
      prisma.user.delete({ where: { id: target.id } }),
    ]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
