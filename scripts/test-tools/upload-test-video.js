#!/usr/bin/env node
// upload-test-video.js <path> [key]
//
// Uploads one local file straight into the private B2 bucket (S3 multipart,
// streamed from disk). Use it to get a real object into the bucket so you
// can test the Worker gateway with generate-signed-link.js.
//
//   node upload-test-video.js ./sample.mp4
//   node upload-test-video.js ./sample.mp4 web-dev/day-1-intro.mp4

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

const { B2_S3_ENDPOINT, B2_REGION, B2_BUCKET, B2_KEY_ID, B2_APP_KEY } = process.env;

async function main() {
  const [, , filePath, keyArg] = process.argv;
  if (!filePath) {
    console.error("usage: node upload-test-video.js <path> [key]");
    process.exit(1);
  }
  for (const k of ["B2_S3_ENDPOINT", "B2_REGION", "B2_BUCKET", "B2_KEY_ID", "B2_APP_KEY"]) {
    if (!process.env[k]) {
      console.error(`Missing ${k} — copy .env.example to .env and fill it in.`);
      process.exit(1);
    }
  }
  if (!fs.existsSync(filePath)) {
    console.error(`No such file: ${filePath}`);
    process.exit(1);
  }

  const key = keyArg || path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".webm" ? "video/webm" : ext === ".mov" ? "video/quicktime" : "video/mp4";

  const s3 = new S3Client({
    endpoint: `https://${B2_S3_ENDPOINT}`,
    region: B2_REGION,
    credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APP_KEY },
  });

  const upload = new Upload({
    client: s3,
    params: { Bucket: B2_BUCKET, Key: key, Body: fs.createReadStream(filePath), ContentType: contentType },
    queueSize: 4,
    partSize: 16 * 1024 * 1024,
  });
  upload.on("httpUploadProgress", (p) => {
    if (p.total) process.stdout.write(`\ruploading ${((p.loaded / p.total) * 100).toFixed(0)}%   `);
  });
  await upload.done();

  console.log(`\nuploaded → s3://${B2_BUCKET}/${key}`);
  console.log(`b2Key: ${key}`);
  console.log(`\nnext: node generate-signed-link.js "${key}"`);
}

main().catch((e) => {
  console.error("\n" + (e.message || e));
  process.exit(1);
});
