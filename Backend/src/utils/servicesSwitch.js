const { prisma } = require("../db");
const { seedServices } = require("../scripts/seedServices");

// The switch to the 12-service IT list (scripts/seedServices.js), done once by
// the server itself on its first start after the change — so a host without a
// shell (Render's free plan) needs no manual `seedServices.js --replace`.
//
// "Once" is remembered in the settings table: after the first run this never
// touches the services again, so whatever the admin later edits, hides or
// deletes in Admin → Services stays that way.
const FLAG = "services_v2_applied";

async function switchServicesOnce() {
  const done = await prisma.setting.findUnique({ where: { key: FLAG } });
  if (done) return { ran: false, reason: "already done" };

  const result = { ran: true, ...(await seedServices({ replace: true })) };
  console.log(`[services] switched to the new list: ${result.created} created, ${result.updated} updated, ${result.hidden} old ones set inactive.`);
  // Recorded after the work, so a run that failed half-way tries again next start.
  await prisma.setting.upsert({
    where: { key: FLAG },
    create: { key: FLAG, value: { at: new Date().toISOString(), ...result } },
    update: {},
  });
  return result;
}

module.exports = { switchServicesOnce, FLAG };
