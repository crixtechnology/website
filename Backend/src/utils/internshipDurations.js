// The lengths a Training + Internship program can run for, in days: 1, 2, 3 or
// 6 months. A "month" here is a 30-day block, which is how the access end date
// is worked out (utils/enrollmentAccess.js adds this many days to the start
// date). These are also the filters on the site's Training + Internship page.
const INTERNSHIP_DURATION_DAYS = [30, 60, 90, 180];
const INTERNSHIP_DURATION_ERROR = "A program's duration must be 1, 2, 3 or 6 months.";

module.exports = { INTERNSHIP_DURATION_DAYS, INTERNSHIP_DURATION_ERROR };
