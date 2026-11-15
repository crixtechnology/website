// ============================================================
// Text for the free internships page (pages/FreeInternships.jsx), linked from
// the menu's Internships → Free Internship.
// The page is static: the roles are written here (freeOpenings), not loaded
// from the backend or the database. To add, change or close a role, edit
// freeOpenings below and redeploy the site.
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
// Where "Apply Now" on every free internship sends an applicant: our Google Form.
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

// ---------- the open roles ----------
// Shown in this order. positions { total, filled, left } gives the card's
// "N positions open" (left: 0 shows "Positions filled" and turns Apply off).
// Roles with the same group are one card with a duration switch.
const ELIGIBLE_STUDENT =
  "Students of any field or stream, in any year, at a recognised school, college or university in India, or recent graduates";
const ELIGIBLE_AGE = "18 years of age or older on the day of the test";
const ELIGIBLE_DEVICE = "A laptop or desktop with a working webcam and a stable internet connection";
const ELIGIBLE_TIME = "Able to give about 2–3 hours a day for the length of the internship";
const DAILY_UPDATE = "Share a short progress update with your mentor every day";
const GIT_REVIEW = "Use Git for your work and act on code-review feedback";

const common = {
  stipend: "No Stipend",
  experience: "0–1 year (freshers, college students are also welcome)",
  duration: "3 months",
  mode: "Remote / Ahmedabad",
  startsOn: "November-December",
  group: "",
};

