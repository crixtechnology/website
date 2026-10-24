// Where the aptitude test's webcam snapshots live. The image FILE goes to file
// storage; the database only ever holds its key (TestSnapshot.storageKey).
//
// Two backends, picked by environment:
//   - An S3-compatible bucket (Backblaze B2, like the lecture videos) when
//     PROCTOR_BUCKET, PROCTOR_KEY_ID and PROCTOR_APP_KEY are set. The endpoint
//     and region come from PROCTOR_S3_ENDPOINT / PROCTOR_REGION, falling back
//     to B2_S3_ENDPOINT / B2_REGION. Use a PRIVATE bucket and a key limited to
//     it (readFiles + writeFiles) — never the lecture bucket's key.
//   - Otherwise the local disk: PROCTOR_LOCAL_DIR, default Backend/storage/proctoring
//     (git-ignored). Fine for development; on a host whose disk is wiped on
//     every deploy (e.g. Render's free tier) set up the bucket instead.
//
// Snapshots are only ever read back through the admin API (routes/adminCareers.js).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OPERATION_TIMEOUT_MS = 20_000;
const LOCAL_PREFIX = "local:";
const S3_PREFIX = "s3:";
// A snapshot row whose image is still being uploaded (routes/aptitudeTest.js
// reserves the row first, so two uploads can't both slip past the rate limit).
// Nothing is stored under it yet.
const PENDING_PREFIX = "pending:";

function bucketConfig() {
  const { PROCTOR_BUCKET, PROCTOR_KEY_ID, PROCTOR_APP_KEY } = process.env;
  const endpoint = process.env.PROCTOR_S3_ENDPOINT || process.env.B2_S3_ENDPOINT;
  const region = process.env.PROCTOR_REGION || process.env.B2_REGION;
  if (![PROCTOR_BUCKET, PROCTOR_KEY_ID, PROCTOR_APP_KEY, endpoint, region].every(Boolean)) return null;
  return { bucket: PROCTOR_BUCKET, keyId: PROCTOR_KEY_ID, appKey: PROCTOR_APP_KEY, endpoint, region };
}

// One line for the server log at startup, so a missing or mistyped setting on
// the host shows in its logs (Render → Logs) without needing a shell.
// Returns { inBucket, message }; never includes a key.
function storageStatus() {
  const endpoint = process.env.PROCTOR_S3_ENDPOINT || process.env.B2_S3_ENDPOINT || "";
  if (/^https?:\/\//i.test(endpoint)) {
    return { inBucket: false, message: `⚠ Webcam photos: the storage endpoint must be written without "https://" (e.g. s3.us-east-005.backblazeb2.com) — uploads will fail until it's fixed.` };
  }
  const cfg = bucketConfig();
  if (cfg) return { inBucket: true, message: `Webcam photos: stored in bucket "${cfg.bucket}" (${cfg.region}).` };
  const someSet = ["PROCTOR_BUCKET", "PROCTOR_KEY_ID", "PROCTOR_APP_KEY"].some((k) => process.env[k]);
  return {
    inBucket: false,
    message: someSet
      ? "⚠ Webcam photos: some PROCTOR_* settings are missing (bucket, key id, app key, endpoint, region), so photos are kept on this server's disk instead — on a host like Render they're lost on every deploy."
      : "Webcam photos: kept on this server's disk (no PROCTOR_* bucket set) — fine for local development; on a host like Render they're lost on every deploy.",
  };
}

function localDir() {
  return process.env.PROCTOR_LOCAL_DIR || path.join(__dirname, "..", "..", "storage", "proctoring");
}

