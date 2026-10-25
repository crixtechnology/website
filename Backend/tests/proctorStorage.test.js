// Where CVs and webcam photos are stored (src/utils/proctorStorage.js): the
// settings it accepts, the check behind Admin → Careers settings → Check
// storage, and how a storage failure is described. No network: the bucket
// itself is never called here.
const fs = require("fs");
const os = require("os");
const path = require("path");

const KEYS = ["PROCTOR_BUCKET", "PROCTOR_KEY_ID", "PROCTOR_APP_KEY", "PROCTOR_S3_ENDPOINT", "PROCTOR_REGION", "B2_S3_ENDPOINT", "B2_REGION", "PROCTOR_LOCAL_DIR"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const load = () => {
  let mod;
  jest.isolateModules(() => { mod = require("../src/utils/proctorStorage"); });
  return mod;
};

beforeEach(() => { for (const k of KEYS) delete process.env[k]; });
afterAll(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe("proctor storage settings", () => {
  const bucket = (endpoint) => Object.assign(process.env, {
    PROCTOR_BUCKET: "crix-proctoring", PROCTOR_KEY_ID: "id", PROCTOR_APP_KEY: "key", PROCTOR_S3_ENDPOINT: endpoint, PROCTOR_REGION: "us-east-005",
  });

  it.each([
    "s3.us-east-005.backblazeb2.com",
    "https://s3.us-east-005.backblazeb2.com",
    "https://s3.us-east-005.backblazeb2.com/",
    "  s3.us-east-005.backblazeb2.com  ",
  ])("uses the bucket with the endpoint written as %j", (endpoint) => {
    bucket(endpoint);
    expect(load().storageStatus()).toEqual({ inBucket: true, message: 'Webcam photos: stored in bucket "crix-proctoring" (us-east-005).' });
  });

  it("falls back to the disk while a setting is missing", () => {
    bucket("s3.us-east-005.backblazeb2.com");
    delete process.env.PROCTOR_APP_KEY;
    expect(load().storageStatus()).toMatchObject({ inBucket: false, message: expect.stringMatching(/missing/) });
  });
});

describe("storage check", () => {
  it("saves, reads back and deletes a test file for CVs and for webcam photos", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crix-storage-"));
    process.env.PROCTOR_LOCAL_DIR = dir;
    const result = await load().checkStorage();
    expect(result.inBucket).toBe(false);
    expect(result.results).toEqual([{ area: "CVs", ok: true }, { area: "Webcam photos", ok: true }]);
    // Nothing is left behind.
    const left = fs.readdirSync(dir).flatMap((d) => fs.readdirSync(path.join(dir, d)));
    expect(left).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("says what went wrong", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crix-storage-"));
    const blocker = path.join(dir, "not-a-folder");
    fs.writeFileSync(blocker, "x");
    process.env.PROCTOR_LOCAL_DIR = blocker; // a file, so nothing can be saved under it
    const result = await load().checkStorage();
    expect(result.results.map((r) => r.ok)).toEqual([false, false]);
    expect(result.results[0].error).toMatch(/^Error: /);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("describes a bucket error by name, HTTP status and message", () => {
    const { describeStorageError } = load();
    const denied = Object.assign(new Error("not entitled"), { name: "AccessDenied", $metadata: { httpStatusCode: 403 } });
    expect(describeStorageError(denied)).toBe("AccessDenied (HTTP 403): not entitled");
    expect(describeStorageError(Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" }))).toBe("Timed out: The operation was aborted");
    expect(describeStorageError(null)).toBe("Unknown error");
  });
});
