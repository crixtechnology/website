const { prisma } = require("../db");

// Atomic, race-safe "next number" for a named sequence (currently just
// "receipt") — replaces the old Mongo Counter model's findByIdAndUpdate($inc).
// MySQL has no RETURNING clause, so the atomic increment-and-fetch uses the
// standard MySQL idiom: UPDATE ... SET seq = LAST_INSERT_ID(seq + 1) sets the
// connection's last-insert-id to the new value as part of the same atomic
// UPDATE (InnoDB row-locks the matched row for the statement's duration, so
// two concurrent callers can never be handed the same number), then
// SELECT LAST_INSERT_ID() reads it back on that same connection. Both
// statements run in one prisma.$transaction so they're guaranteed to share a
// connection.
async function nextSequence(name) {
  // Race-safe first-time row creation: two concurrent callers can both reach
  // this for a brand-new counter name at once (exactly what the /verify vs.
  // webhook race does for "receipt") — prisma.counter.upsert() isn't atomic
  // enough here (it can do a plain SELECT-then-INSERT under the hood, so
  // both callers can decide "doesn't exist yet" and both try to INSERT, and
  // the loser throws a unique-constraint error instead of falling back to an
  // update). `INSERT IGNORE` is a single atomic MySQL statement that just
  // silently skips the insert if the row already exists — no race, no error.
  await prisma.$executeRaw`INSERT IGNORE INTO counters (name, seq) VALUES (${name}, 0)`;

  const [, rows] = await prisma.$transaction([
    prisma.$executeRaw`UPDATE counters SET seq = LAST_INSERT_ID(seq + 1) WHERE name = ${name}`,
    prisma.$queryRaw`SELECT LAST_INSERT_ID() AS seq`,
  ]);
  return Number(rows[0].seq);
}

module.exports = { nextSequence };
