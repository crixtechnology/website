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
const { COMPANY } = require("./companyInfo");

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
  // The test suite submits real applications/contact messages; those must
  // never turn into real notifications in the support inbox.
  if (process.env.NODE_ENV === "test") return { sent: false, reason: "test run" };
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

// Points the "check the admin panel" link at the admin panel, which is its own
// deployment (ADMIN_ORIGIN, e.g. https://crix-admin.vercel.app) and no longer
// lives on the public site. Falls back to the site's origin only so a missing
// variable still yields a well-formed URL.
function adminLink(path) {
  const origin = (process.env.ADMIN_ORIGIN || "").trim().replace(/\/+$/, "");
  return `${origin || siteOrigin()}${path}`;
}

// The "something came in" ping to the site owner. With BREVO_API_KEY set it
// goes through Brevo in the same design as every other email; otherwise
// through formsubmit.co (plain style, needs its one-time inbox confirmation).
// Deliberately only a ping, not the submission itself — name/email/phone/
// company/message/college never leave the server by email. The admin panel
// (already the source of truth for every submission) is where it's read.
async function notifyOwner({ path, subject, title, summaryHtml, summaryText, link, linkLabel }) {
  if (process.env.NODE_ENV === "test") return { sent: false, reason: "test run" };
  if (brevoApiKey()) {
    const html = layout({
      preheader: subject,
      title,
      content: paragraph(summaryHtml) + button(linkLabel, link) +
        paragraph("Details stay in the admin panel — they aren't included in this email.", `font-size:13px;color:${BRAND.muted}`),
    });
    return deliver({ to: process.env.CONTACT_TO_EMAIL || "support@crixtechnology.com", subject, text: `${summaryText}

${linkLabel}: ${link}`, html });
  }
  // formsubmit.co drops these into its own HTML template, so the parts that
  // came from a visitor's form (interest, program title) are escaped first.
  return sendViaFormSubmit({ path, subject: escapeHtml(subject), text: `${escapeHtml(summaryText)} Log in to the admin panel to view it: ${link}` });
}

async function sendContactEmail({ interest }) {
  const link = adminLink("/admin/messages");
  const plainInterest = interest ? String(interest) : "";
  return notifyOwner({
    path: "/contact",
    subject: `New contact form message${plainInterest ? ` — ${plainInterest}` : ""}`,
    title: "New contact form message",
    summaryHtml: `Someone just sent a message through the contact form${plainInterest ? ` (interested in: <strong>${escapeHtml(plainInterest)}</strong>)` : ""}.`,
    summaryText: `A new contact form message was received${plainInterest ? ` (interested in: ${plainInterest})` : ""}.`,
    link,
    linkLabel: "Open messages",
  });
}

