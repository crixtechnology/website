// ============================================================
// Text for the free internships page (pages/FreeInternships.jsx). The page is
// deliberately not linked from anywhere on the site (no menu, footer, sitemap
// or search listing) — it is shared by its address, /free-internships, only.
// The roles come from the backend (/careers/free/openings): Admin → Job openings,
// "Listed on: Free internships page only".
// ============================================================
import { site } from "./content.js";
import { careersContact, testRuleLines } from "./careers.js";

export const FREE_PATH = "/free-internships";
export const CV_MAX_MB = 2;
export const RESULT_DAYS = 7;

export const freeHero = {
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

// ---------- the rules, privacy notice and terms shown on the page ----------
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

export const freePrivacy = [
  { q: "What we collect", a: "Your account details (name, email, phone), your education (college, course, branch / department, semester, year of passing), the CV you upload, the roles you apply for, your aptitude-test answers and result, and — during the test only — webcam photos at regular intervals, your IP address, device and browser details and any test-rule warnings." },
  { q: "Why we collect it", a: "Only to run this hiring process: to review your application, confirm that the test was taken fairly by you, decide selection, and contact you about the result. We don't sell your data or use it for advertising." },
  { q: "Who can see it", a: "Only the Crix Technology hiring team. CVs and webcam photos are kept in private storage that only our admin panel can read. Your score and answers are not shared with you or with anyone outside Crix Technology." },
  { q: "How long we keep it", a: "Your CV and webcam photos are deleted automatically 6 months after your application is closed (selected or not selected), and in any case within 12 months. Everything is deleted straight away if you delete your account." },
  { q: "Your rights", a: "You can see your applications in My Dashboard, replace your CV before the test, and delete your account and data at any time from your Profile page (Digital Personal Data Protection Act, 2023). Questions? Email " + careersContact.email + "." },
];

export const freeTerms = [
  "This programme is run by " + site.legalName + ". By applying you accept our Terms of Service (section 8, \"Careers, Aptitude Test & Selection\") and Privacy Policy, together with the rules on this page. Where they differ for a free internship, the rules on this page apply.",
  "Everything you submit must be your own and true. A false CV, someone else taking your test, or any attempt to tamper with the test leads to disqualification and may stop you applying again.",
  "Don't copy, record, share or publish any test question.",
  "An internship is a learning opportunity, not employment. Any stipend, duration, timing and mode are as stated on the role and in your offer letter.",
  "Crix Technology may change, pause or close a role, or change these rules, at any time. Changes don't affect a test you have already submitted.",
  "These terms are governed by the laws of India; the courts at Ahmedabad, Gujarat have jurisdiction.",
];

export const freeFaqs = [
  { q: "Is it really free?", a: "Yes. There is no registration fee, test fee or internship fee for these internships." },
  { q: "I'm not from a computer background. Can I apply?", a: "Yes — students of any field can apply. Each role lists the skills it needs; pick one that fits you." },
  { q: "Can I apply without an account?", a: "No — sign up first. Your account is where your CV, test and result live, and it's how we email you." },
  { q: "My CV is a Word file. What do I do?", a: "Save or export it as PDF (File → Save As → PDF in Word or Google Docs) and upload that." },
  { q: "When will I hear back?", a: `Within ${RESULT_DAYS} days of submitting the test, by email — whether you're selected or not selected. The result also shows in My Dashboard → My Applications.` },
  { q: "Can I take the test on my phone?", a: "No. The test needs a laptop or desktop computer with a webcam, in full-screen mode." },
];

// The page's rules as one downloadable PDF (utils/documentPdf.js).
export const freeRulesDocument = () => {
  const bullets = (items) => items.map((x) => `• ${x}`).join("\n");
  return {
    title: "Free Internships — Rules, Privacy & Terms",
    subtitle: `Crix Technology · ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`,
    intro: `These rules apply to every application made through ${site.website}${FREE_PATH}.`,
    sections: [
      { title: "How it works", content: bullets(freeSteps.map((s) => `${s.title} — ${s.desc}`)) },
      { title: "Who can apply", content: bullets(freeEligibility) },
      { title: "Rules", content: bullets(freeRules) },
      { title: "Privacy", content: freePrivacy.map((p) => `${p.q}: ${p.a}`).join("\n\n") },
      { title: "Terms", content: bullets(freeTerms) },
      { title: "Questions", content: `Email ${careersContact.email}, call ${careersContact.phone}, or message us on WhatsApp. Full terms: ${site.website}/terms-of-service · Privacy: ${site.website}/privacy-policy` },
    ].map((section, n) => ({ ...section, title: `${n + 1}. ${section.title}` })),
  };
};
