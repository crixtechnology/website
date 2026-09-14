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
const FORMSUBMIT_URL = (to) => `https://formsubmit.co/ajax/${encodeURIComponent(to)}`;

// Both notification functions below build a subject/body that never
// includes name/email/phone/company/message/college — see the two
// functions themselves — so there's nothing here that needs HTML-escaping
// the way the Brevo/SMTP versions did.
async function sendViaFormSubmit({ subject, text }) {
  const to = process.env.CONTACT_TO_EMAIL || "support@crixtechnology.com";
  const res = await fetch(FORMSUBMIT_URL(to), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      _subject: subject,
      _template: "box",
      Notification: text,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !(data.success === "true" || data.success === true)) {
    throw new Error(`formsubmit.co error: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return { sent: true };
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
// where the actual content gets read.
async function sendContactEmail({ interest }) {
  const link = adminLink("/admin/messages");
  return sendViaFormSubmit({
    subject: `New contact form message${interest ? ` — ${interest}` : ""}`,
    text: `A new contact form message was received${interest ? ` (interested in: ${interest})` : ""}. Log in to the admin panel to view it: ${link}`,
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
  return sendViaFormSubmit({
    subject: `New ${label} — ${refTitle}`,
    text: `A new ${label} was received for "${refTitle}". Log in to the admin panel to view it: ${link}`,
  });
}

module.exports = { sendContactEmail, sendApplicationEmail };
