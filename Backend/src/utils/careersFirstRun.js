const { prisma } = require("../db");
const { seedCareers, addQuestions } = require("../scripts/seedCareers");
const roleBanks = require("../scripts/careerQuestionsRoles");
const { storageStatus } = require("./proctorStorage");

// The starter job roles and question bank, added once, by the server itself, the
// first time it starts on a database that has none — so a host without a shell
// (Render's free plan) needs no manual `npm run seed:careers`.
//
// "Once" is remembered in the settings table: after the first run this never
// adds anything again, so a role or question the admin later deletes stays
// deleted. A database that already has roles or questions (set up by hand, or
// by the seed script) is left exactly as it is.
//
// The new roles start OPEN only when webcam photos go to a storage bucket; on a
// server still keeping them on its own disk (lost on every deploy) they start
// closed, and the admin opens them in Admin → Job openings once storage is set.
const FLAG = "careers_seeded";

async function seedCareersOnce() {
  const done = await prisma.setting.findUnique({ where: { key: FLAG } });
  if (done) return { ran: false, reason: "already done" };

  const [roles, questions] = await Promise.all([prisma.jobOpening.count(), prisma.testQuestion.count()]);
  let result = { ran: false, reason: "roles or questions already exist" };
  if (roles === 0 && questions === 0) {
    const openingStatus = storageStatus().inBucket ? "open" : "closed";
    const added = await seedCareers({ openingStatus });
    result = { ran: true, openingStatus, ...added };
    console.log(`[careers] first run: added ${added.addedOpenings} job role(s) (${openingStatus}) and ${added.addedQuestions} test question(s).`);
  }
  // Recorded after the work, so a run that failed half-way tries again next start.
  await prisma.setting.upsert({
    where: { key: FLAG },
    create: { key: FLAG, value: { at: new Date().toISOString(), ...result } },
    update: {},
  });
  return result;
}

// The question banks for the free-internship roles (scripts/careerQuestionsRoles.js:
// frontend, python, web fundamentals, AI/ML, more data-science questions and the
// foundation general sections), added once to a database that already had its
// starter bank. Runs after seedCareersOnce, so on a brand-new database (which
// the starter seed already filled with these) it adds nothing. Questions already
// in the bank are skipped, and after this has run once, nothing is re-added —
// one the admin deletes stays deleted.
const ROLE_BANKS_FLAG = "career_role_banks_added";

async function addRoleBanksOnce() {
  const done = await prisma.setting.findUnique({ where: { key: ROLE_BANKS_FLAG } });
  if (done) return { ran: false, reason: "already done" };
  const addedQuestions = await addQuestions(roleBanks);
  if (addedQuestions) console.log(`[careers] added ${addedQuestions} question(s) for the free-internship roles.`);
  await prisma.setting.upsert({
    where: { key: ROLE_BANKS_FLAG },
    create: { key: ROLE_BANKS_FLAG, value: { at: new Date().toISOString(), addedQuestions } },
    update: {},
  });
  return { ran: true, addedQuestions };
}

// What the server runs on start: the first-run seed, then the later additions.
const careersStartup = () => seedCareersOnce().then(addRoleBanksOnce);

module.exports = { seedCareersOnce, addRoleBanksOnce, careersStartup, FLAG, ROLE_BANKS_FLAG };
