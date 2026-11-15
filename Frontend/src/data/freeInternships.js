// ============================================================
// Text for the free internships page (pages/FreeInternships.jsx), linked from
// the menu's Internships → Free Internship.
//
// The page is static: nothing is loaded from the backend or the database, and
// nothing about it is edited in Admin. The roles and the Google Form link are
// in freeInternships.json — to add, change or close a role, or change the
// link, edit that file and redeploy. The same file feeds the page, its search
// engine data (JobPosting, also built into the prebuilt page by
// scripts/prerender-meta.js) and the help chat.
//
// Each role in freeInternships.json, shown in that order: slug (unique id),
// title, summary, skills, responsibilities, eligibility, stipend, experience,
// duration, mode, startsOn (an estimate), group (roles with the same group
// become one card with a duration switch), positions { total, filled, left }
// (left: 0 shows "Positions filled" and turns Apply off) and datePosted
// (YYYY-MM-DD, for search engines).
//
// Everything here is free: applying, the aptitude test and the internship. No
// payment is taken at any step.
//
// New applicants apply through our Google Form (FREE_APPLY_FORM_URL), not on
// the site: they sign in to Google, fill it in and upload their CV there. Our
// team then contacts them by email for the aptitude test and, after it, an
// interview. No reply time is promised.
// ============================================================
import data from "./freeInternships.json";

export const FREE_PATH = "/free-internships";
// Where "Apply Now" on every free internship sends an applicant: our Google Form.
export const FREE_APPLY_FORM_URL = data.applyFormUrl;
// The open roles, in the order the page shows them.
export const freeOpenings = data.openings;

export const freeHero = {
  eyebrow: "Free Internships",
  title: "Free internships for students of every field.",
  text: "Work on real projects with mentors from Crix Technology. Applying is free: pick a role, fill in our application form with your CV, and we'll contact you by email for the aptitude test and then an interview.",
};

export const freeSteps = [
  { n: "01", title: "Pick a role", desc: "Choose the role you want from the openings on this page, and press Apply Now." },
  {
    n: "02",
    title: "Fill in the form",
    desc: "Apply Now opens our Google Form. Sign in with a Google account, fill in your details and upload your CV as a PDF. There is no fee.",
  },
  { n: "03", title: "Take the aptitude test", desc: "Our team reviews your application and emails you how and when to take the aptitude test." },
  { n: "04", title: "Interview", desc: "Candidates who do well in the test are invited to an interview. Selected candidates then get their offer letter and joining details." },
];

export const freeEligibility = [
  "Students of any field or stream, in any year, at a recognised school, college or university in India — or recent graduates.",
  "18 years of age or older on the day you take the test.",
  "A laptop or desktop computer with a working webcam and a stable internet connection.",
  "A Google account to open the application form, and an email address you check.",
];

// ---------- the rules shown on the page ----------
export const freeRules = [
  "Applying, the aptitude test and the internship are free. Crix Technology never asks applicants for a fee — if anyone does, don't pay and tell us.",
  "You apply through our Google Form, opened by Apply Now on a role. It asks you to sign in with a Google account; your answers and CV reach us through Google Forms.",
  "Upload your CV as a PDF, in your own name, and make sure everything in it and in the form is true.",
  "Apply once for each role you want. You may apply for more than one role.",
  "After reviewing your application, we contact you by email about the aptitude test. Its date, format and rules are sent with that invitation.",
  "Take the test yourself, alone, without help from any other person, website, tool or AI service.",
  "Candidates who do well in the test are invited to an interview before the final selection.",
  "We contact you at the email address you give in the form, so check it (and its spam folder) regularly.",
  "Selection is based on your application, your test, your interview and the number of places. Decisions are final; applying or passing the test does not guarantee selection.",
  "These internships are unpaid: there is no stipend. The duration and mode shown on each role apply to everyone selected for it.",
  "The start shown on each role (\"Starts on\") is an estimate. Selected candidates are told the actual start date with their offer letter and joining details.",
];

