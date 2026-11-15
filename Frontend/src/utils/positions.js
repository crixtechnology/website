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
export const programFacts = (item) => [
  ["Positions", positionsLabel(item.positions, placeWord(item))],
  ["Stipend", item.stipend],
  ["Experience", item.experience],
  ["Duration", item.duration || formatDuration(item.durationDays)],
  ["Mode", item.mode],
  ["Starts on", item.startsOn || item.startingFrom],
].filter(([, v]) => v);
