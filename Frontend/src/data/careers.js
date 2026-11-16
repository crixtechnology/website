// ============================================================
// Text for the Careers page (pages/Careers.jsx) and the careers sections of My
// Dashboard. The job openings themselves are admin-managed and come from the
// backend (/careers/openings): only the roles the admin has open are ever shown,
// never a built-in list.
// ============================================================
import { site } from "./content.js";

// What the page quotes until the live numbers arrive from the backend
// (Admin → Careers settings): the signup bonus and the credit rules.
export const defaultTerms = { signupBonus: 300, creditExpiryMonths: 12, creditUsagePercent: 100 };

// A role's positions (utils/positions.js): selected applicants fill them.
export { isFull as isRoleFull, positionsLabel, positionsTag } from "../utils/positions.js";

export const careersContact = {
  email: site.email,
  phone: site.phoneAlt,
  whatsapp: site.whatsappAlt || site.whatsapp,
};

export const careersHero = {
  eyebrow: "Careers at Crix",
  title: "Build Real Products. Start Your Tech Career at Crix.",
  text: "We help students and freshers turn what they've learned into real industry experience — working on live projects, with mentors, from day one.",
};

export const vision =
  "To be the place where India's next generation of engineers gets its first real start — where talent, not a résumé, opens the door, and every fresher has the chance to build something that ships.";

export const mission =
  "To close the gap between the classroom and the industry: we put students and freshers on real projects, pair them with working professionals, and help them grow into developers that teams are glad to hire.";

export const values = [
  { icon: "tasks", title: "Learn by Doing", desc: "You learn fastest by building. From the first week you work on real tasks, not practice exercises." },
  { icon: "mentor", title: "Mentorship", desc: "A working professional reviews your code, answers your questions and helps you get unstuck." },
  { icon: "briefcase", title: "Real Projects", desc: "Your work goes into live products and client projects — things you can show in an interview." },
  { icon: "star", title: "Growth", desc: "Clear feedback, growing responsibility, and a path to a full-time role for those who earn it." },
];

// The hiring timeline. Wallet credit comes only from the signup bonus and from
// Crix (Admin) — never from applying or the test — so it isn't part of these steps.
export const hiringSteps = () => [
  { title: "Log in", desc: "Log in with your email and a password — a new email gets a free account straight away." },
  { title: "Apply for a role", desc: "Pick a role, accept the Terms & Conditions and confirm you're 18 or older. Applying and the test are free." },
  { title: "Take the aptitude test", desc: "Our team gives you access to the test and emails you when it's ready — then take it from My Dashboard." },
  { title: "Get your result", desc: "You'll hear from us within 7 days of submitting the test." },
  { title: "Online interview", desc: "Shortlisted candidates are invited to an online interview." },
  { title: "Final selection", desc: "Selected candidates receive their offer letter." },
];


// Where the role someone chose on the Careers page is remembered while they
// log in (or create their account), so the dashboard can open on it.
const ROLE_KEY = "crix_apply_role";
export const rememberRole = (slug) => { try { window.sessionStorage.setItem(ROLE_KEY, slug); } catch (e) { /* storage blocked */ } };
export const takeRememberedRole = () => {
  try {
    const slug = window.sessionStorage.getItem(ROLE_KEY) || "";
    window.sessionStorage.removeItem(ROLE_KEY);
    return slug;
  } catch (e) { return ""; }
};

// Times are stored in UTC; everything shown to people is in Indian time.
export const formatIST = (iso, withTime = true) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
        ...(withTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
      }) + (withTime ? " IST" : "")
    : "";

// The aptitude test's rules, as the test page lists them before Start. `rules`
// comes from the server for one application (violation limit, webcam
// interval); without it (the Careers page) the wording stays general.
export const testRuleLines = (rules = {}) => [
  "You get one attempt. Once you start, the timer runs until it ends — closing the page does not stop it.",
  "The test runs in full screen. Leaving full screen pauses the paper (not the timer) and counts as a warning.",
  "Switching to another tab, window or app counts as a warning.",
  rules.violationLimit
    ? `After ${rules.violationLimit} warnings the test is submitted automatically.`
    : "After the number of warnings shown before you start, the test is submitted automatically.",
  "Copy, paste, right-click, text selection and screenshot shortcuts are switched off, and attempts are recorded.",
  rules.snapshotIntervalSeconds
    ? `Your webcam takes a photo about every ${rules.snapshotIntervalSeconds} seconds, to confirm that you — and only you — are taking the test.`
    : "Your webcam takes a photo at regular intervals, to confirm that you — and only you — are taking the test.",
  "The webcam photos are deleted automatically 6 months after your application is closed, and within 12 months of the test at the latest.",
  "Every answer is saved the moment you pick it. If your connection drops, reopen the test page and continue within the time left.",
  "Your IP address, device and browser are recorded with your attempt.",
  "The test is submitted automatically when the time is up.",
];

// The careers rules as one downloadable document (utils/documentPdf.js):
// hiring steps, the wallet-credit rules, and the test rules. `rules` adds the
// facts of one role's test when known (the test page passes its own).
export const careersRulesDocument = (terms, { role = "", rules = null } = {}) => {
  const bullets = (items) => items.map((x) => `• ${x}`).join("\n");
  const facts = rules
    ? [
        `${rules.questions} multiple-choice questions in ${rules.durationMinutes} minutes.`,
        `${rules.marksPerQuestion} mark${rules.marksPerQuestion === 1 ? "" : "s"} for each correct answer, nothing taken off for a wrong answer; an unanswered question scores 0.`,
      ]
    : [];
  return {
    title: role ? `Aptitude Test Rules — ${role}` : "Careers & Aptitude Test Rules",
    subtitle: `Crix Technology Careers · ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`,
    intro:
      "These rules apply to every application made through the Crix Technology Careers page. They are part of our Terms of Service (section 8, \"Careers, Aptitude Test & Selection\"), which you accept when you apply.",
    sections: [
      // Hiring steps and the no-fee rule only on the Careers page (terms passed).
      ...(terms ? [
        { title: "How hiring works", content: bullets(hiringSteps(terms).map((s) => `${s.title} — ${s.desc}`)) },
        {
          title: "No fee to apply",
          content:
            "Applying for a role and taking its aptitude test are free. Crix Technology never asks an applicant for a registration, test or processing fee — if anyone does, don't pay and tell us. Applying and taking the test earn no wallet credit. After you apply, our team gives you access to the test and emails you when it's ready.",
        },
      ] : []),
      { title: "The aptitude test", content: bullets([...facts, ...testRuleLines(rules || {})]) },
      {
        title: "Fair play",
        content: bullets([
          "Take the test yourself, alone, without help from any other person, website, tool or AI service.",
          "Don't copy, record, share or publish any question.",
          "Breaking these rules, tampering with the test or having someone else take it leads to disqualification, may lead to your account being suspended, and may stop you applying again.",
        ]),
      },
      {
        title: "Results & selection",
        content: bullets([
          "Your score and answers are used by Crix Technology to decide shortlisting and are not shared with you.",
          "You'll hear whether you're shortlisted within 7 days of submitting the test. Shortlisted candidates are invited to an online interview; selected candidates receive an offer letter.",
          "Passing the test does not guarantee an interview, selection, an offer, a stipend or employment. Selection decisions are final.",
        ]),
      },
      {
        title: "Questions",
        content: `Email ${careersContact.email}, call ${careersContact.phone}, or message us on WhatsApp. Full terms: ${site.website}/terms-of-service`,
      },
    ].map((section, n) => ({ ...section, title: `${n + 1}. ${section.title}` })),
  };
};