export const freeOpenings = [
  {
    ...common,
    slug: "frontend-developer-intern-react-js",
    title: "Frontend Developer Intern (React.js)",
    summary:
      "Build real screens for live projects with React and JavaScript, guided by a mentor from our team. No experience needed — just curiosity and the basics of HTML, CSS and JavaScript (or the willingness to learn them before you start).",
    skills: ["HTML", "CSS", "JavaScript", "React basics", "Git basics", "Responsive design"],
    responsibilities: [
      "Turn page designs into React components with HTML, CSS and JavaScript",
      "Make pages work well on phones, tablets and laptops",
      "Connect screens to APIs and show the data clearly",
      "Fix small bugs and polish the look of existing pages",
      GIT_REVIEW,
      DAILY_UPDATE,
    ],
    eligibility: [ELIGIBLE_STUDENT, ELIGIBLE_AGE, "Basic HTML, CSS and JavaScript; some React is a plus, not a must", ELIGIBLE_DEVICE, ELIGIBLE_TIME],
    positions: { total: 11, filled: 0, left: 11 },
  },
  {
    ...common,
    slug: "python-developer-intern",
    title: "Python Developer Intern",
    summary:
      "Write Python for real tasks: small tools, scripts that save time, and simple back-end features. You'll learn to write clean, tested code with a mentor reviewing your work. Ideal if you know the basics of Python and want real practice.",
    skills: ["Python basics", "Problem solving", "Functions and loops", "Lists and dictionaries", "Working with files", "Git basics"],
    responsibilities: [
      "Write Python scripts and small tools for real project tasks",
      "Read and write data from files, spreadsheets and simple APIs",
      "Fix bugs in existing Python code and explain the fix",
      "Write simple tests to check that your code works",
      GIT_REVIEW,
      DAILY_UPDATE,
    ],
    eligibility: [ELIGIBLE_STUDENT, ELIGIBLE_AGE, "Basic Python: variables, loops, functions, lists and dictionaries", ELIGIBLE_DEVICE, ELIGIBLE_TIME],
    positions: { total: 12, filled: 0, left: 12 },
  },
  {
    ...common,
    slug: "cyber-security-intern",
    title: "Cyber Security Intern",
    summary:
      "Learn how websites and networks are attacked and defended by working on real security tasks, guided by a mentor from our team. No experience needed — just curiosity, basic computer and networking knowledge, and the willingness to learn.",
    skills: ["Networking basics", "Linux basics", "Web security (OWASP Top 10)", "Vulnerability assessment", "Burp Suite basics", "Nmap", "Security reporting"],
    responsibilities: [
      "Test web applications for common weaknesses from the OWASP Top 10, only on systems you are authorised to test",
      "Scan networks and servers with tools such as Nmap and explain what the results mean",
      "Use Burp Suite to inspect and test how a website handles requests",
      "Write clear reports: what you found, how serious it is and how to fix it",
      "Review passwords, access and configuration settings against a security checklist",
      DAILY_UPDATE,
    ],
    eligibility: [
      ELIGIBLE_STUDENT,
      ELIGIBLE_AGE,
      "Basic knowledge of computers, the internet and networking; some Linux is a plus, not a must",
      ELIGIBLE_DEVICE,
      ELIGIBLE_TIME,
      "Willing to follow our rules on ethical and authorised testing at all times",
    ],
    experience: "0–1 year (freshers welcome)",
    group: "Cyber Security",
    positions: { total: 6, filled: 0, left: 6 },
  },
  {
    ...common,
    slug: "web-development-intern",
    title: "Web Development Intern",
    summary:
      "Learn how websites really work, from the page in the browser to the server behind it. You'll build and fix pages with HTML, CSS and JavaScript and help with simple server and form features on real projects.",
    skills: ["HTML", "CSS", "JavaScript", "How the web works (HTTP)", "Basic Node.js or any back end", "Git basics"],
    responsibilities: [
      "Build and update web pages with HTML, CSS and JavaScript",
      "Make pages fast, accessible and mobile-friendly",
      "Help build simple forms and the server code that receives them",
      "Test pages in different browsers and fix what breaks",
      GIT_REVIEW,
      DAILY_UPDATE,
    ],
    eligibility: [ELIGIBLE_STUDENT, ELIGIBLE_AGE, "Basic HTML, CSS and JavaScript; any back-end knowledge is a plus", ELIGIBLE_DEVICE, ELIGIBLE_TIME],
    positions: { total: 15, filled: 0, left: 15 },
  },
  {
    ...common,
    slug: "ai-ml-developer-intern",
    title: "AI/ML Developer Intern",
    summary:
      "Get hands-on with machine learning: prepare data, train and test simple models in Python, and see how AI features are built into real products. Good for students who know some Python and want to understand how AI actually works.",
    skills: ["Python basics", "NumPy and Pandas basics", "Machine learning concepts", "scikit-learn basics", "Basic statistics", "Curiosity about AI"],
    responsibilities: [
      "Collect, clean and prepare data for machine-learning models",
      "Train and test simple models with Python and scikit-learn",
      "Measure how well a model works and explain the results simply",
      "Try out AI tools and APIs on small project tasks",
      "Write down your experiments so others can repeat them",
      DAILY_UPDATE,
    ],
    eligibility: [ELIGIBLE_STUDENT, ELIGIBLE_AGE, "Basic Python; school-level maths is enough to start", ELIGIBLE_DEVICE, ELIGIBLE_TIME],
    positions: { total: 5, filled: 0, left: 5 },
  },
  {
    ...common,
    slug: "data-science-intern",
    title: "Data Scientist / Data Analyst Intern",
    summary:
      "Turn raw data into answers. You'll clean and explore real datasets, write SQL queries, build charts and simple reports, and explain what the numbers mean. Open to students of any field — commerce, science and arts students are welcome.",
    skills: ["Excel or Google Sheets", "SQL basics", "Python or Pandas basics", "Basic statistics", "Charts and dashboards", "Clear communication"],
    responsibilities: [
      "Clean and organise data from spreadsheets, databases and files",
      "Write SQL queries to pull and summarise data",
      "Explore data and find trends with Python, Pandas or spreadsheets",
      "Build clear charts and simple dashboards",
      "Explain what the data shows in plain language",
      DAILY_UPDATE,
    ],
    eligibility: [ELIGIBLE_STUDENT, ELIGIBLE_AGE, "Comfortable with numbers and spreadsheets; SQL or Python basics are a plus", ELIGIBLE_DEVICE, ELIGIBLE_TIME],
    positions: { total: 10, filled: 0, left: 10 },
  },
];
