// "Credit was added to your wallet" notices.
//
// Kept apart from utils/wallet.js and utils/referrals.js (which would otherwise
// need each other) so both can send it. The mailer is loaded lazily and every
// failure is swallowed: an email problem must never undo or delay a credit.
//
// Call it only once the credit is safely saved. `user` is { email, name };
// amounts are whole or fractional rupees; `reason` is "admin" or "referral".
function notifyCreditAdded({ user, rupees, balanceRupees, reason, note }) {
  try {
    if (!user || !user.email || !(rupees > 0)) return;
    const { sendWalletCreditEmail } = require("./mailer");
    if (typeof sendWalletCreditEmail !== "function") return;
    Promise.resolve(sendWalletCreditEmail({ to: user.email, name: user.name, amount: rupees, balance: balanceRupees, reason, note }))
      .catch((err) => console.error("[wallet] credit email failed:", err.message));
  } catch (err) {
    console.error("[wallet] credit email failed:", err.message);
  }
}

module.exports = { notifyCreditAdded };
