// How many places a role, internship or course has, from the backend:
// { total, filled, left }, or null when it doesn't state a number. Careers
// roles and free internships are filled by selected applicants; paid
// internships and courses by purchases. `word` is "position" or "seat".

export const isFull = (item) => !!(item && item.positions && item.positions.left === 0);

// What a course calls a place ("seat"); everything else says "position".
export const placeWord = (item) => (item && item.type === "course" ? "seat" : "position");

export function positionsLabel(p, word = "position") {
  if (!p) return "";
  if (p.left === 0) return "All filled";
  const n = (k) => `${k} ${word}${k === 1 ? "" : "s"}`;
  return p.filled > 0 ? `${p.left} of ${n(p.total)} open` : `${n(p.total)} open`;
}

// The small tag on a card: urgency when few are left, "filled" when none.
export function positionsTag(p, fallback, word = "position") {
  if (!p) return fallback;
  if (p.left === 0) return `${word === "seat" ? "Seats" : "Positions"} filled`;
  if (p.left <= 2 && p.total > 2) return `Only ${p.left} left`;
  return fallback;
}

// The facts a program card / page shows beside its description, in the same
// order as a free internship's. Empty ones are left out.
export const programFacts = (item) => [
  [placeWord(item) === "seat" ? "Seats" : "Positions", positionsLabel(item.positions, placeWord(item))],
  ["Stipend", item.stipend],
  ["Experience", item.experience],
  ["Mode", item.mode],
].filter(([, v]) => v);
