// Starter data for the careers page and the aptitude test: the three job
// openings and a question bank for every category (general: quantitative,
// logical reasoning, verbal ability, and their foundation versions; technical:
// web, full stack, data science, frontend, python, web fundamentals, AI/ML).
// Everything here is admin-editable afterwards (Admin → Job openings / Question bank).
//
// Safe to re-run — an opening whose slug already exists is skipped, and so is a
// question that is already in the bank.
//   npm run seed:careers
// The server also runs this by itself, once, on its first start against an
// empty database (utils/careersFirstRun.js), so a host without a shell needs nothing.
require("dotenv").config();
const { prisma } = require("../db");

const COMMON = {
  stipend: "Up to ₹6,000/month (performance based)",
  experience: "0–1 year (freshers welcome)",
  duration: "3 months",
  mode: "Remote / Ahmedabad",
  durationMinutes: 30,
  questionCounts: { quantitative: 10, logical: 10, verbal: 10, technical: 10 },
  marksPerQuestion: 1,
  negativeMarks: 0.25,
  cutoffScore: 20,
};

const openings = [
  {
    slug: "web-development-intern",
    title: "Web Development Intern",
    techCategory: "web",
    summary: "Build responsive, fast and accessible web pages for real client and in-house projects, working alongside our front-end team.",
    skills: ["HTML", "CSS", "JavaScript", "React basics", "Responsive design"],
    responsibilities: [
      "Turn designs into clean, responsive HTML, CSS and JavaScript",
      "Build and reuse React components for live projects",
      "Fix layout and cross-browser issues on phones, tablets and desktops",
      "Take part in code reviews and act on the feedback",
      "Give a short update on your progress to your mentor every day",
    ],
    eligibility: [
      "Students in any year, recent graduates, or freshers with up to 1 year of experience",
      "Comfortable with HTML, CSS and the basics of JavaScript",
      "A laptop and a steady internet connection",
      "Able to give at least 4–5 hours a day for the length of the internship",
    ],
  },
  {
    slug: "full-stack-developer-intern",
    title: "Full Stack Developer Intern",
    techCategory: "fullstack",
    summary: "Work across the whole product — front end, back end and database — and ship features that real users rely on.",
    skills: ["Frontend", "Backend", "Databases", "REST APIs", "Git"],
    responsibilities: [
      "Build features end to end: the screen, the API behind it and the data it stores",
      "Design and document REST APIs with Node.js and Express",
      "Model and query data in SQL and NoSQL databases",
      "Use Git every day: branches, pull requests and code reviews",
      "Write simple tests and help track down bugs in production",
    ],
    eligibility: [
      "Students in any year, recent graduates, or freshers with up to 1 year of experience",
      "Working knowledge of JavaScript and one front-end framework (React preferred)",
      "Basic understanding of how a server, an API and a database fit together",
      "A laptop and a steady internet connection",
    ],
  },
  {
    slug: "data-science-intern",
    title: "Data Science Intern",
    techCategory: "datascience",
    summary: "Clean, explore and model real datasets, and turn what you find into charts and insights a business can act on.",
    skills: ["Python", "Pandas", "NumPy", "Data visualization", "Basic ML", "SQL"],
    responsibilities: [
      "Collect, clean and prepare datasets with Python, Pandas and NumPy",
      "Explore data and present what it shows with clear charts",
      "Train and evaluate simple machine-learning models",
      "Write SQL queries to pull and summarise data",
      "Document your analysis so others can follow and repeat it",
    ],
    eligibility: [
      "Students in any year, recent graduates, or freshers with up to 1 year of experience",
      "Comfortable with Python and basic statistics",
      "Curious about data and willing to learn the tools as you go",
      "A laptop and a steady internet connection",
    ],
  },
];

// The starter bank: see careerQuestions.js (and careerQuestionsRoles.js).
const questions = require("./careerQuestions");

// Two questions may share their wording ("Which word is spelled correctly?") and
// differ only in their options, so a question is recognised by both.
const sameQuestion = (text, options) => text + "|" + [...options].sort().join("|");

// Adds whatever of the starter roles and questions isn't there yet. `openingStatus`
// is what a newly added role starts as ("open" or "closed"). Returns the counts.
async function seedCareers({ openingStatus = "open" } = {}) {
  let addedOpenings = 0;
  for (const [i, o] of openings.entries()) {
    const exists = await prisma.jobOpening.findUnique({ where: { slug: o.slug }, select: { id: true } });
    if (exists) continue;
    await prisma.jobOpening.create({ data: { ...COMMON, ...o, status: openingStatus, order: i + 1 } });
    addedOpenings += 1;
  }

  const addedQuestions = await addQuestions(questions);
  return { addedOpenings, addedQuestions };
}

// Adds the questions of `bank` ({ category: [[text, options, correctIndex], ...] })
// that aren't in the database yet. Returns how many were added.
async function addQuestions(bank) {
  let added = 0;
  for (const [category, rows] of Object.entries(bank)) {
    const inBank = await prisma.testQuestion.findMany({ where: { category }, select: { text: true, options: true } });
    const existing = new Set(inBank.map((q) => sameQuestion(q.text, Array.isArray(q.options) ? q.options : [])));
    const fresh = rows.filter(([text, options]) => !existing.has(sameQuestion(text, options))).map(([text, options, correctIndex]) => ({ category, text, options, correctIndex }));
    if (fresh.length) await prisma.testQuestion.createMany({ data: fresh });
    added += fresh.length;
  }
  return added;
}

async function main() {
  const { addedOpenings, addedQuestions } = await seedCareers();
  console.log(`Careers seed: added ${addedOpenings} opening(s) and ${addedQuestions} question(s).`);
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}

module.exports = { seedCareers, addQuestions, openings, questions, COMMON };
