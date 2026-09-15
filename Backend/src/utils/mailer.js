// Sends notification emails via formsubmit.co's AJAX endpoint rather than
// SMTP or a transactional-email API. This is the third approach tried for
// this: raw SMTP (Gmail, then Brevo's own SMTP relay) hung on every attempt
// because this backend's Render plan silently drops outbound TCP on
// non-HTTP(S) ports; Brevo's HTTP API connected fine but the sender
// (a plain @gmail.com address, not a domain Brevo can add DKIM/DMARC
// records for) got flagged by Google/Yahoo/Microsoft's sender-authentication
// requirements and the notification never arrived. formsubmit.co needs no
// API key or sender verification — it forwards to CONTACT_TO_EMAIL directly
// — at the cost of being a third-party relay with no delivery dashboard.
//
// One-time setup: the first real submission after CONTACT_TO_EMAIL is set
// makes formsubmit.co send *that inbox* a confirmation link, which must be
// clicked before it will forward any submission (including this one) —
// this isn't something the code can do for you.
const { primaryOrigin } = require("./clientOrigin");

const FORMSUBMIT_URL = (to) => `https://formsubmit.co/ajax/${encodeURIComponent(to)}`;

// A plain HTTPS call still needs its own bound — the whole reason SMTP was
// abandoned above was an unbounded outbound connection hanging a request
// indefinitely, and a fetch() with no signal can do exactly the same thing
// if formsubmit.co itself stalls. 10s matches the timeout used on the old
// SMTP transport.
const REQUEST_TIMEOUT_MS = 10_000;

// Both notification functions below interpolate a caller-supplied string
// (interest / refTitle) into the HTML formsubmit.co's `_template: "box"`
// renders. Both POST /contact and POST /applications are public,
// unauthenticated endpoints that accept any string for these fields —
// nothing upstream constrains them to the frontend's own dropdown/fixed
// values — so this escape is the only thing standing between a crafted
// submission and markup/script running in whatever mail client renders the
// admin's notification. (name/email/phone/company/message/college never
// appear in this email at all, so they need no escaping here.)
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Shares CLIENT_ORIGIN parsing with index.js's CORS setup (utils/clientOrigin.js)
// instead of re-deriving it here, so the two can't silently drift apart.
// Falls back to the real production URL if it's ever unset, since
// formsubmit.co specifically needs *some* real http(s) URL, not a relative
// path — used both for the admin-panel link below and as the Referer
// header formsubmit.co requires (see sendViaFormSubmit).
function siteOrigin() {
  return primaryOrigin() || "https://crixtechnology.in";
}

