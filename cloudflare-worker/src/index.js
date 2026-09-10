import { AwsClient } from "aws4fetch";

// Crix video delivery gateway.
//
// The ONLY thing allowed to read the private Backblaze B2 bucket. The bucket
// stays private; the B2 credentials live only in this Worker's secrets and
// never reach a browser.
//
// Request shape (minted by the Express app / test tools — see
// Backend/src/utils/signedVideoUrl.js):
//
//   GET /videos/<b2Key>?exp=<unixSeconds>&token=<base64url-hmac>
//
//   token = base64url( HMAC-SHA256(`${b2Key}:${exp}`, SIGNING_SECRET) )
//
// If the token is valid and exp hasn't passed, the Worker signs a private S3
// GET to B2 with aws4fetch, forwards the Range header (so seeking works) and
// streams the response straight back.

const enc = new TextEncoder();

function base64url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, enc.encode(message));
}

// Length-independent constant-time-ish string compare.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function corsHeaders(env) {
  const origin = env.ALLOW_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
  };
}

function deny(env, status, message) {
  return new Response(message + "\n", {
    status,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store", ...corsHeaders(env) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return deny(env, 405, "Method not allowed");
    }
    if (!url.pathname.startsWith("/videos/")) {
      return deny(env, 404, "Not found");
    }

    // /videos/<b2Key> — key may contain "/" separators; decode each segment.
    // new URL() has already collapsed any "." / ".." path segments and
    // normalised the pathname, so `rawKey` can't traverse out of /videos/.
    const rawKey = url.pathname.slice("/videos/".length);
    if (!rawKey) return deny(env, 404, "Not found");
    let b2Key;
    try {
      b2Key = rawKey.split("/").map(decodeURIComponent).join("/");
    } catch (e) {
      return deny(env, 400, "Bad key");
    }
    // Defence in depth — a valid HMAC token is already required, and our
    // signer only ever produces real object keys, but reject anything with a
    // "." / ".." segment or a backslash before it reaches B2.
    if (b2Key.split("/").some((seg) => seg === "" || seg === "." || seg === "..") || b2Key.includes("\\")) {
      return deny(env, 400, "Bad key");
    }

    const exp = url.searchParams.get("exp");
    const token = url.searchParams.get("token");
    if (!exp || !token) return deny(env, 403, "Missing exp or token");

    const expNum = Number(exp);
    if (!Number.isFinite(expNum) || !Number.isInteger(expNum)) return deny(env, 403, "Bad exp");
    if (expNum * 1000 < Date.now()) return deny(env, 403, "Link expired");

    if (!env.SIGNING_SECRET) return deny(env, 500, "Worker not configured");
    const expected = base64url(await hmacSha256(env.SIGNING_SECRET, `${b2Key}:${expNum}`));
    if (!safeEqual(expected, token)) return deny(env, 403, "Invalid token");

    // ---- valid: proxy to B2's S3-compatible endpoint ----
    if (!env.B2_KEY_ID || !env.B2_APP_KEY) return deny(env, 500, "Worker not configured");

    const aws = new AwsClient({
      accessKeyId: env.B2_KEY_ID,
      secretAccessKey: env.B2_APP_KEY,
      service: "s3",
      region: env.B2_REGION,
    });

    const encodedKey = b2Key.split("/").map(encodeURIComponent).join("/");
    const b2Url = `https://${env.B2_S3_ENDPOINT}/${env.B2_BUCKET}/${encodedKey}`;

    // Presign the S3 GET as a query-string signature (signQuery), then do a
    // plain fetch. Preferred over header-based signing on purpose: the Workers
    // runtime adds/reorders request headers after signing, which breaks a
    // SigV4 Authorization-header signature — a query signature only covers the
    // URL + host, so it survives. The Range header is forwarded separately
    // (S3 does not require it to be signed).
    const forwardHeaders = new Headers();
    const range = request.headers.get("Range");
    if (range) forwardHeaders.set("Range", range);

    let upstream;
    try {
      const signed = await aws.sign(b2Url, {
        method: request.method,
        aws: { signQuery: true },
      });
      upstream = await fetch(signed.url, { method: request.method, headers: forwardHeaders });
    } catch (e) {
      console.log("upstream fetch threw:", e && e.message);
      return deny(env, 502, "Upstream fetch failed");
    }

    if (upstream.status === 401 || upstream.status === 403) {
      return deny(env, 502, "B2 rejected the request (check Worker B2 credentials / bucket name)");
    }
    if (upstream.status === 404) return deny(env, 404, "Video not found");
    // 200 full, 206 range, 304 not-modified, 416 range-not-satisfiable are all
    // fine to pass through. Anything else 4xx/5xx from B2 is an upstream fault.
    if (![200, 206, 304, 416].includes(upstream.status)) {
      console.log("unexpected B2 status:", upstream.status);
      return deny(env, 502, "Upstream error");
    }

    const headers = new Headers(corsHeaders(env));
    for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has("Content-Type")) headers.set("Content-Type", "video/mp4");
    if (!headers.has("Accept-Ranges")) headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=0, no-store");

    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};
