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

export const programFacts = (item) => [
  ["Positions", positionsLabel(item.positions, placeWord(item))],
  ["Stipend", stipendFact(item)],
  ["Training period", stipendSchedule(item) && stipendSchedule(item).training],
  ["Experience", item.experience],
  ["Duration", item.duration || formatDuration(item.durationDays)],
  ["Mode", item.mode],
  ["Starts on", item.startsOn || item.startingFrom],
  // Extras only some Training + Internship programs include (Admin switches).
  ["Also includes", [item.joiningKit && "Joining kit", item.linkedinRecognition && "LinkedIn recognition"].filter(Boolean).join(" · ")],
].filter(([, v]) => v);