let cached = { key: null, client: null };
function clientFor(cfg) {
  // Required lazily, like utils/b2Storage.js: the SDK is sizeable.
  const { S3Client } = require("@aws-sdk/client-s3");
  const key = `${cfg.endpoint}|${cfg.region}|${cfg.keyId}|${cfg.appKey}`;
  if (cached.key !== key) {
    cached = {
      key,
      client: new S3Client({
        endpoint: `https://${cfg.endpoint}`,
        region: cfg.region,
        credentials: { accessKeyId: cfg.keyId, secretAccessKey: cfg.appKey },
      }),
    };
  }
  return cached.client;
}
const withTimeout = () => ({ abortSignal: AbortSignal.timeout(OPERATION_TIMEOUT_MS) });

// Only ids we generated ourselves ever reach a path, but be strict anyway.
const safeSegment = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, "");

// Stores one JPEG for an attempt and returns the key to save in the database.
async function saveSnapshot(attemptId, buffer) {
  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.jpg`;
  const relative = `proctoring/${safeSegment(attemptId)}/${name}`;
  const cfg = bucketConfig();
  if (cfg) {
    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    await clientFor(cfg).send(
      new PutObjectCommand({ Bucket: cfg.bucket, Key: relative, Body: buffer, ContentType: "image/jpeg" }),
      withTimeout()
    );
    return S3_PREFIX + relative;
  }
  const file = path.join(localDir(), safeSegment(attemptId), name);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, buffer);
  return LOCAL_PREFIX + `${safeSegment(attemptId)}/${name}`;
}

// Stores a candidate's CV (a PDF) for an application, in the same private
// storage as the snapshots, and returns its key. readSnapshot / deleteSnapshot
// read and delete it like any snapshot.
async function saveCv(applicationId, buffer) {
  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.pdf`;
  const folder = `cv-${safeSegment(applicationId)}`;
  const cfg = bucketConfig();
  if (cfg) {
    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    const relative = `cvs/${safeSegment(applicationId)}/${name}`;
    await clientFor(cfg).send(
      new PutObjectCommand({ Bucket: cfg.bucket, Key: relative, Body: buffer, ContentType: "application/pdf" }),
      withTimeout()
    );
    return S3_PREFIX + relative;
  }
  const file = path.join(localDir(), folder, name);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, buffer);
  return LOCAL_PREFIX + `${folder}/${name}`;
}

// Reads a stored snapshot back as a Buffer (throws if it is gone).
async function readSnapshot(storageKey) {
  const key = String(storageKey || "");
  if (key.startsWith(S3_PREFIX)) {
    const cfg = bucketConfig();
    if (!cfg) throw new Error("Snapshot storage isn't configured on this server");
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const out = await clientFor(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key.slice(S3_PREFIX.length) }), withTimeout());
    return Buffer.from(await out.Body.transformToByteArray());
  }
  if (key.startsWith(LOCAL_PREFIX)) {
    const [attempt, name] = key.slice(LOCAL_PREFIX.length).split("/");
    return fs.promises.readFile(path.join(localDir(), safeSegment(attempt), path.basename(String(name || ""))));
  }
  throw new Error("Unknown snapshot location");
}

// Deletes a stored snapshot. One that is already gone counts as deleted.
async function deleteSnapshot(storageKey) {
  const key = String(storageKey || "");
  if (key.startsWith(PENDING_PREFIX)) return; // nothing was ever stored
  if (key.startsWith(S3_PREFIX)) {
    const cfg = bucketConfig();
    if (!cfg) throw new Error("Snapshot storage isn't configured on this server");
    const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
    await clientFor(cfg).send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key.slice(S3_PREFIX.length) }), withTimeout());
    return;
  }
  if (key.startsWith(LOCAL_PREFIX)) {
    const [attempt, name] = key.slice(LOCAL_PREFIX.length).split("/");
    const dir = path.join(localDir(), safeSegment(attempt));
    try {
      await fs.promises.unlink(path.join(dir, path.basename(String(name || ""))));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    // The attempt's folder goes too once it is empty.
    await fs.promises.rmdir(dir).catch(() => {});
    return;
  }
  throw new Error("Unknown snapshot location");
}

module.exports = { PENDING_PREFIX, storageStatus, saveSnapshot, saveCv, readSnapshot, deleteSnapshot };