// Same ping, for a new internship/course application (Apply / Inquire to
// enroll / Buy-now) — the row is already saved by the time this runs, so a
// delivery failure here just means a missed notification, not a lost inquiry.
// refTitle names the program, not the applicant (it's free text from POST
// /applications, so it's escaped wherever it goes into HTML).
async function sendApplicationEmail({ type, refTitle }) {
  const label = type === "internship" ? "Internship application" : "Course inquiry";
  const link = adminLink("/admin/applications");
  const title = String(refTitle || "");
  return notifyOwner({
    path: "/programs",
    subject: `New ${label} — ${title}`,
    title: `New ${label.toLowerCase()}`,
    summaryHtml: `A new ${label.toLowerCase()} just came in for <strong>${escapeHtml(title)}</strong>.`,
    summaryText: `A new ${label} was received for "${title}".`,
    link,
    linkLabel: "Open applications",
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
    from: process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.RECEIPT_FROM_EMAIL || DEFAULT_FROM,
  };
}

// ---------- Brevo's HTTP API (preferred) ----------
// Render's free tier drops outbound SMTP, but an HTTPS request to Brevo's API
// goes out like any other API call (Razorpay, Google), so with BREVO_API_KEY
// set every customer email goes this way instead of SMTP.
//
// It connected fine the first time it was tried here (see .env.example); what
// failed was the SENDER — a plain @gmail.com address, which Gmail/Yahoo/
// Outlook reject when sent by another service (DMARC). The sender must be on a
// domain authenticated in Brevo (Senders, Domains & Dedicated IPs → Domains:
// its DKIM/DMARC DNS records added), and itself added as a sender.
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_FROM = "Crix Technology <support@crixtechnology.com>";

function brevoApiKey() {
  const key = process.env.BREVO_API_KEY;
  return looksUnset(key) ? null : key;
}

// "Crix Technology <support@crixtechnology.com>" -> { name, email }.
function parseFrom(value) {
  const m = /^\s*(.*?)\s*<\s*([^>\s]+)\s*>\s*$/.exec(value || "");
  if (m) return { name: m[1].replace(/^"|"$/g, "") || undefined, email: m[2] };
  return { email: String(value || "").trim() };
}

async function sendViaBrevoApi(apiKey, { to, subject, text, html, attachments }) {
  const sender = parseFrom(process.env.MAIL_FROM || DEFAULT_FROM);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        textContent: text,
        ...(html ? { htmlContent: html } : {}),
        // nodemailer-style { filename, content: Buffer } -> Brevo's base64 form.
        ...(attachments && attachments.length
          ? { attachment: attachments.map((a) => ({ name: a.filename, content: Buffer.from(a.content).toString("base64") })) }
          : {}),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => ({}));
  return { sent: true, id: data.messageId };
}

if (!brevoApiKey() && !smtpConfig()) {
  console.warn(
    "⚠ Neither BREVO_API_KEY nor SMTP_HOST is set in Backend/.env — receipt emails, password OTP emails and account notices " +
    "will not be sent (the in-app \"Download Receipt\" button still works). Set BREVO_API_KEY (works on Render's free tier)."
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

// Returns { sent: true, id } | { sent: false, reason }. Throws only when a
// sender (Brevo or SMTP) IS configured and the send itself fails (bad key,
// unverified sender, host unreachable…) — callers decide whether that's fatal
// (OTP request: yes) or just logged (receipt: it must never undo a payment).
async function deliver({ to, subject, text, html, attachments }) {
  const apiKey = brevoApiKey();
  if (apiKey) return sendViaBrevoApi(apiKey, { to, subject, text, html, attachments });

  const cfg = smtpConfig();
  if (!cfg) {
    if (process.env.MAIL_DEV_LOG === "true") {
      console.log(`[mail:dev] Email not configured — would send:\n  To: ${to}\n  Subject: ${subject}\n  ${String(text).replace(/\n/g, "\n  ")}`);
      return { sent: false, dev: true, reason: "Email not configured (logged to console)" };
    }
    return { sent: false, reason: "Email not configured" };
  }
  const info = await getTransporter(cfg).sendMail({ from: cfg.from, to, subject, text, html, attachments });
  return { sent: true, id: info.messageId };
}

function fmtRupees(n) {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// ---------- Email design ----------
// One branded frame for every customer email: logo, a teal accent bar, a white
// card, one clear call-to-action button and a helpful footer. Built from
// tables with inline styles — the only layout Gmail, Outlook and phone mail
// apps all render the same way.
const BRAND = {
  ink: "#0f1f3d",
  text: "#334155",
  muted: "#64748b",
  teal: "#0d9488",
  tealBright: "#14c9c9",
  tint: "#ecfeff",
  tintBorder: "#a5f3fc",
  page: "#eef2f7",
  line: "#e2e8f0",
  font: "'Segoe UI',Helvetica,Arial,sans-serif",
};
const SOCIAL = {
  linkedin: "https://www.linkedin.com/company/crix-technology/",
  instagram: "https://www.instagram.com/crix_technology",
};

function logoUrl() {
  return `${siteOrigin()}/crix-logo.png`;
}

function paragraph(html, extra = "") {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.text};${extra}">${html}</p>`;
}

// A "bulletproof" button: a table cell with a background, so it still looks
// like a button where mail apps ignore padding on links (Outlook).
function button(label, url) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
      <tr><td align="center" bgcolor="${BRAND.teal}" style="border-radius:10px;background:${BRAND.teal}">
        <a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${BRAND.font};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(label)}</a>
      </td></tr>
    </table>`;
}

// Label / value rows in a tinted box — order details, a request's details.
function detailsBox(rows) {
  const body = rows
    .filter(([, value]) => value)
    .map(([label, value, strong], i) => `
      <tr>
        <td style="padding:10px 0;${i ? `border-top:1px solid ${BRAND.tintBorder};` : ""}font-size:13px;color:${BRAND.muted};width:42%;vertical-align:top">${escapeHtml(label)}</td>
        <td style="padding:10px 0;${i ? `border-top:1px solid ${BRAND.tintBorder};` : ""}font-size:${strong ? "17px" : "14px"};font-weight:${strong ? 700 : 600};color:${strong ? BRAND.teal : BRAND.ink};text-align:right">${value}</td>
      </tr>`)
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;background:${BRAND.tint};border:1px solid ${BRAND.tintBorder};border-radius:12px">
      <tr><td style="padding:6px 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${BRAND.font}">${body}</table>
      </td></tr>
    </table>`;
}

