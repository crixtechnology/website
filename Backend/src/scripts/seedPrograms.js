// One-time migration: the internships and courses currently hardcoded in
// Frontend/src/data/content.js (as `internships` / `courses`) were never
// admin-managed — the live site was just showing static content, and with
// no Course rows in the DB, nothing was actually purchasable. This inserts
// the exact same titles/descriptions/points as real, admin-editable
// entries, so the site keeps showing the same content but it's now
// controlled from /admin/courses instead of hardcoded.
//
// Safe to re-run — skips any title whose slug already exists.
//   node src/scripts/seedPrograms.js
//
// Both types are seeded with price: null (no "Buy now" until an admin sets
// a real price via the admin panel — matches current behavior exactly,
// since the static fallback never had prices either). Internships aren't
// required to stay unpriced — an admin can set a real price on one
// afterward, same two-step (set price, then open) flow as a course — this
// script's starter data just doesn't presume to do that for you.
//
// DRIFT WARNING: this script only ever INSERTS — "safe to re-run" means it
// skips a title whose slug already exists, it never updates one. Once a
// title/tag/desc/points below has been seeded into a real DB, editing
// content.js's copy does nothing to that DB row; it now only affects the
// static fallback shown when the backend isn't configured. If you rename a
// title here again, also fix it directly via /admin/courses — this file
// alone won't touch existing rows.
require("dotenv").config();
const { prisma } = require("../db");

function slugify(title) {
  return String(title).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const internships = [
  {
    tag: "Flagship",
    title: "MERN Stack with AI Integration",
    desc: "Full-stack development from zero to deployed — with AI features woven in from day one.",
    points: ["React, Node.js, Express, MongoDB", "Authentication with JWT", "Gemini API integration", "Capstone: AI-Powered Job Portal"],
  },
  {
    tag: "Advanced",
    title: "AI Agentic Systems",
    desc: "Design agents that reason, use tools, and work in teams — the skill set every company is hiring for.",
    points: ["LangChain & CrewAI frameworks", "RAG pipelines & vector search", "Multi-agent orchestration", "Free-tier stack: Gemini, Groq, Colab"],
  },
  {
    tag: "Structured Track",
    title: "Guided Virtual Internship",
    desc: "A structured, mentor-led curriculum designed to convert students into contributors.",
    points: ["Live sessions with structured decks", "Hands-on labs, not lectures", "Team capstone with code review", "Completion certificate"],
  },
  {
    tag: "Mobile",
    title: "Android Development",
    desc: "Build and ship native Android apps — from UI fundamentals to a deployed project.",
    points: ["Java · Kotlin · React Native", "UI, navigation & local storage", "REST API integration", "15 Days / 3 Month / 6 Month tracks"],
  },
];

const courses = [
  {
    tag: "Beginner friendly",
    title: "Web Development Track",
    desc: "HTML, CSS, JavaScript to full MERN stack — self-paced with mentor support.",
    points: ["Frontend fundamentals", "React in depth", "Node.js & MongoDB", "Deploy your own projects"],
  },
  {
    tag: "In demand",
    title: "AI & ML Fundamentals",
    desc: "Practical AI/ML for students — Python, APIs, and building real AI features.",
    points: ["Python for AI", "Working with LLM APIs", "Prompt engineering", "Mini projects portfolio"],
  },
  {
    tag: "Career",
    title: "Building AI Agents & RAG Systems",
    desc: "The advanced track — build agents that use tools, retrieve knowledge, and work in teams.",
    points: ["LangChain & CrewAI", "RAG systems", "Multi-agent projects", "Certificate on completion"],
  },
  {
    tag: "Mobile",
    title: "Kotlin & Java for Android",
    desc: "Beginner to pro — build native Android apps and publish a portfolio project.",
    points: ["Java & Kotlin foundations", "Jetpack & Material UI", "REST APIs & local storage", "Ship a real app"],
  },
  {
    tag: "Backend",
    title: "Node.js Programming",
    desc: "Server-side JavaScript — build REST APIs, auth, and database-backed services.",
    points: ["Express & routing", "JWT authentication", "MongoDB & Mongoose", "Deploy your API"],
  },
  {
    tag: "Frontend",
    title: "React.js Programming",
    desc: "Component-driven UIs — hooks, state, routing, and production patterns.",
    points: ["Hooks & state management", "React Router", "API integration", "Build & deploy projects"],
  },
  {
    tag: "Data",
    title: "SQL & Databases",
    desc: "Design schemas and write queries that scale — the data layer every developer needs.",
    points: ["Relational modelling", "Joins, indexes & views", "Transactions", "Practical query projects"],
  },
];

async function seed(list, type) {
  let created = 0, skipped = 0;
  for (const entry of list) {
    const slug = slugify(entry.title);
    const existing = await prisma.course.findUnique({ where: { slug } });
    if (existing) { skipped++; continue; }
    await prisma.course.create({
      data: { type, title: entry.title, slug, tag: entry.tag, desc: entry.desc, points: entry.points, price: null, status: "open" },
    });
    created++;
  }
  console.log(`${type}: ${created} created, ${skipped} already existed (skipped)`);
}

async function run() {
  await seed(internships, "internship");
  await seed(courses, "course");
  await prisma.$disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
