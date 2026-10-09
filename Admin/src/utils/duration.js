// How long a program runs, as people say it. Programs store a number of days; the
// common lengths read better as months. A "month" is a 30-day block (that is how the
// access end date is worked out on the server), so 30 / 90 / 180 days are 1 / 3 / 6
// months. Any other number stays as days.
const NAMED = { 15: "15 days", 30: "1 month", 90: "3 months", 180: "6 months" };

export function formatDuration(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return "";
  return NAMED[n] || `${n} ${n === 1 ? "day" : "days"}`;
}

// The only lengths an internship can have (mirrors Backend/src/utils/internshipDurations.js).
export const INTERNSHIP_DURATIONS = [15, 30, 90, 180];
