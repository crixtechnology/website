const nodemailer = require("nodemailer");

// Both notification functions below interpolate a caller-supplied string
// (interest / refTitle) into an HTML email body. Both POST /contact and
// POST /applications are public, unauthenticated endpoints that accept any
// string for these fields — nothing upstream constrains them to the
// frontend's own dropdown/fixed values — so this escape is the only thing
// standing between a crafted submission and markup/script running in
// whatever mail client renders the admin's notification.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Without these, a bad host/port/credential doesn't fail — it hangs.
    // Node's default TCP connect timeout can run well past a minute, and a
    // stuck SMTP handshake holds the whole POST /contact (or /applications)
    // request open the entire time, since sendContactEmail is awaited
    // before the response goes out. Both callers already treat a failed
    // send as best-effort (the submission is saved beforehand either way),
    // so failing fast here costs nothing and turns "visitor's form spins
    // for two minutes" into "visitor gets their success response on time,
    // admin just doesn't get an email this once."
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  return transporter;
}

// Points the "check the admin panel" link at the actual site instead of a
// bare path — CLIENT_ORIGIN already holds the deployed frontend URL(s) for
// CORS (see index.js), so it doubles as the base here. Falls back to a
// relative path (still useful pasted into a browser that's already on the
// site) if it's unset.
function adminLink(path) {
  const base = (process.env.CLIENT_ORIGIN || "").split(",")[0].trim();
  return base && base !== "*" ? `${base}${path}` : path;
}

// Deliberately a bare "something came in" ping, not the submission itself —
// name/email/phone/company/message/college never leave the server by email.
// The admin panel (already the source of truth for every submission) is
// where the actual content gets read. Returns { sent: boolean } instead of
// throwing when SMTP isn't configured yet, so the form still "works" (logs
// to console) during local/test setup before real SMTP creds are added.
async function sendContactEmail({ interest }) {
  const to = process.env.CONTACT_TO_EMAIL || "support@crixtechnology.com";
  const t = getTransporter();
  const link = adminLink("/admin/messages");
  if (!t) {
    console.log("[mailer] SMTP not configured — logging instead of sending: new contact message", interest ? `(interested in: ${interest})` : "");
    return { sent: false };
  }
  await t.sendMail({
    from: `"Crix Technology Website" <${process.env.SMTP_USER}>`,
    to,
    subject: `New contact form message${interest ? ` — ${interest}` : ""}`,
    text: `A new contact form message was received${interest ? ` (interested in: ${interest})` : ""}.\n\nLog in to the admin panel to view it: ${link}`,
    html: `<p>A new contact form message was received${interest ? ` (interested in: <b>${escapeHtml(interest)}</b>)` : ""}.</p><p><a href="${link}">Log in to the admin panel to view it</a></p>`,
  });
  return { sent: true };
}

// Same bare-ping shape as sendContactEmail, for a new internship/course
// application (Apply / Inquire to enroll / Buy-now) — the row is already
// persisted by the time this runs, so a delivery failure here just means a
// missed notification, not a lost inquiry. refTitle/type name the program,
// not the applicant, so they're fine to include.
async function sendApplicationEmail({ type, refTitle }) {
  const to = process.env.CONTACT_TO_EMAIL || "support@crixtechnology.com";
  const t = getTransporter();
  const label = type === "internship" ? "Internship application" : "Course inquiry";
  const link = adminLink("/admin/applications");
  if (!t) {
    console.log("[mailer] SMTP not configured — logging instead of sending:", `new ${label} for ${refTitle}`);
    return { sent: false };
  }
  await t.sendMail({
    from: `"Crix Technology Website" <${process.env.SMTP_USER}>`,
    to,
    subject: `New ${label} — ${refTitle}`,
    text: `A new ${label} was received for "${refTitle}".\n\nLog in to the admin panel to view it: ${link}`,
    html: `<p>A new ${label} was received for "<b>${escapeHtml(refTitle)}</b>".</p><p><a href="${link}">Log in to the admin panel to view it</a></p>`,
  });
  return { sent: true };
}

module.exports = { sendContactEmail, sendApplicationEmail };
