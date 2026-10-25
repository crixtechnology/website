// ============================================================
// Text for the free internships page (pages/FreeInternships.jsx). The page is
// deliberately not linked from anywhere on the site (no menu, footer, sitemap
// or search listing) — it is shared by its address, /free-internships, only.
// The roles come from the backend (/careers/free/openings): Admin → Job openings,
// "Listed on: Free internships page only".
//
// The internship itself is free. The aptitude test has a processing fee (Admin
// → Careers settings; 0 = none) that comes back in full as wallet credit, so the
// text that mentions it is built from the live terms.
// ============================================================
import { testRuleLines } from "./careers.js";

export const FREE_PATH = "/free-internships";
export const CV_MAX_MB = 2;
export const RESULT_DAYS = 7;

// What the page quotes until the live terms arrive from the backend.
export const defaultFreeTerms = { processingFee: 94, creditExpiryMonths: 12, creditUsagePercent: 100 };

const feeLine = (fee) => `a ₹${fee} test processing fee, which comes back to your Crix wallet as ${fee} credits`;

export const freeHero = (fee) => ({
  eyebrow: "Free Internships",
  title: "Free internships for students of every field.",
  text: fee > 0
    ? `Work on real projects with mentors from Crix Technology. The internship is free: create your account, send your CV for a role, pay ${feeLine(fee)}, take the online aptitude test, and get your result by email within ${RESULT_DAYS} days.`
    : `Work on real projects with mentors from Crix Technology. Applying is free: create your account, send your CV for a role, take the online aptitude test, and get your result by email within ${RESULT_DAYS} days.`,
});

export const freeSteps = (fee) => [
  { n: "01", title: "Sign up", desc: "Create your free Crix account with your email (or log in if you already have one)." },
  {
    n: "02",
    title: "Apply with your CV",
    desc: `Pick a role, fill in your college, course, branch and semester, and upload your CV as a PDF (up to ${CV_MAX_MB} MB).` +
      (fee > 0 ? ` Then pay the ₹${fee} test processing fee — it comes back as ${fee} credits in your wallet.` : " There is no fee."),
  },
  { n: "03", title: "Take the aptitude test", desc: "Once you've applied, your online aptitude test unlocks. Take it straight away or later from My Dashboard." },
  { n: "04", title: "Get your result", desc: `Within ${RESULT_DAYS} days of submitting the test you'll get an email telling you whether you're selected or not selected.` },
];

export const freeEligibility = [
  "Students of any field or stream, in any year, at a recognised school, college or university in India — or recent graduates.",
  "18 years of age or older on the day you take the test.",
  "A laptop or desktop computer with a working webcam and a stable internet connection.",
  "One account per person, in your own name, with an email address you check.",
];

// The wallet-credit rules for the processing fee (same rules as every other credit).
export const processingFeePoints = ({ processingFee, creditExpiryMonths, creditUsagePercent }) => [
  `The full ₹${processingFee} comes back as ${processingFee} Crix credits in your wallet as soon as the payment is confirmed.`,
  "1 credit = ₹1, usable only for purchases on crixtechnology.com.",
  `${creditExpiryMonths > 0 ? `Credits are valid for ${creditExpiryMonths} months. ` : "Credits don't expire. "}` +
    (creditUsagePercent >= 100 ? "They can pay for up to the full value of a purchase." : `They can pay for up to ${creditUsagePercent}% of a purchase.`),
  "Credits cannot be withdrawn as cash or transferred. The fee is not refunded in cash for any reason.",
  "Paying the fee does not guarantee selection.",
];

// ---------- the rules shown on the page ----------
export const freeRules = (terms) => [
  terms.processingFee > 0
    ? `The internship is free. The only charge is ${feeLine(terms.processingFee)} (1 credit = ₹1). Crix Technology never asks for any other payment — if anyone does, don't pay and tell us.`
    : "Applying, the aptitude test and the internship are free. Crix Technology never asks applicants for a fee — if anyone does, don't pay and tell us.",
  "You need your own Crix account to apply. Sign up (or log in) before sending your CV.",
  `Your CV must be a PDF of up to ${CV_MAX_MB} MB, in your own name, and true. You can replace it until you start the test.`,
  "You can hold one open application per role. You may apply for more than one role, but each has its own test.",
  terms.processingFee > 0
    ? `Your test unlocks once your CV is uploaded, you accept these rules and the Terms & Conditions, and the ₹${terms.processingFee} processing fee is paid. The fee is not refunded in cash for any reason — including if you don't take the test or aren't selected — but it stays in your wallet as credit.`
    : "Your test unlocks only after your CV is uploaded and you accept these rules and the Terms & Conditions.",
  "You get one attempt per application. It can be taken straight away or later from My Dashboard, while the role is open.",
  ...testRuleLines(),
  `Results — selected or not selected — are emailed to the address on your account within ${RESULT_DAYS} days of submitting the test, and shown in My Dashboard → My Applications.`,
  "Selection is based on your test, your CV and the number of places. Decisions are final; paying the fee or passing the test does not guarantee selection.",
  "If you are not selected, you may apply again after the waiting period shown when you try.",
];
