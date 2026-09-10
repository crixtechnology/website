# Recorded video delivery (drip schedule)

Paid, logged-in students get one recorded lecture unlocked per day, counting
from their own enrollment date. Videos are recorded on Google Meet (which
auto-saves to a Google Drive folder), synced into a **private** Backblaze B2
bucket, and streamed to the browser through a Cloudflare Worker that is the
only thing allowed to read the bucket.

```
Google Meet ──auto──► Google Drive folder
                           │
        scripts/drive-to-b2-sync (service account, readonly Drive)
                           │  multipart stream, no full-file buffering
                           ▼
             Backblaze B2  (private bucket, never public)
                           ▲
                           │  aws4fetch-signed S3 GET, Range forwarded
             cloudflare-worker/  (holds B2 creds in secrets)
                           ▲
                           │  GET /videos/<b2Key>?exp=&token=   (HMAC, 6h)
   Frontend <video>  ◄──── Backend  GET /api/courses/:id/videos/:vid/play-url
                                    (re-checks auth + enrollment + unlock day)
```

Nothing here transcodes. Playback is plain HTTP Range on the original file.

---

## Pieces

| Path | What it is | Deploys |
|---|---|---|
| `Backend/src/models/Video.js`, `routes/videos.js`, `middleware/requireEnrollment.js`, `middleware/requireInternalToken.js`, `utils/signedVideoUrl.js` | API: list videos w/ lock state, mint signed play URLs, internal register endpoint | with the main API |
| `Backend/src/models/Enrollment.js` (`startDate`) | per-student day 1 | with the main API |
| `Frontend/src/components/CourseVideos.jsx` | student list + `<video>` player with token-refresh/resume | with the site |
| `Frontend/src/pages/admin/AdminVideos.jsx` | admin: retitle / reorder unlock day / delete | with the site |
| `cloudflare-worker/` | the B2 read gateway | `wrangler deploy` (separate) |
| `scripts/drive-to-b2-sync/` | Drive → B2 importer + registrar | run on a box/cron (separate) |
| `scripts/test-tools/` | `upload-test-video.js`, `generate-signed-link.js` | local only |

---

## The signed-URL scheme

```
<VIDEO_GATEWAY_URL>/videos/<b2Key>?exp=<unixSeconds>&token=<token>
token = base64url( HMAC-SHA256(`${b2Key}:${exp}`, SIGNING_SECRET) )
```

`SIGNING_SECRET` must be **byte-identical** in `Backend/.env` and the Worker's
secrets. The Worker rejects a request if the token doesn't match or `exp` has
passed. Express mints these with a 6-hour expiry (covers a ~3h lecture plus
pauses); the player silently re-fetches a fresh URL and resumes if one expires
mid-playback.

---

## 1. Backblaze B2

1. **Create a private bucket** — B2 dashboard → *Buckets* → *Create a Bucket*.
   Files in Bucket = **Private**. Note the name (e.g. `crix-course-videos`).
2. On the bucket page note the **Endpoint** — e.g. `s3.us-west-004.backblazeb2.com`.
   The region is the middle part: `us-west-004`.
3. **Create an application key** — *App Keys* → *Add a New Application Key*.
   Restrict it to that one bucket. Give it **Read and Write** (the sync script
   writes; the Worker only reads, but one key is fine, or make two).
   Save the **keyID** and **applicationKey** (shown once).

Do **not** enable public access or a public URL on the bucket.

---

## 2. Google Cloud service account (for the sync script)

1. Google Cloud Console → pick/create a project → *APIs & Services* →
   **enable the Google Drive API**.
2. *IAM & Admin* → *Service Accounts* → **Create service account**. No roles
   needed. After creating it, *Keys* → *Add key* → *JSON* → download it.
3. Copy the service account's email (`…@….iam.gserviceaccount.com`).
4. In Google Drive, open the folder Google Meet saves recordings to →
   **Share** → add that email as **Viewer**.
   - If the folder lives in a **Shared Drive**, either share the folder as
     above, or add the service account as a member of the Shared Drive, and
     set `SHARED_DRIVE_ID` in the sync script's `.env`.
5. The folder id is the last path segment of its URL:
   `https://drive.google.com/drive/folders/<DRIVE_FOLDER_ID>`.

---

## 3. Deploy the Cloudflare Worker

```bash
cd cloudflare-worker
npm install
```

