// ============================================================
// Text for the free internships page (pages/FreeInternships.jsx), linked from
// the menu's Internships → Free Internship.
// The roles come from the backend (/careers/free/openings): Admin → Training + Internship,
// "Free Internship".
//
// Everything here is free: applying, the aptitude test and the internship. No
// payment is taken at any step.
//
// New applicants apply through our Google Form (FREE_APPLY_FORM_URL), not on
// the site: they sign in to Google, fill it in and upload their CV there. Our
// team then contacts them by email for the aptitude test and, after it, an
// interview. No reply time is promised.
// ============================================================
export const FREE_PATH = "/free-internships";
export const CV_MAX_MB = 2;
export const RESULT_DAYS = 7;
// Where "Apply Now" on a free internship sends a new applicant: our Google Form.
export const FREE_APPLY_FORM_URL = "https://forms.gle/eaX7kab7zPG7w6SX6";

export const freeHero = {
  eyebrow: "Free Internships",
  title: "Free internships for students of every field.",
  text: "Work on real projects with mentors from Crix Technology. Applying is free: pick a role, fill in our application form with your CV, and we'll contact you by email for the aptitude test and then an interview.",
};

export const freeSteps = [
  { n: "01", title: "Pick a role", desc: "Choose the role and duration you want from the openings on this page, and press Apply Now." },
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
];
