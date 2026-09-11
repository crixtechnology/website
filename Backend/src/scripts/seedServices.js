// One-time migration, same idea as seedPrograms.js: the IT services list
// currently hardcoded in Frontend/src/data/content.js (`services`) was never
// admin-managed. This inserts the same titles/descriptions/points as real,
// admin-editable Service docs (routes/services.js, /admin/services) so the
// public /services page keeps showing the same content but it's now
// controlled from the admin panel instead of hardcoded.
//
// Safe to re-run — skips any title that already exists.
//   node src/scripts/seedServices.js
require("dotenv").config();
const { connectDB } = require("../db");
const Service = require("../models/Service");
const mongoose = require("mongoose");

const services = [
  {
    tag: "For businesses",
    title: "Static Website",
    desc: "Fixed, fast-loading informational sites — brochure, portfolio and landing pages with no database or backend, built for speed and simplicity.",
    points: ["Responsive design", "Contact / enquiry forms", "SEO-friendly structure", "Fast page-load optimization"],
  },
  {
    tag: "For businesses",
    title: "Dynamic Website & Web Apps",
    desc: "Database and CMS-driven sites — content that updates, admin panels, e-commerce and custom web applications built on modern, maintainable stacks.",
    points: ["CMS / admin dashboard", "Blog or news section", "Payment gateway integration where needed", "Custom web applications"],
  },
  {
    tag: "For businesses",
    title: "Website Upgrade & Redesign",
    desc: "Refresh, modernize or re-platform an existing site — from a cosmetic update to a full rebuild on a modern stack.",
    points: ["Responsive redesign", "Performance & SEO fixes", "Content / data migration with redirects preserved"],
  },
  {
    tag: "For businesses",
    title: "Mobile App Development",
    desc: "Android / iOS and cross-platform apps, from concept through to deployment and store release.",
    points: ["Native or cross-platform builds", "Backend / API integration", "Push notifications", "App store submission support"],
  },
  {
    tag: "For businesses",
    title: "Digital Marketing",
    desc: "SEO, social media management and paid ad campaigns to grow a business's online presence.",
    points: ["Social media management", "On-page SEO", "Google / Meta ads management", "Monthly performance reporting"],
  },
  {
    tag: "For businesses",
    title: "AI / ML Solutions",
    desc: "Applied machine learning, automation and data-driven features built into existing products or delivered as standalone tools.",
    points: ["Currently offering: small, rule-based chatbots", "FAQ automation for websites & support workflows", "Data-driven features layered into existing products"],
  },
  {
    tag: "For businesses",
    title: "Software & IT Consulting",
    desc: "Technical audits, architecture guidance and ongoing support for teams that need a reliable extended engineering partner.",
    points: ["Code & architecture reviews", "Performance / security audits", "Short-term staff augmentation"],
  },
];

async function run() {
  await connectDB();
  let created = 0, skipped = 0;
  for (let i = 0; i < services.length; i++) {
    const entry = services[i];
    const existing = await Service.findOne({ title: entry.title });
    if (existing) { skipped++; continue; }
    await Service.create({ ...entry, order: i + 1, status: "active" });
    created++;
  }
  console.log(`services: ${created} created, ${skipped} already existed (skipped)`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
