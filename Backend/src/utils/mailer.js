// TWO senders live in this file:
//   1. Site-owner notifications (contact form / applications) go through
//      formsubmit.co's AJAX endpoint, described below.
//   2. Everything that must reach a CUSTOMER's inbox — purchase receipts,
//      password OTPs, the account-exists notice — goes through real SMTP
//      (nodemailer), configured with the SMTP_* env vars; see the bottom half.
//
// The formsubmit.co sender is the third approach tried for owner notifications: raw SMTP (Gmail, then Brevo's own SMTP relay) hung on every attempt
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
const { tierLabel } = require("./tiers");

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

// ---------- Transactional email over SMTP (goes to the customer) ----------
// formsubmit.co above is a "notify the site owner" relay: it needs the
// RECEIVING address to click a one-time confirmation link before anything
// will ever land in its inbox, which makes it unusable for mail that has to
// reach a different customer's inbox every time. Those go over plain SMTP.
//
// Render's free tier blocks outbound SMTP ports (that's why the owner-notice
// path above avoids it) — so on Render these sends simply time out and are
// logged; everything that calls them is best-effort or reports a clear
// "couldn't send" error. They work as-is on a VPS with the SMTP_* vars set.
//
//   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE (true for port 465;
//   default: true only when the port is 465, STARTTLS otherwise),
//   SMTP_USER, SMTP_PASS, SMTP_FROM ("Crix Technology <no-reply@yourdomain>" —
//   most providers require this to be an address they've verified for you).
//
// With SMTP unset, nothing is sent. For local development only, set
// MAIL_DEV_LOG=true to have each email's text printed to the server console
// instead, so flows that email a code (OTP) can be exercised without SMTP.
// Off by default on purpose: it would put one-time codes in the logs.
const nodemailer = require("nodemailer");

const looksUnset = (v) => !v || /placeholder|changeme|xxxx|your_/i.test(v);

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  if (looksUnset(host)) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return {
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    from: process.env.SMTP_FROM || process.env.RECEIPT_FROM_EMAIL || "Crix Technology <no-reply@crixtechnology.in>",
  };
}

if (!smtpConfig()) {
  console.warn(
    "⚠ SMTP_HOST is not set in Backend/.env — receipt emails, password OTP emails and account notices will not be sent " +
    "(the in-app \"Download Receipt\" button still works). Set the SMTP_* variables on the server that can reach an SMTP host."
  );
}

let cached = { key: null, transporter: null };
function getTransporter(cfg) {
  const key = JSON.stringify([cfg.host, cfg.port, cfg.secure, cfg.auth && cfg.auth.user]);
  if (cached.key !== key) {
    cached = {
      key,
      transporter: nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.auth,
        // Bounded on every stage: an unreachable/blocked SMTP port must fail
        // in seconds, never hang the request (or the payment flow) behind it.
        connectionTimeout: REQUEST_TIMEOUT_MS,
        greetingTimeout: REQUEST_TIMEOUT_MS,
        socketTimeout: 20_000,
      }),
    };
  }
  return cached.transporter;
}

// Returns { sent: true, id } | { sent: false, reason }. Throws only when SMTP
// IS configured and the send itself fails (bad credentials, host unreachable…)
// — callers decide whether that's fatal (OTP request: yes) or just logged
// (receipt: it must never undo a payment).
async function deliver({ to, subject, text, html, attachments }) {
  const cfg = smtpConfig();
  if (!cfg) {
    if (process.env.MAIL_DEV_LOG === "true") {
      console.log(`[mail:dev] SMTP not configured — would send:\n  To: ${to}\n  Subject: ${subject}\n  ${String(text).replace(/\n/g, "\n  ")}`);
      return { sent: false, dev: true, reason: "SMTP not configured (logged to console)" };
    }
    return { sent: false, reason: "SMTP not configured" };
  }
  const info = await getTransporter(cfg).sendMail({ from: cfg.from, to, subject, text, html, attachments });
  return { sent: true, id: info.messageId };
}

