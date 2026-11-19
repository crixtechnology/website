const { prisma } = require("../db");
const { PROGRAM_WHERE } = require("./programs");
const { PROGRAM_CONTENT, OLD_DESCS, TAG_FIXES } = require("./programContent");

// Gives every Training + Internship program its own per-length content
// (utils/programContent.js), once. Render has no shell, so this runs as a
// startup step, not a manual script.
//
// Only programs still carrying the old shared description are changed: one an
// admin has already rewritten in Admin is left as it is. Price, stipend,
// duration, eligibility and every other field are never touched. "Once" is
// remembered in the settings table, so later Admin edits stick.
const FLAG = "program_content_per_length_v1";

async function applyProgramContentOnce() {
  const done = await prisma.setting.findUnique({ where: { key: FLAG } });
  if (done) return { ran: false, reason: "already done" };

  const rows = await prisma.course.findMany({
    where: { ...PROGRAM_WHERE, slug: { in: Object.keys(PROGRAM_CONTENT) } },
    select: { id: true, slug: true, desc: true, tag: true },
  });
  const updated = [];
  const skipped = [];
  for (const row of rows) {
    if (!OLD_DESCS.includes(row.desc)) {
      skipped.push(row.slug);
      continue;
    }
    const c = PROGRAM_CONTENT[row.slug];
    const data = {
      desc: c.desc,
      points: c.points,
      skills: c.skills,
      responsibilities: c.responsibilities,
      outcomes: c.outcomes,
      audience: c.audience,
      prerequisites: c.prerequisites,
      faqs: c.faqs,
    };
    if (c.title) data.title = c.title;
    if (Object.prototype.hasOwnProperty.call(TAG_FIXES, row.tag)) data.tag = TAG_FIXES[row.tag];
    await prisma.course.update({ where: { id: row.id }, data });
    updated.push(row.slug);
  }
  console.log(`[programs] per-length content: updated ${updated.length} program(s)` + (skipped.length ? `, left ${skipped.length} edited in Admin as they are (${skipped.join(", ")})` : "") + ".");
  // Recorded after the work, so a run that failed half-way tries again next start.
  await prisma.setting.upsert({
    where: { key: FLAG },
    create: { key: FLAG, value: { at: new Date().toISOString(), updated, skipped } },
    update: {},
  });
  return { ran: true, updated, skipped };
}

module.exports = { applyProgramContentOnce, FLAG };