function codeBox(code, caption) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px">
      <tr><td align="center" style="background:${BRAND.tint};border:1px solid ${BRAND.tintBorder};border-radius:12px;padding:22px 12px">
        <div style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${BRAND.ink}">${escapeHtml(code)}</div>
        <div style="margin-top:8px;font-family:${BRAND.font};font-size:13px;color:${BRAND.muted}">${caption}</div>
      </td></tr>
    </table>`;
}

function noteBox(html) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
      <tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 18px;font-family:${BRAND.font};font-size:14px;line-height:1.6;color:#9a3412">${html}</td></tr>
    </table>`;
}

// `preheader` is the grey preview line most inboxes show after the subject.
function layout({ preheader = "", title, content }) {
  const site = siteOrigin();
  const siteLabel = site.replace(/^https?:\/\//, "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.page}" style="background:${BRAND.page}">
    <tr><td align="center" style="padding:28px 12px 32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${BRAND.font}">
        <tr><td align="center" style="padding:0 0 20px">
          <a href="${site}" target="_blank"><img src="${logoUrl()}" width="150" alt="Crix Technology" style="display:block;width:150px;max-width:150px;height:auto;border:0"></a>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td height="6" bgcolor="${BRAND.tealBright}" style="height:6px;line-height:6px;font-size:0;background:${BRAND.tealBright};background-image:linear-gradient(90deg,${BRAND.tealBright},${BRAND.teal},#1e3a8a)">&nbsp;</td></tr>
            <tr><td style="padding:34px 36px 14px">
              <h1 style="margin:0 0 18px;font-size:23px;line-height:1.3;font-weight:700;color:${BRAND.ink}">${escapeHtml(title)}</h1>
              ${content}
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:24px 16px 0;font-size:13px;line-height:1.7;color:${BRAND.muted}">
          Questions? Just reply to this email, or WhatsApp us at
          <a href="https://wa.me/${COMPANY.phone.replace(/\D/g, "")}" style="color:${BRAND.teal};text-decoration:none;font-weight:600">${COMPANY.phone}</a>.
        </td></tr>
        <tr><td align="center" style="padding:12px 16px 0;font-size:13px;color:${BRAND.muted}">
          <a href="${site}" style="color:${BRAND.teal};text-decoration:none;font-weight:600">${escapeHtml(siteLabel)}</a>
          &nbsp;·&nbsp;
          <a href="${SOCIAL.linkedin}" style="color:${BRAND.teal};text-decoration:none;font-weight:600">LinkedIn</a>
          &nbsp;·&nbsp;
          <a href="${SOCIAL.instagram}" style="color:${BRAND.teal};text-decoration:none;font-weight:600">Instagram</a>
        </td></tr>
        <tr><td align="center" style="padding:14px 16px 0;font-size:11px;line-height:1.6;color:#94a3b8">
          ${escapeHtml(COMPANY.legalName)}<br>${escapeHtml(COMPANY.registeredAddress)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const TEXT_SIGNOFF = `\n\nQuestions? Reply to this email or WhatsApp us at ${COMPANY.phone}.\nCrix Technology Private Limited`;

// Best-effort, like the notification senders above — a delivery failure (or
// email simply not being set up yet) must never break the payment flow that
// calls this. Caller (routes/payments.js's attachReceipt) already wraps this in
// try/catch and only logs. Covers courses AND internships (receipt.itemType).
async function sendReceiptEmail({ receipt, pdfBuffer }) {
  if (!receipt.buyerEmail) return { sent: false, reason: "No buyer email on this receipt" };

  const name = receipt.buyerName || "there";
  const title = receipt.itemTitle || "your purchase";
  const kindLabel = receipt.itemType === "internship" ? "Internship" : "Course";
  const planLabel = tierLabel(receipt.tier);
  const isUpgrade = !!receipt.fromTier && !!planLabel;
  const planValue = planLabel ? (isUpgrade ? `${tierLabel(receipt.fromTier)} → ${planLabel}` : planLabel) : "";
  const dashboard = `${siteOrigin()}/dashboard`;

  const html = layout({
    preheader: `Payment confirmed — ${title}. Receipt ${receipt.receiptNumber} is attached.`,
    title: isUpgrade ? "Your plan is upgraded" : "Payment confirmed",
    content:
      paragraph(`Hi ${escapeHtml(name)}, thank you${isUpgrade ? " for upgrading" : " for your purchase"}! You're all set — here are your details.`) +
      detailsBox([
        [kindLabel, escapeHtml(title)],
        [isUpgrade ? "Plan" : "Plan", escapeHtml(planValue)],
        ["Receipt no.", escapeHtml(receipt.receiptNumber)],
        ["Amount paid", fmtRupees(receipt.totalPaid), true],
      ]) +
      paragraph("Your receipt is attached to this email as a PDF.") +
      button("Go to My Dashboard", dashboard) +
      paragraph("You can download your receipt again any time from My Dashboard.", `font-size:13px;color:${BRAND.muted}`),
  });
  const text =
    `Hi ${name}, thank you${isUpgrade ? " for upgrading" : " for your purchase"}!\n\n` +
    `${kindLabel}: ${title}\n${planValue ? `Plan: ${planValue}\n` : ""}Receipt no.: ${receipt.receiptNumber}\nAmount paid: ${fmtRupees(receipt.totalPaid)}\n\n` +
    `Your receipt is attached as a PDF. You can also download it any time from My Dashboard: ${dashboard}` + TEXT_SIGNOFF;

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
  const loginLink = siteOrigin();
  const html = layout({
    preheader: "Someone tried to sign up with this email — you already have an account.",
    title: "You already have an account",
    content:
      paragraph(`Hi ${escapeHtml(name || "there")}, someone just tried to create a Crix Technology account with this email address — but you already have one.`) +
      paragraph("If this was you, just log in instead. Forgot your password? Use <strong>Forgot password</strong> on the login form.") +
      button("Log in to Crix Technology", loginLink) +
      paragraph("If it wasn't you, no action is needed — no new account was created and yours is unaffected.", `font-size:13px;color:${BRAND.muted}`),
  });
  const text =
    `Hi ${name || "there"},\n\nSomeone just tried to create a Crix Technology account with this email address — but you already have one.\n\n` +
    `If this was you, just log in instead: ${loginLink} (use "Forgot password" if you don't remember it).\n\n` +
    `If it wasn't you, no action is needed — no account was created and your existing one is unaffected.` + TEXT_SIGNOFF;
  return deliver({ to, subject: "You already have a Crix Technology account", text, html });
}

// ---------- One-time code (OTP) ----------
// purpose: "reset_password" (forgot-password) | "view_password" (profile).
async function sendOtpEmail({ to, name, code, purpose, ttlMinutes }) {
  const isReset = purpose === "reset_password";
  const what = isReset ? "reset your password" : "view your account password";
  const subject = isReset ? "Your Crix Technology password reset code" : "Your Crix Technology verification code";
  const html = layout({
    preheader: `Your code is ${code}. It expires in ${ttlMinutes} minutes.`,
    title: isReset ? "Reset your password" : "Your verification code",
    content:
      paragraph(`Hi ${escapeHtml(name || "there")}, use this code to ${what}:`) +
      codeBox(code, `Expires in ${ttlMinutes} minutes · can be used once`) +
      paragraph("Never share this code with anyone — Crix Technology will never ask you for it.") +
      paragraph(`If you didn't ask for this, you can ignore this email; ${isReset ? "your password hasn't changed" : "nothing has changed"}.`, `font-size:13px;color:${BRAND.muted}`),
  });
  const text =
    `Hi ${name || "there"},\n\nUse this code to ${what}: ${code}\n\n` +
    `It expires in ${ttlMinutes} minutes and can be used once. Never share it with anyone — Crix Technology will never ask you for it.\n` +
    `If you didn't ask for this, you can ignore this email; your password hasn't changed.` + TEXT_SIGNOFF;
  return deliver({ to, subject, text, html });
}

// Heads-up after a password reset/change, so an account owner notices if it
// wasn't them.
async function sendPasswordChangedEmail({ to, name }) {
  const site = siteOrigin();
  const html = layout({
    preheader: "The password on your Crix Technology account was just changed.",
    title: "Your password was changed",
    content:
      paragraph(`Hi ${escapeHtml(name || "there")}, the password on your Crix Technology account was just changed.`) +
      paragraph("If that was you, there's nothing more to do — you're all set.") +
      noteBox(`<strong>Wasn't you?</strong> Reset your password right away using <strong>Forgot password</strong> on the login form, and contact us so we can help secure your account.`) +
      button("Go to Crix Technology", site),
  });
  const text =
    `Hi ${name || "there"},\n\nThe password on your Crix Technology account was just changed.\n\n` +
    `If that was you, there's nothing more to do. If it wasn't, reset your password right away using "Forgot password" on the login form at ${site} and contact us.` + TEXT_SIGNOFF;
  return deliver({ to, subject: "Your Crix Technology password was changed", text, html });
}

// ---------- payment request from the admin ----------
// Sent when an admin asks a student to pay for a course/internship
// (routes/paymentRequests.js). Best-effort: the request is on their dashboard
// whether or not this arrives.
async function sendPaymentRequestEmail({ to, name, itemTitle, itemType, tier, amount, note }) {
  if (!to) return { sent: false, reason: "No email" };
  const kindLabel = itemType === "internship" ? "Internship" : "Course";
  const planLabel = tierLabel(tier);
  const link = `${siteOrigin()}/dashboard`;
  const html = layout({
    preheader: `Payment request: ${itemTitle || "Crix Technology"} — ${fmtRupees(amount)}.`,
    title: "You have a payment request",
    content:
      paragraph(`Hi ${escapeHtml(name || "there")}, Crix Technology has sent you a payment request.`) +
      detailsBox([
        [kindLabel, escapeHtml(itemTitle || "")],
        ["Plan", escapeHtml(planLabel)],
        ["Note", note ? escapeHtml(note) : ""],
        ["Amount", fmtRupees(amount), true],
      ]) +
      button("Pay now", link) +
      paragraph("Log in and open My Dashboard to pay. You get access as soon as the payment goes through, and your receipt is emailed to you.", `font-size:13px;color:${BRAND.muted}`),
  });
  const text =
    `Hi ${name || "there"},\n\nCrix Technology has sent you a payment request.\n\n` +
    `${kindLabel}: ${itemTitle || ""}\n${planLabel ? `Plan: ${planLabel}\n` : ""}${note ? `Note: ${note}\n` : ""}Amount: ${fmtRupees(amount)}\n\n` +
    `Log in and open My Dashboard to pay — you'll get access as soon as the payment goes through: ${link}` + TEXT_SIGNOFF;
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