function fmtRupees(n) {
  return `Rs. ${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Shared frame so every transactional email looks the same.
function layout(bodyHtml) {
  return `
    <div style="font-family:Helvetica,Arial,sans-serif;color:#1e293b;max-width:520px;margin:0 auto">
      ${bodyHtml}
      <p style="color:#64748b;font-size:13px">Crix Technology Private Limited</p>
    </div>
  `;
}

// Best-effort, like the notification senders above — a delivery failure (or
// SMTP simply not being set up yet) must never break the payment flow that
// calls this. Caller (routes/payments.js's attachReceipt) already wraps this in
// try/catch and only logs. Covers courses AND internships (receipt.itemType).
async function sendReceiptEmail({ receipt, pdfBuffer }) {
  if (!receipt.buyerEmail) return { sent: false, reason: "No buyer email on this receipt" };

  const safeName = escapeHtml(receipt.buyerName || "there");
  const safeTitle = escapeHtml(receipt.itemTitle || "your purchase");
  const kindLabel = receipt.itemType === "internship" ? "internship" : "course";
  const planLabel = tierLabel(receipt.tier);
  const planText = planLabel ? `, ${receipt.fromTier ? `upgrade from ${tierLabel(receipt.fromTier)} to ${planLabel}` : `${planLabel} plan`}` : "";
  const html = layout(`
      <h2 style="color:#0f1f3d;margin-bottom:4px">Thanks for your purchase, ${safeName}!</h2>
      <p>Your payment for <strong>${safeTitle}</strong> (${kindLabel}${escapeHtml(planText)}) has been confirmed.</p>
      <p>Receipt No: <strong>${escapeHtml(receipt.receiptNumber)}</strong><br/>
      Amount Paid: <strong>${fmtRupees(receipt.totalPaid)}</strong></p>
      <p>Your receipt is attached to this email as a PDF — you can also download it any time from
      "My Dashboard" on your account.</p>`);
  const text =
    `Thanks for your purchase, ${receipt.buyerName || "there"}!\n\n` +
    `Your payment for ${receipt.itemTitle || "your purchase"} (${kindLabel}${planText}) has been confirmed.\n` +
    `Receipt No: ${receipt.receiptNumber}\nAmount Paid: ${fmtRupees(receipt.totalPaid)}\n\n` +
    `Your receipt is attached as a PDF. You can also download it any time from "My Dashboard" on your account.\n\nCrix Technology Private Limited`;

  return deliver({
    to: receipt.buyerEmail,
    subject: `Your Crix Technology receipt — ${receipt.receiptNumber}`,
    text,
    html,
    attachments: [{ filename: `Receipt-${receipt.receiptNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
  });
}

// ---------- "you already have an account" notice ----------
// Sent by routes/auth.js's /signup when the submitted email already has an
// account, INSTEAD of a distinct "account already exists" error — telling the
// caller that directly is an email-enumeration leak. The signup response is
// ambiguous either way; this email is where the real account owner finds out.
async function sendAccountExistsEmail({ to, name }) {
  const safeName = escapeHtml(name || "there");
  const loginLink = siteOrigin();
  const html = layout(`
      <h2 style="color:#0f1f3d;margin-bottom:4px">Hi ${safeName},</h2>
      <p>Someone just tried to create a Crix Technology account with this email address — but you
      already have one.</p>
      <p>If this was you, just log in instead: <a href="${loginLink}">${loginLink}</a>. Forgot your password? Use
      "Forgot password" on the login form.</p>
      <p>If it wasn't you, no action is needed — no account was created and your existing one is unaffected.</p>`);
  const text =
    `Hi ${name || "there"},\n\nSomeone just tried to create a Crix Technology account with this email address — but you already have one.\n\n` +
    `If this was you, just log in instead: ${loginLink} (use "Forgot password" if you don't remember it).\n\n` +
    `If it wasn't you, no action is needed — no account was created and your existing one is unaffected.\n\nCrix Technology Private Limited`;
  return deliver({ to, subject: "You already have a Crix Technology account", text, html });
}

