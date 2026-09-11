const express = require("express");
const Service = require("../models/Service");
const { requireAdmin } = require("../middleware/requireAdmin");
const { searchRegex } = require("../utils/searchRegex");

const router = express.Router();

// ---------- public: the IT services list shown on /services ----------
router.get("/services", async (req, res, next) => {
  try {
    const services = await Service.find({ status: "active" }).sort({ order: 1, createdAt: 1 });
    res.json({ ok: true, services });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: full CRUD ----------
router.get("/admin/services", requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const filter = q
      ? { $or: [{ title: searchRegex(q) }, { tag: searchRegex(q) }, { desc: searchRegex(q) }] }
      : {};
    const services = await Service.find(filter).sort({ order: 1, createdAt: 1 });
    res.json({ ok: true, services });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/services", requireAdmin, async (req, res, next) => {
  try {
    const { title, tag, desc, points, order, status } = req.body || {};
    if (!title) return res.status(400).json({ ok: false, error: "title is required" });

    let resolvedOrder = Number(order);
    if (!Number.isFinite(resolvedOrder)) {
      const last = await Service.findOne().sort({ order: -1 }).select("order");
      resolvedOrder = (last ? last.order : 0) + 1;
    }

    const service = await Service.create({
      title, tag: tag || "", desc: desc || "",
      points: Array.isArray(points) ? points : [],
      order: resolvedOrder,
      status: status === "inactive" ? "inactive" : "active",
    });
    res.status(201).json({ ok: true, service });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/services/:id", requireAdmin, async (req, res, next) => {
  try {
    const { title, tag, desc, points, order, status } = req.body || {};
    const update = {};
    if (title !== undefined) update.title = title;
    if (tag !== undefined) update.tag = tag;
    if (desc !== undefined) update.desc = desc;
    if (points !== undefined) update.points = Array.isArray(points) ? points : [];
    if (order !== undefined && Number.isFinite(Number(order))) update.order = Number(order);
    if (status !== undefined) update.status = status === "inactive" ? "inactive" : "active";

    const service = await Service.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!service) return res.status(404).json({ ok: false, error: "Service not found" });
    res.json({ ok: true, service });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/services/:id", requireAdmin, async (req, res, next) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ ok: false, error: "Service not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
