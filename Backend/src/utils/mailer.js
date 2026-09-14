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

module.exports = { sendContactEmail, sendApplicationEmail };
