// How long aptitude-test webcam photos are kept, and their deletion.
//
// The photos are personal data collected only to check that a test was taken
// fairly, so they don't outlive that need (Privacy Policy, "Data Retention"):
//   - deleted 6 months after the application is closed (selected, not
//     shortlisted or rejected — JobApplication.closedAt);
//   - and in any case no later than 12 months after the test was taken, so an
//     application nobody decided on can't keep them forever;
//   - deleted straight away when the student's account is deleted.
// The file in storage goes first, then its database row: a row is only removed
// once its file is really gone, so a storage hiccup is retried next time
// instead of leaving an orphaned photo nobody can find.
const { prisma } = require("../db");
const { deleteSnapshot } = require("./proctorStorage");

const RETAIN_AFTER_CLOSE_MONTHS = 6;
const MAX_AGE_MONTHS = 12;
const FINAL_STATUSES = ["selected", "not_shortlisted", "rejected"];
const BATCH = 200;

const monthsBefore = (months, from) => {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
};

// Deletes the files, then the rows of the ones that went. Returns { deleted, failed }.
async function deleteSnapshotRows(rows) {
  const gone = [];
  let failed = 0;
  for (const row of rows) {
    try {
      await deleteSnapshot(row.storageKey);
      gone.push(row.id);
    } catch (e) {
      failed += 1;
      console.error(`[proctoring] couldn't delete snapshot ${row.id}:`, e.message);
    }
  }
  if (gone.length) await prisma.testSnapshot.deleteMany({ where: { id: { in: gone } } });
  return { deleted: gone.length, failed };
}

// Every photo of one student's tests (their account is being deleted).
async function purgeUserSnapshots(userId) {
  const rows = await prisma.testSnapshot.findMany({ where: { attempt: { userId } }, select: { id: true, storageKey: true } });
  return deleteSnapshotRows(rows);
}

// Which photos are past their retention period at `now`.
function expiredWhere(now = new Date()) {
  const closedBefore = monthsBefore(RETAIN_AFTER_CLOSE_MONTHS, now);
  return {
    OR: [
      { attempt: { application: { closedAt: { lt: closedBefore } } } },
      // Closed before closedAt was recorded: the last change is when it closed.
      { attempt: { application: { closedAt: null, status: { in: FINAL_STATUSES }, updatedAt: { lt: closedBefore } } } },
      { attempt: { startedAt: { lt: monthsBefore(MAX_AGE_MONTHS, now) } } },
    ],
  };
}

// Deletes every photo past its retention period. Returns { deleted, failed }.
async function purgeExpiredSnapshots(now = new Date()) {
  let deleted = 0;
  let failed = 0;
  const skip = new Set(); // rows whose file couldn't be deleted this run
  for (;;) {
    const rows = await prisma.testSnapshot.findMany({
      where: { ...expiredWhere(now), id: { notIn: [...skip] } },
      select: { id: true, storageKey: true },
      take: BATCH,
    });
    if (rows.length === 0) break;
    const result = await deleteSnapshotRows(rows);
    deleted += result.deleted;
    failed += result.failed;
    for (const r of rows) skip.add(r.id); // anything left is a failure: don't loop on it
  }
  if (deleted || failed) console.log(`[proctoring] retention: deleted ${deleted} webcam photo(s)${failed ? `, ${failed} to retry` : ""}`);
  return { deleted, failed };
}

// Runs the clean-up shortly after the server starts, then every 6 hours.
function startSnapshotCleanup() {
  const run = () => purgeExpiredSnapshots().catch((e) => console.error("[proctoring] retention run failed:", e.message));
  const first = setTimeout(run, 60 * 1000);
  const every = setInterval(run, 6 * 60 * 60 * 1000);
  first.unref();
  every.unref();
}

module.exports = { RETAIN_AFTER_CLOSE_MONTHS, MAX_AGE_MONTHS, FINAL_STATUSES, purgeUserSnapshots, purgeExpiredSnapshots, startSnapshotCleanup };
