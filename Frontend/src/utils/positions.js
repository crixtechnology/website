import { formatDuration } from "./duration.js";

// How many places a role or training track has, from the backend:
// { total, filled, left }, or null when it doesn't state a number. Careers
// roles are filled by selected applicants; training tracks by purchases.

export const isFull = (item) => !!(item && item.positions && item.positions.left === 0);

// Every program is a Training + Internship track, so a place is always a "position".
export const placeWord = () => "position";

export function positionsLabel(p, word = "position") {
  if (!p) return "";
  if (p.left === 0) return "All filled";
  const n = (k) => `${k} ${word}${k === 1 ? "" : "s"}`;
  return p.filled > 0 ? `${p.left} of ${n(p.total)} open` : `${n(p.total)} open`;
}

// The small tag on a card: urgency when few are left, "filled" when none.
export function positionsTag(p, fallback, word = "position") {
  if (!p) return fallback;
  if (p.left === 0) return "Positions filled";
  if (p.left <= 2 && p.total > 2) return `Only ${p.left} left`;
  return fallback;
}

// The facts every program card and page shows, in one order for all three —
// Training + Internship tracks, Free Internship roles and Careers roles.
// Duration is a role's own text, or a track's length; Starts on is the admin's
// rough estimate (a role's startsOn, a track's startingFrom). Empty ones are left out.
// A stipend is always given on the basis of performance: say so beside the
// amount unless the admin's text already does (or there is no stipend).
export const stipendText = (s) => {
  const t = String(s || "").trim();
  if (!t || /performance|^no stipend/i.test(t)) return t;
  return `${t} (performance based)`;
};

// On a program whose opening months are training with no stipend
// (item.stipendTrainingMonths, set in Admin), which months pay and which don't:
// { paid: "months 3–6", training: "Months 1–2 · no stipend" }, or null when
// the stipend runs from month 1 (or there is none).
const monthSpan = (from, to) => (from === to ? `month ${from}` : `months ${from}–${to}`);
export function stipendSchedule(item) {
  const t = Number(item && item.stipendTrainingMonths) || 0;
  if (!item || !String(item.stipend || "").trim() || /^no stipend/i.test(item.stipend.trim()) || t < 1) return null;
  const months = Math.round(Number(item.durationDays) / 30);
  if (months > 0 && t >= months) return null; // no paid month left: not a valid schedule
  const training = monthSpan(1, t);
  return {
    paid: months > 0 ? monthSpan(t + 1, months) : `month ${t + 1} onwards`,
    training: `${training.charAt(0).toUpperCase()}${training.slice(1)} · no stipend`,
  };
}

// The Stipend line: the amount, which months it is paid for, and that it is
// performance based.
export function stipendFact(item) {
  const schedule = stipendSchedule(item);
  if (!schedule) return stipendText(item.stipend);
  const t = String(item.stipend).trim();
  const note = /performance/i.test(t) ? "" : " (performance based)";
  return `${t} for ${schedule.paid}${note}`;
}

// The stipend as a Training + Internship card or page draws it (StipendStrip
// in components/ui.jsx), or null when the program states no stipend at all:
//   { none: true }                                   "No Stipend"
//   { amount, per, months, trainingMonths }          e.g. "₹3,000 – ₹7,000", "month", 6, 3
// The admin's text is tidied for display: ₹3000 → ₹3,000, "3000 - 7000" → an
// en dash, a trailing "/ month" split off, and "(performance based)" dropped
// (the strip says it). months is null when the program has no length set.
const groupINR = (digits) => Number(digits).toLocaleString("en-IN");
export function stipendInfo(item) {
  const raw = String((item && item.stipend) || "").trim();
  if (!raw) return null;
  if (/^(no stipend|none|unpaid|nil)\.?$/i.test(raw)) return { none: true };
  let text = raw.replace(/\(?\s*performance[\s-]*based\s*\)?/i, "").trim();
  let per = "";
  const perMatch = text.match(/\s*\/\s*(month|mo|week|day)\.?$/i);
  if (perMatch) {
    per = perMatch[1].toLowerCase() === "mo" ? "month" : perMatch[1].toLowerCase();
    text = text.slice(0, perMatch.index).trim();
  }
  text = text
    .replace(/(₹\s*)(\d{4,})/g, (_, sign, d) => `₹${groupINR(d)}`)
    .replace(/\s*-\s*(?=₹|\d)/g, " – ");
  const months = Math.round(Number(item.durationDays) / 30) || null;
  let trainingMonths = Number(item.stipendTrainingMonths) || 0;
  if (trainingMonths < 0 || (months && trainingMonths >= months)) trainingMonths = 0;
  return { amount: text, per, months, trainingMonths };
}

// `opts.stipendStrip`: the caller draws the stipend itself (StipendStrip), so
// the Stipend and Training period rows are left out of the facts.
export const programFacts = (item, opts = {}) => [
  ["Positions", positionsLabel(item.positions, placeWord(item))],
  ["Stipend", !opts.stipendStrip && stipendFact(item)],
  ["Training period", !opts.stipendStrip && stipendSchedule(item) && stipendSchedule(item).training],
  ["Experience", item.experience],
  ["Duration", item.duration || formatDuration(item.durationDays)],
  ["Mode", item.mode],
  // Training + Internship programs only (Admin's switch, on unless turned off).
  ["Lectures", item.liveRecordedLectures === true && "Live + Recorded available"],
  ["Starts on", item.startsOn || item.startingFrom],
  // Extras only some Training + Internship programs include (Admin switches).
  ["Also includes", [item.joiningKit && "Joining kit", item.linkedinRecognition && "LinkedIn recognition"].filter(Boolean).join(" · ")],
].filter(([, v]) => v);
