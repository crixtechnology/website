// Shared MySQL test setup — replaces the old per-file mongodb-memory-server
// instance (MySQL has no equivalent throwaway in-memory server tooling).
// Instead, every test file shares one real local `crix_test` database and
// setupTestDb() wipes every table (in FK-safe, child-before-parent order)
// each time it's called, so each test file still starts from an empty DB —
// same effective isolation, just via TRUNCATE-by-deleteMany instead of a
// fresh server. jest.config's `--runInBand` means test files run serially,
// so there's no cross-file interference from sharing the one database.
//
// DATABASE_URL is set BEFORE app.js (which requires ../db, which
// instantiates PrismaClient reading process.env.DATABASE_URL) is required —
// app.js's own require("dotenv").config() only fills in vars that are still
// unset, so the real .env's DATABASE_URL never overwrites this one.
const { execSync } = require("child_process");
const path = require("path");

let prisma;

async function setupTestDb() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-do-not-use-in-production";
  // Force every best-effort external integration (Resend receipt emails,
  // formsubmit.co notifications) onto its fail-soft "skip" path instead of
  // making real network calls during tests — both are already designed to
  // no-op cleanly when unset/unreachable, so this doesn't change what's
  // being tested, just removes an external network dependency from the run.
  process.env.RESEND_API_KEY = "";
  process.env.CONTACT_TO_EMAIL = "";

  if (!process.env.TEST_DATABASE_URL) {
    // Derive crix_test's URL from the real Backend/.env's DATABASE_URL
    // (same host/user/password, just a different database name) instead of
    // guessing credentials — dotenv.config() only fills in vars that are
    // still unset, so loading it here doesn't clobber anything, and app.js's
    // own later require("dotenv").config() call is then a no-op for this var.
    require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
    const realUrl = process.env.DATABASE_URL || "mysql://root:password@localhost:3306/crix";
    process.env.TEST_DATABASE_URL = realUrl.replace(/\/([^/?]+)(\?|$)/, "/crix_test$2");
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

  const app = require("../src/app");
  ({ prisma } = require("../src/db"));

  // Make sure crix_test's schema matches prisma/schema.prisma. `db push`
  // (not `migrate deploy`) so tests don't depend on a migrations history —
  // just "make crix_test match the schema file" — fast and idempotent.
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      cwd: path.join(__dirname, ".."),
      env: process.env,
      stdio: "pipe",
    });
  } catch (e) {
    throw new Error(`prisma db push against ${process.env.DATABASE_URL} failed:\n${e.stderr || e.stdout || e.message}`);
  }

  await clearTestDb();
  return app;
}

async function clearTestDb() {
  await prisma.payment.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.application.deleteMany();
  await prisma.video.deleteMany();
  await prisma.lecture.deleteMany();
  await prisma.course.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.service.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.user.deleteMany();
}

async function teardownTestDb() {
  if (prisma) await prisma.$disconnect();
}

module.exports = { setupTestDb, teardownTestDb, clearTestDb };
