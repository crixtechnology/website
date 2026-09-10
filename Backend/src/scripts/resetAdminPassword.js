// One-off: force-set the password (and role: admin) for ADMIN_EMAIL, using
// ADMIN_PASSWORD from .env. Unlike seedAdmin.js this OVERWRITES an existing
// account's password. Use when the admin exists but you don't know / changed
// the password. Safe to re-run.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { connectDB } = require("../db");
const User = require("../models/User");

async function run() {
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first.");
    process.exit(1);
  }

  await connectDB();

  const passwordHash = await bcrypt.hash(password, 10);
  const res = await User.findOneAndUpdate(
    { email },
    { $set: { passwordHash, role: "admin" }, $setOnInsert: { name: "Admin", email } },
    { new: true, upsert: true }
  );
  console.log(`Password reset for ${res.email} (role: ${res.role}).`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
