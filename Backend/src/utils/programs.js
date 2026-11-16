// Courses were dropped: the only programs the site offers are Training +
// Internship tracks — Course rows of type "internship" (they keep the live
// classes and recorded lectures). Rows of the old "course" type stay in the
// database untouched but are treated as not existing anywhere: not listed,
// not bought, not opened, and no new ones can be made.
const PROGRAM_TYPE = "internship";
const PROGRAM_WHERE = { type: PROGRAM_TYPE };
const isProgram = (course) => !!course && course.type === PROGRAM_TYPE;
const COURSES_DROPPED = "Courses are no longer offered — only Training + Internship tracks.";

// A program's name with its length ("MERN Stack Developer — 3 months"). One
// domain is sold in 1 / 2 / 3 / 6 month versions under the same title, so a
// receipt or an admin list showing the bare title can't tell them apart. Same
// as programTitle() in Frontend/src/hooks/usePageMeta.js.
const DURATION_NAMES = { 15: "15 days", 30: "1 month", 60: "2 months", 90: "3 months", 180: "6 months" };
function programTitle(course) {
  if (!course || !course.title) return "";
  const n = Number(course.durationDays);
  if (!Number.isFinite(n) || n <= 0) return course.title;
  const length = DURATION_NAMES[n] || `${n} ${n === 1 ? "day" : "days"}`;
  const already = new RegExp(`\\b(${String(n / 30)}[\\s-]*months?|${n}[\\s-]*days?)\\b`, "i");
  return already.test(course.title) ? course.title : `${course.title} — ${length}`;
}

// ---------- program addresses (/programs/<slug>) ----------
const slugify = (text) => String(text || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// The address a program should have: its domain (Admin's "Domain group", else
// its title) and its length — "mern-stack-developer-3-months". Before this,
// a domain's durations got "-1", "-2", "-3" on the end, and a renamed track
// kept its first title's address ("android-development" for Data Science).
function programSlugBase({ title, group, durationDays } = {}) {
  const name = slugify(String(group || "").trim() || title) || "program";
  const n = Number(durationDays);
  if (!Number.isFinite(n) || n <= 0) return name;
  const length = n % 30 === 0 ? `${n / 30}-month${n === 30 ? "" : "s"}` : `${n}-days`;
  return name.endsWith(length) ? name : `${name}-${length}`;
}

// A free address from `base`: base, base-2, base-3, … — one no other program
// uses now or used before (old addresses stay reserved for their redirects).
// `exceptCourseId`: the program's own current/old addresses count as free.
async function freeSlug(base, { db = null, exceptCourseId = null } = {}) {
  const client = db || require("../db").prisma;
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [course, redirect] = await Promise.all([
      client.course.findUnique({ where: { slug }, select: { id: true } }),
      client.courseSlugRedirect.findUnique({ where: { oldSlug: slug }, select: { courseId: true } }),
    ]);
    const mine = (row) => row && exceptCourseId && (row.id || row.courseId) === exceptCourseId;
    if ((!course || mine(course)) && (!redirect || mine(redirect))) return slug;
  }
}

// A program by its address — or by an address it used to have, so old links
// keep working. The caller compares `course.slug` with what was asked for and
// sends the visitor to the current address. `include` as for findUnique.
async function findProgramBySlug(slug, include) {
  const { prisma } = require("../db");
  const s = String(slug || "");
  if (!s) return null;
  const found = await prisma.course.findUnique({ where: { slug: s }, ...(include ? { include } : {}) });
  if (found) return found;
  const moved = await prisma.courseSlugRedirect.findUnique({ where: { oldSlug: s } });
  if (!moved) return null;
  return prisma.course.findUnique({ where: { id: moved.courseId }, ...(include ? { include } : {}) });
}

module.exports = { PROGRAM_TYPE, PROGRAM_WHERE, isProgram, COURSES_DROPPED, programTitle, slugify, programSlugBase, freeSlug, findProgramBySlug };
