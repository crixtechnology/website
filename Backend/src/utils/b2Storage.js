// Deleting a recorded video's FILE from the private Backblaze B2 bucket, over
// B2's S3-compatible API. The only thing the backend ever does to the bucket:
// uploads come from scripts/drive-to-b2-sync and playback is served by the
// Cloudflare Worker (both have their own credentials).
//
//   B2_S3_ENDPOINT   e.g. s3.us-east-005.backblazeb2.com
//   B2_REGION        e.g. us-east-005
//   B2_BUCKET
//   B2_KEY_ID / B2_APP_KEY
//
// Use a dedicated application key restricted to this bucket with just the
// `listFiles` and `deleteFiles` capabilities — not the master key, and not the
// sync's upload key. With any of these unset, isB2Configured() is false and the
// admin "delete file too" action is refused with a clear error (see routes/videos.js).

const OPERATION_TIMEOUT_MS = 20_000;

function b2Config() {
  const { B2_S3_ENDPOINT, B2_REGION, B2_BUCKET, B2_KEY_ID, B2_APP_KEY } = process.env;
  if (![B2_S3_ENDPOINT, B2_REGION, B2_BUCKET, B2_KEY_ID, B2_APP_KEY].every(Boolean)) return null;
  return { endpoint: B2_S3_ENDPOINT, region: B2_REGION, bucket: B2_BUCKET, keyId: B2_KEY_ID, appKey: B2_APP_KEY };
}

function isB2Configured() {
  return !!b2Config();
}

let cached = { key: null, client: null };
function clientFor(cfg) {
  // Required lazily: the SDK is sizeable and only admin video deletes need it.
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

// Permanently removes EVERY version of one object (B2 keeps old versions and
// hide markers after a plain delete, which would leave the storage in use).
// Deletes only the exact key: the listing is prefix-based, so a longer key
// that merely starts with this one is filtered out. Returns { removed } = how
// many versions/markers were deleted (0 if the file was already gone).
// Throws on any failure, so the caller can keep the video's row.
async function deleteObjectAllVersions(key) {
  const cfg = b2Config();
  if (!cfg) throw new Error("Backblaze isn't configured on this server");
  if (typeof key !== "string" || !key.trim()) throw new Error("This video has no storage key");

  const { ListObjectVersionsCommand, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
  const s3 = clientFor(cfg);

  const targets = [];
  let keyMarker;
  let versionMarker;
  do {
    const page = await s3.send(
      new ListObjectVersionsCommand({ Bucket: cfg.bucket, Prefix: key, KeyMarker: keyMarker, VersionIdMarker: versionMarker }),
      withTimeout()
    );
    for (const v of [...(page.Versions || []), ...(page.DeleteMarkers || [])]) {
      if (v.Key === key) targets.push({ Key: v.Key, VersionId: v.VersionId });
    }
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    versionMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
  } while (keyMarker);

  for (let i = 0; i < targets.length; i += 1000) {
    const batch = targets.slice(i, i + 1000);
    const res = await s3.send(
      new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: batch, Quiet: false } }),
      withTimeout()
    );
    if (res.Errors && res.Errors.length) {
      const first = res.Errors[0];
      throw new Error(`${first.Code || "Error"}${first.Message ? `: ${first.Message}` : ""}`);
    }
  }
  return { removed: targets.length };
}

module.exports = { isB2Configured, deleteObjectAllVersions };
