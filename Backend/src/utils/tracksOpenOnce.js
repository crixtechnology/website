const { prisma } = require("../db");
const { PROGRAM_WHERE } = require("./programs");

// A track's status used to mean "on sale online", and every apply-only track
// (no price) was stored as closed, though the website showed it as open. Now
// status is Admin's Open/Closed switch for taking applications, so on its
// first start after that change the server opens every existing track once.
// That keeps the website showing what it shows today. Render has no shell,
// so this runs as a startup step, not a manual script.
//
// "Once" is remembered in the settings table: after the first run this never
// touches the tracks again, so a track the admin closes later stays closed.
const FLAG = "tracks_status_is_open_switch";

async function openTracksOnce() {
  const done = await prisma.setting.findUnique({ where: { key: FLAG } });
  if (done) return { ran: false, reason: "already done" };

  const { count } = await prisma.course.updateMany({ where: { ...PROGRAM_WHERE, status: "closed" }, data: { status: "open" } });
  console.log(`[tracks] Open/Closed is now the applications switch: opened ${count} track(s).`);
  // Recorded after the work, so a run that failed half-way tries again next start.
  await prisma.setting.upsert({
    where: { key: FLAG },
    create: { key: FLAG, value: { at: new Date().toISOString(), opened: count } },
    update: {},
  });
  return { ran: true, opened: count };
}

module.exports = { openTracksOnce, FLAG };
