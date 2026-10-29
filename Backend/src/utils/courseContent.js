// Validates and cleans the richer-page content an admin can add to a course or internship:
//   outcomes       "What you'll learn"                    a list of short texts
//   audience       "Who it's for"                         a list of short texts
//   prerequisites  "What you need before you start"       a list of short texts
//   faqs           questions and answers                  a list of { q, a }
// and the details a free internship shows too:
//   skills, responsibilities, eligibility                 lists of short texts
//   stipend, experience, mode                             short texts
//   positions      how many places (null clears it)       a whole number 1–1000
//
// Used by routes/courses.js on create and update. Anything not sent is left out of the result,
// so an update that doesn't mention a list leaves it as it was; sending [] clears it.

const LIST_LIMITS = {
  outcomes: { label: "What you'll learn", max: 12, chars: 200 },
  audience: { label: "Who it's for", max: 8, chars: 200 },
  prerequisites: { label: "Prerequisites", max: 8, chars: 200 },
  skills: { label: "Skills", max: 30, chars: 80 },
  responsibilities: { label: "Responsibilities", max: 30, chars: 300 },
  eligibility: { label: "Eligibility", max: 30, chars: 300 },
};
const TEXT_FIELDS = { stipend: "Stipend", experience: "Experience", mode: "Mode" };
const FAQ_LIMITS = { max: 15, qChars: 200, aChars: 1500 };

const KEYS = [...Object.keys(LIST_LIMITS), "faqs", ...Object.keys(TEXT_FIELDS), "positions"];

// Returns { ok: true, data } — `data` holds only the lists that were sent, trimmed and with
// empty rows dropped — or { ok: false, error } with a message written for the admin.
function parseCourseContent(body) {
  const b = body || {};
  const data = {};

  for (const [key, { label, max, chars }] of Object.entries(LIST_LIMITS)) {
    if (b[key] === undefined) continue;
    if (!Array.isArray(b[key]) || b[key].some((v) => typeof v !== "string")) {
      return { ok: false, error: `${label} must be a list of short texts.` };
    }
    const items = b[key].map((v) => v.trim()).filter(Boolean);
    if (items.length > max) return { ok: false, error: `${label} can have at most ${max} items.` };
    if (items.some((v) => v.length > chars)) return { ok: false, error: `Each ${label} item can be at most ${chars} characters.` };
    data[key] = items;
  }

  for (const [key, label] of Object.entries(TEXT_FIELDS)) {
    if (b[key] === undefined) continue;
    if (typeof b[key] !== "string" || b[key].length > 190) return { ok: false, error: `${label} must be text (up to 190 characters).` };
    data[key] = b[key].trim();
  }

  if (b.positions !== undefined) {
    if (b.positions !== null && (!Number.isInteger(b.positions) || b.positions < 1 || b.positions > 1000)) {
      return { ok: false, error: "The number of positions must be a whole number from 1 to 1000." };
    }
    data.positions = b.positions;
  }

  if (b.faqs !== undefined) {
    if (!Array.isArray(b.faqs) || b.faqs.some((f) => !f || typeof f !== "object" || Array.isArray(f))) {
      return { ok: false, error: "FAQs must be a list of questions with answers." };
    }
    const rows = [];
    for (const f of b.faqs) {
      if ((f.q !== undefined && typeof f.q !== "string") || (f.a !== undefined && typeof f.a !== "string")) {
        return { ok: false, error: "Each FAQ needs a question and an answer, as text." };
      }
      const q = (f.q || "").trim();
      const a = (f.a || "").trim();
      if (!q && !a) continue; // a blank row the form left in
      if (!q || !a) return { ok: false, error: "Each FAQ needs both a question and an answer." };
      if (q.length > FAQ_LIMITS.qChars) return { ok: false, error: `A FAQ question can be at most ${FAQ_LIMITS.qChars} characters.` };
      if (a.length > FAQ_LIMITS.aChars) return { ok: false, error: `A FAQ answer can be at most ${FAQ_LIMITS.aChars} characters.` };
      rows.push({ q, a });
    }
    if (rows.length > FAQ_LIMITS.max) return { ok: false, error: `You can add at most ${FAQ_LIMITS.max} FAQs.` };
    data.faqs = rows;
  }

  return { ok: true, data };
}

module.exports = { parseCourseContent, CONTENT_KEYS: KEYS };
