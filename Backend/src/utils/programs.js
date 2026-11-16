// Courses were dropped: the only programs the site offers are Training +
// Internship tracks — Course rows of type "internship" (they keep the live
// classes and recorded lectures). Rows of the old "course" type stay in the
// database untouched but are treated as not existing anywhere: not listed,
// not bought, not opened, and no new ones can be made.
const PROGRAM_TYPE = "internship";
const PROGRAM_WHERE = { type: PROGRAM_TYPE };
const isProgram = (course) => !!course && course.type === PROGRAM_TYPE;
const COURSES_DROPPED = "Courses are no longer offered — only Training + Internship tracks.";

// A program's name with its length ("MERN Stack Developer — 3 months"). One
// domain is sold in 1 / 2 / 3 / 6 month versions under the same title, so a
// receipt or an admin list showing the bare title can't tell them apart. Same
// as programTitle() in Frontend/src/hooks/usePageMeta.js.
const DURATION_NAMES = { 15: "15 days", 30: "1 month", 60: "2 months", 90: "3 months", 180: "6 months" };
function programTitle(course) {
  if (!course || !course.title) return "";
  const n = Number(course.durationDays);
  if (!Number.isFinite(n) || n <= 0) return course.title;
  const length = DURATION_NAMES[n] || `${n} ${n === 1 ? "day" : "days"}`;
  const already = new RegExp(`\\b(${String(n / 30)}[\\s-]*months?|${n}[\\s-]*days?)\\b`, "i");
  return already.test(course.title) ? course.title : `${course.title} — ${length}`;
}

module.exports = { PROGRAM_TYPE, PROGRAM_WHERE, isProgram, COURSES_DROPPED, programTitle };
