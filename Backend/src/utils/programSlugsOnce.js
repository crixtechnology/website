const { prisma } = require("../db");
const { PROGRAM_WHERE, programSlugBase, freeSlug } = require("./programs");

// Program addresses used to come from the first title a track was given, with
// "-1", "-2", "-3" added for each further duration of a domain — so the live
// site had /programs/web-development-2 (a 6-month MERN track) and
// /programs/android-development (titled "Data Science / Analytics"). New
// programs now get "<domain>-<length>" addresses (utils/programs.js
// programSlugBase); on its first start after that change, the server moves
// every existing program to one too, once.
//
// Every old address is kept in course_slug_redirects, so links already shared
// or indexed still open the program, which then shows its new address.
// Render has no shell, so this is a startup step, not a manual script; "once"
// is remembered in the settings table, so an address never changes again.
const FLAG = "program_slugs_cleaned";

async function cleanProgramSlugsOnce() {
  const done = await prisma.setting.findUnique({ where: { key: FLAG } });
  if (done) return { ran: false, reason: "already done" };

  const programs = await prisma.course.findMany({
    where: PROGRAM_WHERE,
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, title: true, group: true, durationDays: true },
  });
  const moved = [];
  for (const p of programs) {
    const base = programSlugBase(p);
    if (p.slug === base) continue;
    const slug = await freeSlug(base, { exceptCourseId: p.id });
    if (slug === p.slug) continue;
    await prisma.$transaction([
      prisma.courseSlugRedirect.upsert({
        where: { oldSlug: p.slug },
        create: { oldSlug: p.slug, courseId: p.id },
        update: { courseId: p.id },
      }),
      prisma.course.update({ where: { id: p.id }, data: { slug } }),
    ]);
    moved.push({ from: p.slug, to: slug });
  }
  if (moved.length) console.log(`[programs] gave ${moved.length} program(s) a clean address: ${moved.map((m) => `${m.from} -> ${m.to}`).join(", ")}`);
  // Recorded after the work, so a run that failed half-way tries again next start.
  await prisma.setting.upsert({
    where: { key: FLAG },
    create: { key: FLAG, value: { at: new Date().toISOString(), moved } },
    update: {},
  });
  return { ran: true, moved };
}

module.exports = { cleanProgramSlugsOnce, FLAG };
