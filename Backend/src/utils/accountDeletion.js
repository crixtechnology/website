const crypto = require("crypto");
const { prisma } = require("../db");
const { purgeUserSnapshots } = require("./proctorRetention");

// Deleting an account — the one path both a student's own request (Profile →
// Delete my account, routes/account.js) and Admin → Users take, so the two can
// never erase different things.
//
// What goes (Digital Personal Data Protection Act 2023, s.12 — erasure):
//   - the account itself: name, email, phone, password, Google link, sessions
//   - enrolments and course access, wallet credit, referrals
//   - careers applications, aptitude tests, answers, violations, and the
//     webcam photos in storage (deleted first: if storage can't be reached,
//     nothing is deleted, so no photo is ever left behind without its record)
//   - dashboard notifications, payment requests, one-time codes
//   - messages sent through the contact form from the same email address
// What stays, with no link back to the account:
//   - payments and their receipts (buyer name, email and phone as printed on
//     the receipt) — Indian tax and accounting law requires them to be kept
//   - the course/internship application a payment was made for, with the
//     applicant's details blanked out (the receipt already has what the law needs)
// A row in account_deletions records that the request was carried out.

const RETAINED_PAYMENTS_NOTE = "payment records and receipts, kept as Indian tax and accounting law requires";

// The same address always hashes the same, so "did you delete my data?" can be
// answered later without keeping the address itself.
const emailHash = (email) => crypto.createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex");

// What deleting this account would remove and keep — shown to the student
// before they confirm.
async function deletionSummary(userId) {
  const now = new Date();
  const [activeCourses, credit, applications, payments] = await Promise.all([
    prisma.enrollment.count({ where: { userId, status: "active", OR: [{ endDate: null }, { endDate: { gt: now } }] } }),
    prisma.creditEntry.aggregate({ where: { userId }, _sum: { amount: true } }),
    prisma.jobApplication.count({ where: { userId } }),
    prisma.payment.count({ where: { userId, status: "paid" } }),
  ]);
  return {
    activeCourses,
    walletCredits: Math.max(0, Math.round((credit._sum.amount || 0) / 100)),
    jobApplications: applications,
    paymentsKept: payments,
  };
}

// Returns { ok: true, paymentsKept } or { ok: false, status, error }.
async function deleteAccount(target, { requestedBy, adminId = null }) {
  // The files first: if storage is unreachable, stop before anything else goes.
  const photos = await purgeUserSnapshots(target.id);
  if (photos.failed) {
    return {
      ok: false,
      status: 502,
      error: "Couldn't delete the aptitude-test photos from storage right now. Nothing was deleted — please try again in a few minutes.",
    };
  }

  const paymentsKept = await prisma.payment.count({ where: { userId: target.id } });
  const email = String(target.email || "").trim().toLowerCase();
  await prisma.$transaction([
    prisma.application.updateMany({
      where: { OR: [{ userId: target.id }, ...(email ? [{ email }] : [])] },
      data: { name: "Deleted user", email: "", phone: "", college: "" },
    }),
    ...(email ? [prisma.contact.deleteMany({ where: { email } })] : []),
    prisma.enrollment.deleteMany({ where: { userId: target.id } }),
    prisma.creditEntry.deleteMany({ where: { userId: target.id } }),
    prisma.referral.deleteMany({ where: { OR: [{ referrerId: target.id }, { refereeId: target.id }] } }),
    prisma.accountDeletion.create({
      data: {
        formerUserId: target.id,
        emailHash: emailHash(target.email),
        requestedBy,
        adminId,
        retainedNote: paymentsKept ? `${paymentsKept} ${RETAINED_PAYMENTS_NOTE}` : "",
      },
    }),
    // Job applications (and their tests), payment requests, notifications and
    // one-time codes go with the user (onDelete: Cascade); payments and
    // applications are kept with their link to the user cleared.
    prisma.user.delete({ where: { id: target.id } }),
  ]);
  return { ok: true, paymentsKept };
}

module.exports = { deleteAccount, deletionSummary, emailHash };
