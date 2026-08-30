const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const router = express.Router();

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required" });
    }
    const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() });
    if (!admin) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    const token = jwt.sign({ sub: admin._id.toString(), email: admin.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({ ok: true, token, email: admin.email });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
