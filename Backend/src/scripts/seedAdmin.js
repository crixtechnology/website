// One-time script: creates the first admin User from ADMIN_EMAIL /
// ADMIN_PASSWORD in .env. Safe to re-run — it skips creation if that admin
// already exists, and promotes an existing student account to admin if the
// email is already registered.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { connectDB } = require("../db");
const User = require("../models/User");
const mongoose = require("mongoose");

async function run() {
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first.");
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role === "admin") {
      console.log(`Admin ${email} already exists — nothing to do.`);
    } else {
      existing.role = "admin";
      await existing.save();
      console.log(`Promoted existing account ${email} to admin.`);
    }
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({ name: "Admin", email, passwordHash, role: "admin" });
    console.log(`Admin ${email} created.`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
