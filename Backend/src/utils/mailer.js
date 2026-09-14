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

// CLIENT_ORIGIN already holds the deployed frontend URL(s) for CORS (see
// index.js); reused here both for the admin-panel link below and as the
// Referer header formsubmit.co requires (see sendViaFormSubmit) — falls
// back to the real production URL if it's ever unset, since formsubmit.co
// specifically needs *some* real http(s) URL, not a relative path.
function siteOrigin() {
  const base = (process.env.CLIENT_ORIGIN || "").split(",")[0].trim();
  return base && base !== "*" ? base : "https://crixtechnology.in";
}

// Both notification functions below build a subject/body that never
// includes name/email/phone/company/message/college — see the two
// functions themselves — so there's nothing here that needs HTML-escaping
// the way the Brevo/SMTP versions did.
async function sendViaFormSubmit({ subject, text }) {
  const to = process.env.CONTACT_TO_EMAIL || "support@crixtechnology.com";
  const res = await fetch(FORMSUBMIT_URL(to), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      // formsubmit.co rejects any request with no Referer at all as "opened
      // as an HTML file" — it's built to be called from a browser on a real
      // page, not server-to-server, so this fakes that with our own site's
      // actual origin (a request genuinely made on that site's behalf).
      Referer: `${siteOrigin()}/contact`,
    },
    body: JSON.stringify({
      _subject: subject,
      _template: "box",
      Notification: text,
    }),
  });
  const bodyText = await res.text();
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    data = null;
  }
  if (!res.ok || !data || !(data.success === "true" || data.success === true)) {
    // Surfaces formsubmit.co's own message (e.g. "This form needs
    // Activation...") in the server log instead of an opaque "{}" — that
    // message is the actionable part while the form is still unconfirmed.
    throw new Error(`formsubmit.co error (status ${res.status}): ${(data && data.message) || bodyText.slice(0, 300)}`);
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
