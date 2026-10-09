// The lengths an internship can run for, in days: 15 days, 1 month, 3 months, 6 months.
// A "month" here is a 30-day block, which is how the access end date is worked out
// (utils/enrollmentAccess.js adds this many days to the start date).
//
// Courses are not limited to these; only internships are.
const INTERNSHIP_DURATION_DAYS = [15, 30, 90, 180];
const INTERNSHIP_DURATION_ERROR = "An internship's duration must be 15 days, 1 month, 3 months or 6 months.";

module.exports = { INTERNSHIP_DURATION_DAYS, INTERNSHIP_DURATION_ERROR };
