// Shared in-memory MongoDB setup for tests — each test FILE gets its own
// throwaway MongoMemoryServer instance (simpler and more isolated than
// wiring Jest's globalSetup/globalTeardown across worker processes, which
// don't share process.env with the actual test files). Mirrors the same
// mongodb-memory-server dependency scripts/devWithMemoryServer.js already
// uses for local dev, just per-test instead of for a whole dev session.
//
// MONGODB_URI is set BEFORE app.js is required — app.js calls
// require("dotenv").config() internally, and dotenv only fills in vars
// that are still unset, so the real .env's MONGODB_URI never overwrites
// this one. Requiring app.js here (not at each test file's own top level)
// is what guarantees that ordering.
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

async function setupTestDb() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("crix-test");
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-do-not-use-in-production";
  // Force every best-effort external integration (Resend receipt emails,
  // formsubmit.co notifications) onto its fail-soft "skip" path instead of
  // making real network calls during tests — app.js's require("dotenv")
  // would otherwise pick up the real Backend/.env's live RESEND_API_KEY.
  // Both are already designed to no-op cleanly when unset/unreachable, so
  // this doesn't change what's being tested, just removes an external
  // network dependency (and the real HTTP calls) from the test run.
  process.env.RESEND_API_KEY = "";
  process.env.CONTACT_TO_EMAIL = "";
  await mongoose.connect(process.env.MONGODB_URI);
  return require("../src/app");
}

async function teardownTestDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

module.exports = { setupTestDb, teardownTestDb };
