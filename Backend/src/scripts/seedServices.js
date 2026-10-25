// One-time migration, same idea as seedPrograms.js: the IT services list
// currently hardcoded in Frontend/src/data/content.js (`services`) was never
// admin-managed. This inserts the same titles/descriptions/points as real,
// admin-editable Service rows (routes/services.js, /admin/services) so the
// public /services page keeps showing the same content but it's now
// controlled from the admin panel instead of hardcoded.
//
// Safe to re-run — skips any title that already exists.
//   node src/scripts/seedServices.js
//
// --replace switches an existing database over to exactly this list: these
// titles are created (or updated and re-activated) in this order, and every
// other service is set to inactive — hidden from /services, not deleted, so
// an admin can bring one back from /admin/services.
//   node src/scripts/seedServices.js --replace
// The server also does this switch once by itself on its next start
// (utils/servicesSwitch.js), so a host without a shell needs nothing.
require("dotenv").config();
const { prisma } = require("../db");

const services = [
  {
    tag: "For businesses",
    title: "Website Development & Web Solutions",
    desc: "Static and dynamic websites, landing pages, business websites, e-commerce, web applications, UI/UX, redesign and website modernization.",
    points: ["Static websites", "Dynamic websites", "Landing pages", "Business websites", "E-commerce", "Web applications", "UI/UX", "Redesign", "Website modernization"],
  },
  {
    tag: "For businesses",
    title: "Custom Software, SaaS & Business Systems",
    desc: "Custom software, SaaS platforms, ERP, CRM, inventory management, billing systems, admin panels and business portals.",
    points: ["Custom software", "SaaS platforms", "ERP", "CRM", "Inventory management", "Billing systems", "Admin panels", "Business portals"],
  },
  {
    tag: "For businesses",
    title: "AI, Machine Learning & Generative AI",
    desc: "AI/ML solutions, generative AI, AI-powered applications, document intelligence and AI model integration.",
    points: ["AI/ML solutions", "Generative AI", "AI-powered applications", "Document intelligence", "AI model integration"],
  },
  {
    tag: "For businesses",
    title: "AI Agents & Business Process Automation",
    desc: "AI agents, workflow automation, repetitive task automation, business process digitization and low-code/no-code automation.",
    points: ["AI agents", "Workflow automation", "Repetitive task automation", "Business process digitization", "Low-code/no-code automation"],
  },
  {
    tag: "For businesses",
    title: "Chatbots, WhatsApp & Customer Automation",
    desc: "Website chatbots, AI customer support, WhatsApp Business integrations, lead management, appointment reminders and automated notifications.",
    points: ["Website chatbots", "AI customer support", "WhatsApp Business integrations", "Lead management", "Appointment reminders", "Automated notifications"],
  },
  {
    tag: "For businesses",
    title: "Mobile App Development",
    desc: "Android, iOS, cross-platform apps and progressive web applications (PWAs).",
    points: ["Android", "iOS", "Cross-platform apps", "Progressive web applications (PWAs)"],
  },
  {
    tag: "For businesses",
    title: "API, Payment & Third-Party Integrations",
    desc: "REST APIs, payment gateways, UPI integration, CRM connections, webhooks and third-party software integrations.",
    points: ["REST APIs", "Payment gateways", "UPI integration", "CRM connections", "Webhooks", "Third-party software integrations"],
  },
  {
    tag: "For businesses",
    title: "Cloud Computing, DevOps & Infrastructure",
    desc: "Cloud deployment, hosting configuration, CI/CD, server management, monitoring, backups, disaster recovery and cloud cost optimisation.",
    points: ["Cloud deployment", "Hosting configuration", "CI/CD", "Server management", "Monitoring", "Backups", "Disaster recovery", "Cloud cost optimisation"],
  },
  {
    tag: "For businesses",
    title: "Cybersecurity, Software Testing & Quality Assurance",
    desc: "Security assessments, website protection, vulnerability reviews, manual testing, API testing, automated testing and performance optimisation.",
    points: ["Security assessments", "Website protection", "Vulnerability reviews", "Manual testing", "API testing", "Automated testing", "Performance optimisation"],
  },
  {
    tag: "For businesses",
    title: "Data Analytics & Business Intelligence",
    desc: "Data analysis, Power BI, business dashboards, KPI tracking, reporting, data visualisation, database management and migration.",
    points: ["Data analysis", "Power BI", "Business dashboards", "KPI tracking", "Reporting", "Data visualisation", "Database management", "Database migration"],
  },
  {
    tag: "For businesses",
    title: "Digital Marketing & Business Growth",
    desc: "SEO, local SEO, Google Business Profile, social media management, paid advertising, lead generation and marketing automation.",
    points: ["SEO", "Local SEO", "Google Business Profile", "Social media management", "Paid advertising", "Lead generation", "Marketing automation"],
  },
  {
    tag: "For businesses",
    title: "IT Consulting, Maintenance & Technical Support",
    desc: "IT consulting, digital transformation, technical audits, ongoing maintenance, bug fixes, updates and application support.",
    points: ["IT consulting", "Digital transformation", "Technical audits", "Ongoing maintenance", "Bug fixes", "Updates", "Application support"],
  },
];

async function seedServices({ replace = false } = {}) {
  let created = 0, skipped = 0, updated = 0, hidden = 0;
  for (let i = 0; i < services.length; i++) {
    const entry = services[i];
    const existing = await prisma.service.findFirst({ where: { title: entry.title } });
    if (existing && replace) {
      await prisma.service.update({ where: { id: existing.id }, data: { ...entry, order: i + 1, status: "active" } });
      updated++;
      continue;
    }
    if (existing) { skipped++; continue; }
    await prisma.service.create({ data: { ...entry, order: i + 1, status: "active" } });
    created++;
  }
  if (replace) {
    ({ count: hidden } = await prisma.service.updateMany({
      where: { title: { notIn: services.map((s) => s.title) }, status: "active" },
      data: { status: "inactive" },
    }));
  }
  return { created, skipped, updated, hidden };
}

async function main() {
  const replace = process.argv.includes("--replace");
  const { created, skipped, updated, hidden } = await seedServices({ replace });
  if (replace) console.log(`services: ${created} created, ${updated} updated, ${hidden} old ones set inactive`);
  else console.log(`services: ${created} created, ${skipped} already existed (skipped)`);
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}

module.exports = { seedServices, services };
