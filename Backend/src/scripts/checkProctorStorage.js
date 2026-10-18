// Checks that the aptitude-test webcam photo storage works, end to end, with
// the server's own code (utils/proctorStorage.js): saves a tiny test photo,
// reads it back, deletes it, and makes sure it's gone.
//
//   npm run check:proctor-storage
//
// Run it after setting PROCTOR_* in Backend/.env (locally) or on the host
// (Render → Shell), before candidates take tests. It touches nothing but its
// own test file, and never prints a key.
require("dotenv").config();
const { saveSnapshot, readSnapshot, deleteSnapshot } = require("../utils/proctorStorage");

// The smallest valid JPEG: a 1x1 grey pixel.
const TEST_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);

async function main() {
  const { PROCTOR_BUCKET, PROCTOR_KEY_ID, PROCTOR_APP_KEY } = process.env;
  const endpoint = process.env.PROCTOR_S3_ENDPOINT || process.env.B2_S3_ENDPOINT;
  const region = process.env.PROCTOR_REGION || process.env.B2_REGION;
  const missing = Object.entries({ PROCTOR_BUCKET, PROCTOR_KEY_ID, PROCTOR_APP_KEY, "PROCTOR_S3_ENDPOINT (or B2_S3_ENDPOINT)": endpoint, "PROCTOR_REGION (or B2_REGION)": region })
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.log(`Not set: ${missing.join(", ")}.`);
    console.log("Without them, photos are saved on this server's own disk — fine locally, but lost on every deploy on Render.");
    process.exit(1);
  }
  if (/^https?:\/\//i.test(endpoint)) {
    console.log(`The endpoint must be written without "https://" — e.g. s3.us-east-005.backblazeb2.com. Fix PROCTOR_S3_ENDPOINT and run this again.`);
    process.exit(1);
  }
  console.log(`Bucket "${PROCTOR_BUCKET}" at ${endpoint} (${region}).`);

  let key;
  const step = async (label, fn) => {
    try {
      const out = await fn();
      console.log(`  ✓ ${label}`);
      return out;
    } catch (e) {
      console.log(`  ✗ ${label}: ${e.name || "Error"} — ${e.message}`);
      if (key) await deleteSnapshot(key).catch(() => {});
      throw e;
    }
  };

  key = await step("save a test photo", () => saveSnapshot("storage-check", TEST_JPEG));
  if (!key.startsWith("s3:")) throw new Error(`saved to "${key}", not the bucket — check the PROCTOR_* values`);
  await step("read it back", async () => {
    const back = await readSnapshot(key);
    if (!Buffer.isBuffer(back) || !back.equals(TEST_JPEG)) throw new Error("what came back isn't the photo that was saved");
  });
  await step("delete it", () => deleteSnapshot(key));
  await step("confirm it's gone", async () => {
    const still = await readSnapshot(key).then(() => true, () => false);
    if (still) throw new Error("the photo can still be read after deleting — the key may be missing the deleteFiles capability, or the bucket keeps old versions");
  });
  console.log("All good: aptitude-test webcam photos will be stored in this bucket.");
}

main().catch(() => {
  console.log("\nThe bucket isn't working yet. Common causes: a typo in the bucket name, endpoint or region; the key isn't");
  console.log("allowed to use this bucket; or the key has read-only access (it needs Read and Write).");
  process.exit(1);
});
