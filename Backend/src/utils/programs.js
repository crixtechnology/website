// Courses were dropped: the only programs the site offers are Training +
// Internship tracks — Course rows of type "internship" (they keep the live
// classes and recorded lectures). Rows of the old "course" type stay in the
// database untouched but are treated as not existing anywhere: not listed,
// not bought, not opened, and no new ones can be made.
const PROGRAM_TYPE = "internship";
const PROGRAM_WHERE = { type: PROGRAM_TYPE };
const isProgram = (course) => !!course && course.type === PROGRAM_TYPE;
const COURSES_DROPPED = "Courses are no longer offered — only Training + Internship tracks.";

module.exports = { PROGRAM_TYPE, PROGRAM_WHERE, isProgram, COURSES_DROPPED };
