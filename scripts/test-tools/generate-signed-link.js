#!/usr/bin/env node
// generate-signed-link.js <b2Key> [ttlSeconds]
//
// Builds a signed URL using the exact same HMAC scheme as the Cloudflare
// Worker and the Express app, so you can paste it into a browser and test
// the Worker in isolation:
//
//   token = base64url( HMAC-SHA256(`${b2Key}:${exp}`, SIGNING_SECRET) )
//   <VIDEO_GATEWAY_URL>/videos/<b2Key>?exp=<exp>&token=<token>
//
// Works against `wrangler dev` locally — set VIDEO_GATEWAY_URL=http://localhost:8787
//
//   node generate-signed-link.js web-dev/day-1-intro.mp4
//   node generate-signed-link.js web-dev/day-1-intro.mp4 60

require("dotenv").config();
const crypto = require("crypto");

const SIGNING_SECRET = process.env.SIGNING_SECRET;
const GATEWAY = process.env.VIDEO_GATEWAY_URL || "http://localhost:8787";

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function main() {
  const [, , b2Key, ttlArg] = process.argv;
  if (!b2Key) {
    console.error("usage: node generate-signed-link.js <b2Key> [ttlSeconds]");
    process.exit(1);
  }
  if (!SIGNING_SECRET) {
    console.error("Missing SIGNING_SECRET — copy .env.example to .env and fill it in.");
    console.error("(It must match the Worker's SIGNING_SECRET and Backend/.env's SIGNING_SECRET.)");
    process.exit(1);
  }

  const ttl = Number(ttlArg || 3600);
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const token = base64url(crypto.createHmac("sha256", SIGNING_SECRET).update(`${b2Key}:${exp}`).digest());
  const encodedKey = b2Key.split("/").map(encodeURIComponent).join("/");
  const url = `${GATEWAY.replace(/\/+$/, "")}/videos/${encodedKey}?exp=${exp}&token=${encodeURIComponent(token)}`;

  console.log(`\nexpires: ${new Date(exp * 1000).toISOString()}  (in ${ttl}s)\n`);
  console.log(url + "\n");
}

main();