// ---------- One-time code (OTP) ----------
// purpose: "reset_password" (forgot-password) | "view_password" (profile).
async function sendOtpEmail({ to, name, code, purpose, ttlMinutes }) {
  const isReset = purpose === "reset_password";
  const what = isReset ? "reset your password" : "view your account password";
  const subject = isReset ? "Your Crix Technology password reset code" : "Your Crix Technology verification code";
  const safeName = escapeHtml(name || "there");
  const html = layout(`
      <h2 style="color:#0f1f3d;margin-bottom:4px">Hi ${safeName},</h2>
      <p>Use this code to ${what}:</p>
      <p style="font-size:30px;letter-spacing:8px;font-weight:700;color:#0f1f3d;margin:18px 0">${escapeHtml(code)}</p>
      <p>It expires in ${ttlMinutes} minutes and can be used once. Never share it with anyone — Crix Technology will never ask you for it.</p>
      <p>If you didn't ask for this, you can ignore this email; your password hasn't changed.</p>`);
  const text =
    `Hi ${name || "there"},\n\nUse this code to ${what}: ${code}\n\n` +
    `It expires in ${ttlMinutes} minutes and can be used once. Never share it with anyone — Crix Technology will never ask you for it.\n` +
    `If you didn't ask for this, you can ignore this email; your password hasn't changed.\n\nCrix Technology Private Limited`;
  return deliver({ to, subject, text, html });
}

// Heads-up after a password reset/change, so an account owner notices if it
// wasn't them.
async function sendPasswordChangedEmail({ to, name }) {
  const safeName = escapeHtml(name || "there");
  const html = layout(`
      <h2 style="color:#0f1f3d;margin-bottom:4px">Hi ${safeName},</h2>
      <p>The password on your Crix Technology account was just changed.</p>
      <p>If that was you, there's nothing more to do. If it wasn't, reset your password right away using
      "Forgot password" on the login form at <a href="${siteOrigin()}">${siteOrigin()}</a> and contact us.</p>`);
  const text =
    `Hi ${name || "there"},\n\nThe password on your Crix Technology account was just changed.\n\n` +
    `If that was you, there's nothing more to do. If it wasn't, reset your password right away using "Forgot password" on the login form at ${siteOrigin()} and contact us.\n\nCrix Technology Private Limited`;
  return deliver({ to, subject: "Your Crix Technology password was changed", text, html });
}

// ---------- payment request from the admin ----------
// Sent when an admin asks a student to pay for a course/internship
// (routes/paymentRequests.js). Best-effort: the request is on their dashboard
// whether or not this arrives.
async function sendPaymentRequestEmail({ to, name, itemTitle, itemType, tier, amount, note }) {
  if (!to) return { sent: false, reason: "No email" };
  const kindLabel = itemType === "internship" ? "internship" : "course";
  const planLabel = tierLabel(tier);
  const planText = planLabel ? ` (${planLabel} plan)` : "";
  const link = `${siteOrigin()}/dashboard`;
  const html = layout(`
      <h2 style="color:#0f1f3d;margin-bottom:4px">Hi ${escapeHtml(name || "there")},</h2>
      <p>Crix Technology has sent you a payment request for the ${kindLabel} <strong>${escapeHtml(itemTitle || "")}</strong>${escapeHtml(planText)}.</p>
      <p>Amount: <strong>${fmtRupees(amount)}</strong></p>
      ${note ? `<p>Note: ${escapeHtml(note)}</p>` : ""}
      <p>Log in and open My Dashboard to pay — you'll get access as soon as the payment goes through:
      <a href="${link}">${link}</a></p>`);
  const text =
    `Hi ${name || "there"},

Crix Technology has sent you a payment request for the ${kindLabel} ${itemTitle || ""}${planText}.
` +
    `Amount: ${fmtRupees(amount)}
${note ? `Note: ${note}
` : ""}
` +
    `Log in and open My Dashboard to pay — you'll get access as soon as the payment goes through: ${link}

Crix Technology Private Limited`;
  return deliver({ to, subject: `Payment request — ${itemTitle || "Crix Technology"}`, text, html });
}

module.exports = {
  sendContactEmail,
  sendApplicationEmail,
  sendReceiptEmail,
  sendAccountExistsEmail,
  sendOtpEmail,
  sendPasswordChangedEmail,
  sendPaymentRequestEmail,
};