Edit `wrangler.toml` `[vars]` → `B2_S3_ENDPOINT`, `B2_REGION`, `B2_BUCKET`
(and optionally `ALLOW_ORIGIN`).

Set the secrets (prompts for each value):

```bash
npx wrangler secret put SIGNING_SECRET   # same value as Backend/.env
npx wrangler secret put B2_KEY_ID        # B2 application keyID
npx wrangler secret put B2_APP_KEY       # B2 applicationKey
```

Deploy:

```bash
npm run deploy
```

**Custom domain:** Cloudflare dashboard → your Worker → *Settings* →
*Domains & Routes* → *Add* → a subdomain like `videos.crixtechnology.com`
(the zone must be on your Cloudflare account). Or uncomment the `[[routes]]`
block in `wrangler.toml`. That hostname (no trailing slash) is
`VIDEO_GATEWAY_URL` in `Backend/.env`.

**Local testing:** `cp .dev.vars.example .dev.vars`, fill it, `npm run dev`
(serves on `http://localhost:8787`).

---

## 4. Backend env vars

Add to `Backend/.env` (see `Backend/.env.example`):

```
VIDEO_GATEWAY_URL=https://videos.crixtechnology.com
SIGNING_SECRET=<32+ random bytes, identical to the Worker secret>
COURSE_API_INTERNAL_TOKEN=<32+ random bytes, identical to the sync script>
```

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Run the one-time migrations (safe to re-run):

```bash
cd Backend
npm run migrate:enrollment-startdate      # backfill startDate on existing enrollments
npm run migrate:drop-recorded-lectures    # remove legacy kind:"recorded" Lecture rows
```

---

## 5. Sync script env vars + running it

```bash
cd scripts/drive-to-b2-sync
npm install
cp .env.example .env      # then fill it in
```

Key vars: `DRIVE_FOLDER_ID`, `SHARED_DRIVE_ID` (optional),
`GOOGLE_SERVICE_ACCOUNT_KEY_FILE` (path to the JSON), all the `B2_*`,
`COURSE_API_URL`, `COURSE_API_INTERNAL_TOKEN`, `COURSE_ID`
(the Mongo `_id` of the Course these recordings belong to — copy it from the
admin panel URL or the DB).

Google Meet drops every course's recordings into one folder, so
`FILE_NAME_INCLUDES` / `FILE_NAME_EXCLUDES` (comma-separated, case-insensitive
substrings matched against the Drive file name) narrow a run to one course's
files — e.g. `FILE_NAME_INCLUDES=Fullstack Web Developer`. Run the script
once per course with its own `COURSE_ID` + filter. Each run's `.sync-state.json`
tracks what it has already uploaded, so give each course profile its own
`STATE_FILE` if you keep several `.env`s around.

```bash
node index.js            # one pass
node index.js --loop     # keep polling every POLL_INTERVAL_SECONDS (default 300)
```

`dayNumber` is auto-assigned as *(existing video count in that course + 1)*.
Already-synced Drive file ids are recorded in `.sync-state.json`, so re-runs
don't re-upload. Per-file failures are logged and skipped; the batch
continues. Fix a wrong title or unlock day afterwards in **Admin → Course
videos**.

---

## 6. Testing storage + delivery in isolation

Before the Drive pipeline exists you can prove B2 + the Worker work:

```bash
cd scripts/test-tools
npm install
cp .env.example .env      # fill in B2_*, SIGNING_SECRET, VIDEO_GATEWAY_URL

node upload-test-video.js ./sample.mp4 web-dev/day-1.mp4
node generate-signed-link.js web-dev/day-1.mp4 3600
# paste the printed URL into a browser (works against `wrangler dev` too)
```

---

## 7. Creating an Enrollment when a student pays

Unchanged from before — `grantAccessForPayment()` in
`Backend/src/routes/payments.js` upserts an `Enrollment { user, course,
payment, status: "active" }` the moment Razorpay confirms the payment
(browser `/verify` call or the webhook, whichever lands first).

New: `Enrollment.startDate` now defaults to that moment and is the student's
drip **day 1**. To start someone's schedule on a different date, edit
`startDate` on their Enrollment document directly (there's no admin control
for it yet). `middleware/requireEnrollment.js` computes:

```
unlockedThroughDay = floor((now - startDate) / 1 day) + 1
```

and a video is playable when `video.dayNumber <= unlockedThroughDay`.
