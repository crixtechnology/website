const nodemailer = require("nodemailer");

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
  });
  return transporter;
}

// Sends the contact form to CONTACT_TO_EMAIL. Returns { sent: boolean } instead
// of throwing when SMTP isn't configured yet, so the form still "works" (logs
// to console) during local/test setup before real SMTP creds are added.
async function sendContactEmail({ name, email, interest, message }) {
  const to = process.env.CONTACT_TO_EMAIL || "support@crixtechnology.com";
  const t = getTransporter();
  if (!t) {
    console.log("[mailer] SMTP not configured — logging instead of sending:", { name, email, interest, message });
    return { sent: false };
  }
  await t.sendMail({
    from: `"Crix Technology Website" <${process.env.SMTP_USER}>`,
    to,
    replyTo: email,
    subject: `New contact form message — ${interest || "General"}`,
    text: `Name: ${name}\nEmail: ${email}\nInterested in: ${interest}\n\n${message}`,
    html: `<p><b>Name:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Interested in:</b> ${interest}</p><p>${String(message).replace(/\n/g, "<br/>")}</p>`,
  });
  return { sent: true };
}

// Sends a new internship/course application (Apply / Inquire to enroll /
// Buy-now) to CONTACT_TO_EMAIL, same best-effort shape as sendContactEmail —
// the row is already persisted by the time this runs, so a delivery failure
// here just means a missed notification, not a lost inquiry.
async function sendApplicationEmail({ type, refTitle, name, email, phone, college }) {
  const to = process.env.CONTACT_TO_EMAIL || "support@crixtechnology.com";
  const t = getTransporter();
  const label = type === "internship" ? "Internship application" : "Course inquiry";
  if (!t) {
    console.log("[mailer] SMTP not configured — logging instead of sending:", { type, refTitle, name, email, phone, college });
    return { sent: false };
  }
  await t.sendMail({
    from: `"Crix Technology Website" <${process.env.SMTP_USER}>`,
    to,
    replyTo: email,
    subject: `${label} — ${refTitle}`,
    text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nCollege: ${college || "—"}\nFor: ${refTitle} (${type})`,
    html: `<p><b>Name:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Phone:</b> ${phone}</p><p><b>College:</b> ${college || "—"}</p><p><b>For:</b> ${refTitle} (${type})</p>`,
  });
  return { sent: true };
}

module.exports = { sendContactEmail, sendApplicationEmail };
