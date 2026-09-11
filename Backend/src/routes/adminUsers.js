const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Enrollment = require("../models/Enrollment");
const Application = require("../models/Application");
const { requireAdmin } = require("../middleware/requireAdmin");
const { isExpired } = require("../utils/enrollmentAccess");

const router = express.Router();

const SAFE_FIELDS = "name email phone role createdAt";

// ---------- admin: user directory, search + full CRUD ----------
// This is the "user data" section of the admin panel's search — separate
// from /admin/enrollments (subscriptions), which is where granting/editing/
// revoking course access actually happens (see routes/enrollments.js). This
// file just manages the accounts themselves.
router.get("/admin/users", requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const filter = q
      ? { $or: [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }, { phone: new RegExp(q, "i") }] }
      : {};
    const users = await User.find(filter).select(SAFE_FIELDS).sort({ createdAt: -1 });
    res.json({ ok: true, users });
  } catch (e) {
    next(e);
  }
});

// Detail view: the account plus its subscriptions and applications, so the
// admin can grant/edit/revoke access right from a user's page too.
router.get("/admin/users/:id", requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    const user = await User.findById(req.params.id).select(SAFE_FIELDS);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    const [enrollments, applications] = await Promise.all([
      Enrollment.find({ user: user._id, status: "active" }).populate("course", "title slug type").sort({ createdAt: -1 }),
      Application.find({ user: user._id }).select("type refTitle createdAt").sort({ createdAt: -1 }),
    ]);

    res.json({
      ok: true,
      user,
      enrollments: enrollments.map((e) => ({ ...e.toObject(), expired: isExpired(e) })),
      applications,
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

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select(SAFE_FIELDS);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    res.json({ ok: true, user });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/users/:id", requireAdmin, async (req, res, next) => {
  try {
    if (String(req.admin.sub) === String(req.params.id)) {
      return res.status(400).json({ ok: false, error: "You can't delete your own account." });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ ok: false, error: "User not found" });

    if (target.role === "admin") {
      const otherAdmins = await User.countDocuments({ role: "admin", _id: { $ne: target._id } });
      if (otherAdmins === 0) {
        return res.status(400).json({ ok: false, error: "Can't delete the only remaining admin account." });
      }
    }

    await Promise.all([
      User.findByIdAndDelete(target._id),
      Enrollment.deleteMany({ user: target._id }),
    ]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
