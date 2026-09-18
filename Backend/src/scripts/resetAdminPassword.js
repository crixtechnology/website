// One-off: force-set the password (and role: admin) for ADMIN_EMAIL, using
// ADMIN_PASSWORD from .env. Unlike seedAdmin.js this OVERWRITES an existing
// account's password. Use when the admin exists but you don't know / changed
// the password. Safe to re-run.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { prisma } = require("../db");

async function run() {
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const res = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "admin" },
    create: { name: "Admin", email, passwordHash, role: "admin" },
  });
  console.log(`Password reset for ${res.email} (role: ${res.role}).`);

  await prisma.$disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
