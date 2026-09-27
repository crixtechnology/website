// A course/internship's start date (Course.startsAt, set by the admin). Students
// can buy before it, but its content opens on that day. Dates are shown and
// entered in India time, matching the server (Backend routes/courses.js).

const IST = "Asia/Kolkata";

// Hasn't begun yet?
export function startsInFuture(course) {
  return !!(course && course.startsAt) && new Date(course.startsAt).getTime() > Date.now();
}

// "1 Nov 2026"
export function formatStartDate(date) {
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST });
}

// For <input type="date">: the India-time calendar date, "2026-11-01".
export function toStartDateInput(date) {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(date));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
