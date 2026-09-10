#!/usr/bin/env node
// ============================================================================
// drive-to-b2-sync
//
// Google Meet auto-saves each live class recording to a Google Drive folder.
// This script (run standalone — NOT part of the Express app) watches that
// folder and, for every video file it hasn't seen before:
//
//   1. streams it straight from Drive into the private B2 bucket via an S3
//      multipart upload (never buffering the whole file in memory)
//   2. calls POST /api/internal/videos so it shows up in the course's drip
//      schedule (dayNumber auto-assigned as "existing count + 1")
//   3. records the Drive file id in a local JSON state file so re-runs skip it
//
// Modes:
//   node index.js            one pass, then exit
//   node index.js --loop     keep polling every POLL_INTERVAL_SECONDS
//   node index.js --once     alias for the default single pass
//
// Per-file errors are logged and skipped; the batch keeps going.
// ============================================================================

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

// ---------- config ----------
const {
  DRIVE_FOLDER_ID,
  SHARED_DRIVE_ID, // optional — set when the folder lives in a Shared Drive
  GOOGLE_SERVICE_ACCOUNT_KEY_FILE, // path to the service account JSON
  GOOGLE_SERVICE_ACCOUNT_KEY, // ...or the JSON itself, inline

  B2_S3_ENDPOINT, // e.g. s3.us-west-004.backblazeb2.com
  B2_REGION, // e.g. us-west-004
  B2_BUCKET,
  B2_KEY_ID,
  B2_APP_KEY,
  B2_KEY_PREFIX = "", // e.g. "web-dev/" — prepended to every object key

  COURSE_API_URL, // e.g. https://api.crixtechnology.com
  COURSE_API_INTERNAL_TOKEN,
  COURSE_ID, // the Mongo _id of the Course these recordings belong to

  // One Google Meet folder often holds recordings for several courses. These
  // narrow which files this run picks up, matched case-insensitively against
  // the Drive file name. INCLUDES: keep only names containing this substring.
  // EXCLUDES: drop names containing this one. Either can be a comma-separated
  // list (any match wins). Leave blank to take every video file.
  FILE_NAME_INCLUDES = "",
  FILE_NAME_EXCLUDES = "",

  STATE_FILE = path.join(__dirname, ".sync-state.json"),
  POLL_INTERVAL_SECONDS = "300",
  UPLOAD_PART_SIZE_MB = "16",
} = process.env;

const LOOP = process.argv.includes("--loop");

function requireEnv() {
  const missing = [];
  for (const k of [
    "DRIVE_FOLDER_ID", "B2_S3_ENDPOINT", "B2_REGION", "B2_BUCKET", "B2_KEY_ID",
    "B2_APP_KEY", "COURSE_API_URL", "COURSE_API_INTERNAL_TOKEN", "COURSE_ID",
  ]) {
    if (!process.env[k]) missing.push(k);
  }
  if (!GOOGLE_SERVICE_ACCOUNT_KEY_FILE && !GOOGLE_SERVICE_ACCOUNT_KEY) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_KEY");
  }
  if (missing.length) {
    console.error("Missing required env vars:\n  " + missing.join("\n  "));
    console.error("\nCopy .env.example to .env and fill it in.");
    process.exit(1);
  }
}

// ---------- state file ----------
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (e) {
    return { synced: {} };
  }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------- google drive ----------
function driveClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    ...(GOOGLE_SERVICE_ACCOUNT_KEY
      ? { credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_KEY) }
      : { keyFile: GOOGLE_SERVICE_ACCOUNT_KEY_FILE }),
  });
  return google.drive({ version: "v3", auth });
}