// `path` is which page this notification is conceptually "from" (only used
// for the Referer header formsubmit.co's anti-abuse check wants to see —
// see sendViaFormSubmit) — /contact for a contact-form message, /programs
// for an internship/course application, so the two don't misrepresent each
// other if formsubmit.co ever keys anything off the referring path.
async function sendViaFormSubmit({ subject, text, path }) {
  const to = process.env.CONTACT_TO_EMAIL || "support@crixtechnology.com";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(FORMSUBMIT_URL(to), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // formsubmit.co rejects any request with no Referer at all as
        // "opened as an HTML file" — it's built to be called from a
        // browser on a real page, not server-to-server, so this fakes
        // that with our own site's actual origin (a request genuinely
        // made on that site's behalf).
        Referer: `${siteOrigin()}${path}`,
      },
      body: JSON.stringify({
        _subject: subject,
        _template: "box",
        Notification: text,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !(data.success === "true" || data.success === true)) {
    // Surfaces formsubmit.co's own message (e.g. "This form needs
    // Activation...") in the server log — that message is the actionable
    // part while the form is still unconfirmed. Falls back to the status
    // code alone if formsubmit.co ever responds with no usable message.
    throw new Error(`formsubmit.co error (status ${res.status}): ${(data && data.message) || "no error message in response"}`);
  }
  return { sent: true };
}

// Points the "check the admin panel" link at the actual site instead of a
// bare path.
function adminLink(path) {
  return `${siteOrigin()}${path}`;
}

// Deliberately a bare "something came in" ping, not the submission itself —
// name/email/phone/company/message/college never leave the server by email.
// The admin panel (already the source of truth for every submission) is
// where the actual content gets read.
async function sendContactEmail({ interest }) {
  const link = adminLink("/admin/messages");
  const safeInterest = interest ? escapeHtml(interest) : "";
  return sendViaFormSubmit({
    path: "/contact",
    subject: `New contact form message${safeInterest ? ` — ${safeInterest}` : ""}`,
    text: `A new contact form message was received${safeInterest ? ` (interested in: ${safeInterest})` : ""}. Log in to the admin panel to view it: ${link}`,
  });
}

// Same bare-ping shape as sendContactEmail, for a new internship/course
// application (Apply / Inquire to enroll / Buy-now) — the row is already
// persisted by the time this runs, so a delivery failure here just means a
// missed notification, not a lost inquiry. refTitle/type name the program,
// not the applicant, so they're fine to include (once escaped — refTitle is
// attacker-controllable free text via POST /applications, same as interest
// above).
async function sendApplicationEmail({ type, refTitle }) {
  const label = type === "internship" ? "Internship application" : "Course inquiry";
  const link = adminLink("/admin/applications");
  const safeRefTitle = escapeHtml(refTitle);
  return sendViaFormSubmit({
    path: "/programs",
    subject: `New ${label} — ${safeRefTitle}`,
    text: `A new ${label} was received for "${safeRefTitle}". Log in to the admin panel to view it: ${link}`,
  });
}

// ---------- Receipt email (transactional — goes to the customer) ----------
// formsubmit.co above is a "notify the site owner" relay: it needs the
// RECEIVING address to click a one-time confirmation link before anything
// will ever land in its inbox, which makes it fundamentally unusable for a
// receipt that has to reach a different customer's inbox every time (they'd
// never have confirmed anything). This uses Resend's HTTP API instead — a
// real transactional sender, with a domain-verified From address so it
// doesn't get spam-flagged the way the earlier bare-gmail.com Brevo sender
// did (see the big comment at the top of this file for that history).
const RESEND_API_URL = "https://api.resend.com/emails";
const resendApiKey = process.env.RESEND_API_KEY || "";
const resendLooksUnset = !resendApiKey || /placeholder|changeme|xxxx|your_key/i.test(resendApiKey);
if (resendLooksUnset) {
  console.warn(
    "⚠ RESEND_API_KEY is missing or a placeholder in Backend/.env — receipt emails will be skipped " +
    "(the in-app \"Download Receipt\" button still works either way). Set it once you have a Resend " +
    "account with crixtechnology.in verified as a sending domain."
  );
}
const RECEIPT_FROM = process.env.RECEIPT_FROM_EMAIL || "Crix Technology <receipts@crixtechnology.in>";

function fmtRupees(n) {
  return `Rs. ${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Best-effort, like the two notification senders above — a delivery failure
// (or RESEND_API_KEY simply not being set yet) must never break the payment
// flow that calls this. Caller (routes/payments.js's attachReceipt) already
// wraps this in try/catch and only logs.
async function sendReceiptEmail({ receipt, pdfBuffer }) {
  if (resendLooksUnset) return { sent: false, reason: "RESEND_API_KEY not configured" };
  if (!receipt.buyerEmail) return { sent: false, reason: "No buyer email on this receipt" };

  const safeName = escapeHtml(receipt.buyerName || "there");
  const safeTitle = escapeHtml(receipt.itemTitle || "your purchase");
  const kindLabel = receipt.itemType === "internship" ? "internship" : "course";
  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;color:#1e293b;max-width:520px;margin:0 auto">
      <h2 style="color:#0f1f3d;margin-bottom:4px">Thanks for your purchase, ${safeName}!</h2>
      <p>Your payment for <strong>${safeTitle}</strong> (${kindLabel}) has been confirmed.</p>
      <p>Receipt No: <strong>${escapeHtml(receipt.receiptNumber)}</strong><br/>
      Amount Paid: <strong>${fmtRupees(receipt.totalPaid)}</strong></p>
      <p>Your receipt is attached to this email as a PDF — you can also download it any time from
      "My Courses" on your account.</p>
      <p style="color:#64748b;font-size:13px">Crix Technology Private Limited</p>
    </div>
  `;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RECEIPT_FROM,
        to: receipt.buyerEmail,
        subject: `Your Crix Technology receipt — ${receipt.receiptNumber}`,
        html,
        attachments: [
          {
            filename: `Receipt-${receipt.receiptNumber}.pdf`,
            content: pdfBuffer.toString("base64"),
          },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Resend error (status ${res.status}): ${(data && data.message) || "no error message in response"}`);
  }
  return { sent: true, id: data && data.id };
}

module.exports = { sendContactEmail, sendApplicationEmail, sendReceiptEmail };
