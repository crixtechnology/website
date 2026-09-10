// Optional: run the whole backend locally with a throwaway in-memory
// MongoDB — no Atlas account or local `mongod` install needed. Great for
// a first test-drive; real data won't persist between restarts.
//   npm run dev:memory
require("dotenv").config();
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

async function run() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("crix");
  console.log("In-memory MongoDB started at", process.env.MONGODB_URI);

  // Each run is a brand-new empty database, so auto-seed the admin from
  // ADMIN_EMAIL/ADMIN_PASSWORD — otherwise there'd be no way to log in.
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require("../models/User");
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    await User.create({ name: "Admin", email, passwordHash: await bcrypt.hash(password, 10), role: "admin" });
    console.log(`Seeded admin: ${email}`);
  }
  await mongoose.disconnect();

  require("../index.js");

  process.on("SIGINT", async () => {
    await mongod.stop();
    process.exit(0);
  });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
