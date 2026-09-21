// The friend's code remembered from a shared ?ref= link (utils/referral.js) must
// be forgotten as soon as a sign-up is accepted — otherwise it comes straight back
// in the sign-up box the next time the popup opens.

const KEY = "crix_ref";

// api.js reads its base URL when it's first loaded, so set it before requiring.
function loadApi(fetchImpl) {
  process.env.REACT_APP_API_URL = "http://api.test";
  global.fetch = fetchImpl;
  let api;
  jest.isolateModules(() => { api = require("./api.js"); });
  return api;
}
const reply = (body, status = 200) => jest.fn(async () => ({ ok: status < 400, status, json: async () => body }));
const form = { name: "Test Person", email: "test@example.com", phone: "+91 9876543210", password: "a-long-password", referralCode: "CRIX5NH3B6" };

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); window.localStorage.setItem(KEY, "CRIX5NH3B6"); });

describe("signup() and the remembered referral code", () => {
  it("forgets it after a new account is created", async () => {
    const { signup } = loadApi(reply({ ok: true, token: "tok", user: { id: "u1" } }));
    await signup(form);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("forgets it after the 'check your email' reply for an address that already has an account", async () => {
    const { signup } = loadApi(reply({ ok: true, token: null, user: null, message: "check your inbox" }));
    const res = await signup(form);
    expect(res.token).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps it when the sign-up is rejected, so it can be corrected and retried", async () => {
    const { signup } = loadApi(reply({ ok: false, error: "Enter a valid name." }, 400));
    await signup(form);
    expect(window.localStorage.getItem(KEY)).toBe("CRIX5NH3B6");
  });

  it("keeps it when the request never reaches the server", async () => {
    const { signup } = loadApi(jest.fn(async () => { throw new Error("offline"); }));
    await signup(form);
    expect(window.localStorage.getItem(KEY)).toBe("CRIX5NH3B6");
  });
});
