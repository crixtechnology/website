// ============================================================
// Text for the free internships page (pages/FreeInternships.jsx). The page is
// deliberately not linked from anywhere on the site (no menu, footer, sitemap
// or search listing) — it is shared by its address, /free-internships, only.
// The roles come from the backend (/careers/free/openings): Admin → Job openings,
// "Listed on: Free internships page only".
// ============================================================
import { testRuleLines } from "./careers.js";

export const FREE_PATH = "/free-internships";
export const CV_MAX_MB = 2;
export const RESULT_DAYS = 7;

export const freeHero = {
  eyebrow: "Free Internships",
  title: "Free internships for students of every field.",
  text: "Work on real projects with mentors from Crix Technology. Applying is free: create your account, send your CV for a role, take the online aptitude test, and get your result by email within 7 days.",
};

export const freeSteps = [
  { n: "01", title: "Sign up", desc: "Create your free Crix account with your email (or log in if you already have one)." },
  { n: "02", title: "Apply with your CV", desc: `Pick a role, fill in your college, course, branch and semester, and upload your CV as a PDF (up to ${CV_MAX_MB} MB). There is no fee.` },
  { n: "03", title: "Take the aptitude test", desc: "Once your CV is in, you're eligible for the online aptitude test. Take it straight away or later from My Dashboard." },
  { n: "04", title: "Get your result", desc: `Within ${RESULT_DAYS} days of submitting the test you'll get an email telling you whether you're selected or not selected.` },
];

export const freeEligibility = [
  "Students of any field or stream, in any year, at a recognised school, college or university in India — or recent graduates.",
  "18 years of age or older on the day you take the test.",
  "A laptop or desktop computer with a working webcam and a stable internet connection.",
  "One account per person, in your own name, with an email address you check.",
];

// ---------- the rules shown on the page ----------
export const freeRules = [
  "Applying, the aptitude test and the internship are free. Crix Technology never asks applicants for a fee — if anyone does, don't pay and tell us.",
  "You need your own Crix account to apply. Sign up (or log in) before sending your CV.",
  `Your CV must be a PDF of up to ${CV_MAX_MB} MB, in your own name, and true. You can replace it until you start the test.`,
  "You can hold one open application per role. You may apply for more than one role, but each has its own test.",
  "Your test unlocks only after your CV is uploaded and you accept these rules and the Terms & Conditions.",
  "You get one attempt per application. It can be taken straight away or later from My Dashboard, while the role is open.",
  ...testRuleLines(),
  `Results — selected or not selected — are emailed to the address on your account within ${RESULT_DAYS} days of submitting the test, and shown in My Dashboard → My Applications.`,
  "Selection is based on your test, your CV and the number of places. Decisions are final; passing the test does not guarantee selection.",
  "If you are not selected, you may apply again after the waiting period shown when you try.",
];
