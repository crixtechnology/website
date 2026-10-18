const { prisma } = require("../db");

// Dashboard notifications: a short message the student sees in My Dashboard
// (an application's status changed, credit was added). They accompany an email
// rather than replace it, and — like the emails — are best-effort: failing to
// write one must never undo or fail the thing it reports.
async function addNotification(userId, { title, body, link = "" }) {
  if (!userId || !title) return null;
  try {
    return await prisma.notification.create({
      data: { userId, title: String(title).slice(0, 190), body: String(body || ""), link: String(link || "").slice(0, 190) },
    });
  } catch (err) {
    console.error("[notifications] could not save:", err.message);
    return null;
  }
}

// Sends one of the careers emails from utils/mailer.js by name. The mailer is
// loaded lazily and every failure is swallowed (same reasoning as
// utils/walletNotices.js): an email problem must never fail a payment, a test
// submission or an admin's status change.
function sendCareerEmail(fnName, args) {
  try {
    const fn = require("./mailer")[fnName];
    if (typeof fn !== "function") return;
    Promise.resolve(fn(args)).catch((err) => console.error(`[careers] ${fnName} failed:`, err.message));
  } catch (err) {
    console.error(`[careers] ${fnName} failed:`, err.message);
  }
}

module.exports = { addNotification, sendCareerEmail };
