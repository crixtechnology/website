const { PrismaClient } = require("@prisma/client");

// Single shared Prisma client for the whole process — Prisma manages its own
// connection pool internally, so there's no separate connect()/listen()
// ordering to get right the way there was with mongoose.connect(). connectDB()
// is kept as a thin async wrapper (does a cheap query) purely so index.js's
// existing "fail fast if the DB is unreachable at boot" behavior is preserved.
const prisma = new PrismaClient();

async function connectDB() {
  await prisma.$queryRaw`SELECT 1`;
  console.log("MySQL connected");
}

module.exports = { prisma, connectDB };
