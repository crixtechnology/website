const express = require("express");
const { prisma } = require("../db");
const { requireAdmin } = require("../middleware/requireAdmin");
const { serialize } = require("../utils/serialize");

const router = express.Router();

// ---------- public: the IT services list shown on /services ----------
router.get("/services", async (req, res, next) => {
  try {
    const services = await prisma.service.findMany({
      where: { status: "active" },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    res.json({ ok: true, services: serialize(services) });
  } catch (e) {
    next(e);
  }
});

// ---------- admin: full CRUD ----------
router.get("/admin/services", requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const where = q
      ? {
          OR: [
            { title: { contains: q } },
            { tag: { contains: q } },
            { desc: { contains: q } },
          ],
        }
      : {};
    const services = await prisma.service.findMany({ where, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
    res.json({ ok: true, services: serialize(services) });
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
      const last = await prisma.service.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
      resolvedOrder = (last ? last.order : 0) + 1;
    }

    const service = await prisma.service.create({
      data: {
        title,
        tag: tag || "",
        desc: desc || "",
        points: Array.isArray(points) ? points : [],
        order: resolvedOrder,
        status: status === "inactive" ? "inactive" : "active",
      },
    });
    res.status(201).json({ ok: true, service: serialize(service) });
  } catch (e) {
    next(e);
  }
});

router.put("/admin/services/:id", requireAdmin, async (req, res, next) => {
  try {
    const { title, tag, desc, points, order, status } = req.body || {};
    const data = {};
    if (title !== undefined) data.title = title;
    if (tag !== undefined) data.tag = tag;
    if (desc !== undefined) data.desc = desc;
    if (points !== undefined) data.points = Array.isArray(points) ? points : [];
    if (order !== undefined && Number.isFinite(Number(order))) data.order = Number(order);
    if (status !== undefined) data.status = status === "inactive" ? "inactive" : "active";

    const service = await prisma.service.update({ where: { id: req.params.id }, data }).catch(() => null);
    if (!service) return res.status(404).json({ ok: false, error: "Service not found" });
    res.json({ ok: true, service: serialize(service) });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/services/:id", requireAdmin, async (req, res, next) => {
  try {
    const service = await prisma.service.delete({ where: { id: req.params.id } }).catch(() => null);
    if (!service) return res.status(404).json({ ok: false, error: "Service not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