async function listVideoFiles(drive) {
  const files = [];
  let pageToken;
  const listParams = {
    q: `'${DRIVE_FOLDER_ID}' in parents and mimeType contains 'video/' and trashed = false`,
    fields: "nextPageToken, files(id, name, mimeType, size, createdTime, videoMediaMetadata/durationMillis)",
    orderBy: "createdTime",
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  };
  if (SHARED_DRIVE_ID) {
    listParams.corpora = "drive";
    listParams.driveId = SHARED_DRIVE_ID;
  }
  do {
    const res = await drive.files.list({ ...listParams, pageToken });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files.filter(matchesNameFilter).sort((a, b) => sortKey(a) - sortKey(b));
}

// Google Meet names recordings "... - 2026/07/09 18:45 IST - Recording".
// Order by that date so dayNumber matches the class chronology; fall back to
// Drive's createdTime when a name has no parseable date.
function sortKey(file) {
  const m = String(file.name || "").match(/(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return file.createdTime ? Date.parse(file.createdTime) : 0;
}

// FILE_NAME_INCLUDES / FILE_NAME_EXCLUDES, comma-separated, case-insensitive.
function matchesNameFilter(file) {
  const name = String(file.name || "").toLowerCase();
  const terms = (v) => v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const inc = terms(FILE_NAME_INCLUDES);
  const exc = terms(FILE_NAME_EXCLUDES);
  if (inc.length && !inc.some((t) => name.includes(t))) return false;
  if (exc.length && exc.some((t) => name.includes(t))) return false;
  return true;
}

// ---------- b2 (s3) ----------
function s3Client() {
  return new S3Client({
    endpoint: `https://${B2_S3_ENDPOINT}`,
    region: B2_REGION,
    credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APP_KEY },
  });
}

function makeKey(file) {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const prefix = B2_KEY_PREFIX.replace(/^\/+/, "");
  return `${prefix}${file.id}-${safeName}`;
}

async function streamDriveToB2(drive, s3, file, b2Key) {
  const dl = await drive.files.get(
    { fileId: file.id, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: B2_BUCKET,
      Key: b2Key,
      Body: dl.data, // Node Readable — lib-storage handles backpressure
      ContentType: file.mimeType || "video/mp4",
    },
    queueSize: 4,
    partSize: Math.max(5, Number(UPLOAD_PART_SIZE_MB)) * 1024 * 1024,
    leavePartsOnError: false,
  });
  upload.on("httpUploadProgress", (p) => {
    if (p.total) {
      const pct = ((p.loaded / p.total) * 100).toFixed(0);
      process.stdout.write(`\r    uploading ${pct}%   `);
    }
  });
  await upload.done();
  process.stdout.write("\r");
}

// ---------- course API ----------
const API_BASE = () => COURSE_API_URL.replace(/\/+$/, "");

// Fail fast on a bad token / COURSE_ID before uploading anything to B2.
async function preflight() {
  let res;
  try {
    res = await fetch(`${API_BASE()}/api/internal/preflight?courseId=${encodeURIComponent(COURSE_ID)}`, {
      headers: { Authorization: `Bearer ${COURSE_API_INTERNAL_TOKEN}` },
    });
  } catch (e) {
    throw new Error(`can't reach the course API at ${API_BASE()} (${e.message})`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`preflight failed (${res.status}): ${data.error || "unknown"}`);
  console.log(`Target course: "${(data.course && data.course.title) || COURSE_ID}" (${COURSE_ID})`);
}

// The file is already in B2 by the time this runs, so retry a few times on a
// transient API hiccup rather than forcing a full re-upload next pass.
async function registerVideo(file, b2Key) {
  const durationMs = file.videoMediaMetadata && file.videoMediaMetadata.durationMillis;
  const body = {
    course: COURSE_ID,
    title: file.name.replace(/\.(mp4|webm|mov|mkv|m4v|avi)$/i, ""),
    b2Key,
    sourceDriveFileId: file.id,
    durationSeconds: durationMs ? Math.round(Number(durationMs) / 1000) : undefined,
  };
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${API_BASE()}/api/internal/videos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${COURSE_API_INTERNAL_TOKEN}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      // 4xx other than 429 won't get better on retry — fail immediately.
      if (!res.ok && res.status < 500 && res.status !== 429) {
        throw new Error(`register rejected (${res.status}): ${data.error || "unknown"}`);
      }
      if (!res.ok) throw new Error(`register failed (${res.status}): ${data.error || "unknown"}`);
      return data.video;
    } catch (e) {
      lastErr = e;
      if (/rejected/.test(e.message) || attempt === 3) break;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

// ---------- one pass ----------
async function runOnce() {
  const state = loadState();
  const drive = driveClient();
  const s3 = s3Client();

  const files = await listVideoFiles(drive);
  const fresh = files.filter((f) => !state.synced[f.id]);
  console.log(`[${new Date().toISOString()}] ${files.length} video file(s) in folder, ${fresh.length} new.`);

  let ok = 0;
  let failed = 0;
  for (const file of fresh) {
    const b2Key = makeKey(file);
    try {
      console.log(`  → ${file.name} (${file.id})`);
      await streamDriveToB2(drive, s3, file, b2Key);
      const video = await registerVideo(file, b2Key);
      state.synced[file.id] = {
        b2Key,
        videoId: video && video._id,
        dayNumber: video && video.dayNumber,
        at: new Date().toISOString(),
      };
      saveState(state); // persist after every success so a crash mid-batch is safe
      console.log(`    done — day ${video && video.dayNumber}, video ${video && video._id}`);
      ok++;
    } catch (e) {
      console.error(`    FAILED: ${e.message}`);
      failed++;
      // no state write — it'll be retried next pass
    }
  }
  console.log(`  synced ${ok}, failed ${failed}.`);
}

// ---------- main ----------
async function main() {
  requireEnv();
  await preflight();
  if (!LOOP) {
    await runOnce();
    return;
  }
  const intervalMs = Math.max(30, Number(POLL_INTERVAL_SECONDS)) * 1000;
  console.log(`Loop mode — polling every ${intervalMs / 1000}s. Ctrl+C to stop.`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOnce();
    } catch (e) {
      console.error(`pass failed: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
