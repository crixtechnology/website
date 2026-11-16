const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { getWallet, adjustCredit } = require("../utils/wallet");

const router = express.Router();

// ---------- student: my wallet (balance + history) ----------
router.get("/me/wallet", requireAuth, async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, wallet: await getWallet(req.user.sub) });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: add credit to / take credit from a student's wallet ----------
// Body: { rupees: whole number (negative to take away), note?: string }.
router.post("/admin/users/:id/wallet", requireAdmin, async (req, res, next) => {
  try {
    const { rupees, note } = req.body || {};
    const result = await adjustCredit({ userId: req.params.id, rupees, note, adminId: req.admin.sub });
    if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
    res.status(201).json({ ok: true, wallet: await getWallet(req.params.id, 20) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
