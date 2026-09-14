// Sends notification emails via Brevo's transactional-email HTTP API rather
// than raw SMTP. This isn't a style preference — SMTP genuinely does not
// work from this backend's Render plan: outbound TCP on non-HTTP(S) ports
// (587/465) gets silently dropped rather than rejected, which is why every
// SMTP provider tried (Gmail, then Brevo's own SMTP relay) hung for the
// full connection timeout regardless of credentials. A plain HTTPS POST to
// Brevo's API is indistinguishable, network-wise, from any other outbound
// API call this backend already makes successfully (Razorpay, Google), so
// it isn't subject to that restriction.
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

// Both notification functions below interpolate a caller-supplied string
// (interest / refTitle) into the HTML body. Both POST /contact and
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

// Points the "check the admin panel" link at the actual site instead of a
// bare path — CLIENT_ORIGIN already holds the deployed frontend URL(s) for
// CORS (see index.js), so it doubles as the base here. Falls back to a
// relative path (still useful pasted into a browser that's already on the
// site) if it's unset.
function adminLink(path) {
  const base = (process.env.CLIENT_ORIGIN || "").split(",")[0].trim();
  return base && base !== "*" ? `${base}${path}` : path;
}

// Returns { sent: boolean } instead of throwing when BREVO_API_KEY isn't
// configured yet, so the form still "works" (logs to console) during
// local/test setup before real credentials are added — same shape the old
// SMTP-based version had.
async function sendViaBrevo({ subject, text, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL || "support@crixtechnology.com";
  if (!apiKey) {
    console.log("[mailer] BREVO_API_KEY not configured — logging instead of sending:", subject);
    return { sent: false };
  }
  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      // Must be a verified sender in Brevo's dashboard (Senders, Domains &
      // Dedicated IPs → Senders) or the API rejects the send outright.
      sender: { name: "Crix Technology Website", email: process.env.BREVO_SENDER_EMAIL || "crixtechnology@gmail.com" },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API error ${res.status}: ${body.slice(0, 300)}`);
  }
  return { sent: true };
}

// Deliberately a bare "something came in" ping, not the submission itself —
// name/email/phone/company/message/college never leave the server by email.
// The admin panel (already the source of truth for every submission) is
// where the actual content gets read.
async function sendContactEmail({ interest }) {
  const link = adminLink("/admin/messages");
  return sendViaBrevo({
    subject: `New contact form message${interest ? ` — ${interest}` : ""}`,
    text: `A new contact form message was received${interest ? ` (interested in: ${interest})` : ""}.\n\nLog in to the admin panel to view it: ${link}`,
    html: `<p>A new contact form message was received${interest ? ` (interested in: <b>${escapeHtml(interest)}</b>)` : ""}.</p><p><a href="${link}">Log in to the admin panel to view it</a></p>`,
  });
}

// Same bare-ping shape as sendContactEmail, for a new internship/course
// application (Apply / Inquire to enroll / Buy-now) — the row is already
// persisted by the time this runs, so a delivery failure here just means a
// missed notification, not a lost inquiry. refTitle/type name the program,
// not the applicant, so they're fine to include.
async function sendApplicationEmail({ type, refTitle }) {
  const label = type === "internship" ? "Internship application" : "Course inquiry";
  const link = adminLink("/admin/applications");
  return sendViaBrevo({
    subject: `New ${label} — ${refTitle}`,
    text: `A new ${label} was received for "${refTitle}".\n\nLog in to the admin panel to view it: ${link}`,
    html: `<p>A new ${label} was received for "<b>${escapeHtml(refTitle)}</b>".</p><p><a href="${link}">Log in to the admin panel to view it</a></p>`,
  });
}

module.exports = { sendContactEmail, sendApplicationEmail };
