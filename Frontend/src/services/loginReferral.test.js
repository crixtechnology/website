// The friend's code remembered from a shared ?ref= link (utils/referral.js) goes
// with the login that creates a new account, and is forgotten once it has —
// a plain login of an existing account neither sends nor clears it.

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
const sentBody = (fetchMock) => JSON.parse(fetchMock.mock.calls[0][1].body);

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); window.localStorage.setItem(KEY, "CRIX5NH3B6"); });

describe("login() and the remembered referral code", () => {
  it("sends it with a new account and forgets it once the account is created", async () => {
    const fetchMock = reply({ ok: true, created: true, token: "tok", user: { id: "u1" } }, 201);
    const { login } = loadApi(fetchMock);
    await login("new@example.com", "a-long-password", { createAccount: true, ageConfirmed: true });
    expect(sentBody(fetchMock)).toEqual(expect.objectContaining({ createAccount: true, ageConfirmed: true, referralCode: "CRIX5NH3B6" }));
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("doesn't send or clear it on an ordinary login", async () => {
    const fetchMock = reply({ ok: true, token: "tok", user: { id: "u1" } });
    const { login } = loadApi(fetchMock);
    await login("asha@example.com", "a-long-password");
    expect(sentBody(fetchMock)).toEqual({ email: "asha@example.com", password: "a-long-password" });
    expect(window.localStorage.getItem(KEY)).toBe("CRIX5NH3B6");
  });

  it("keeps it when creating the account is refused, so it can be retried", async () => {
    const { login } = loadApi(reply({ ok: false, error: "Password must be at least 8 characters" }, 400));
    await login("new@example.com", "short", { createAccount: true, ageConfirmed: true });
    expect(window.localStorage.getItem(KEY)).toBe("CRIX5NH3B6");
  });

  it("keeps it when the request never reaches the server", async () => {
    const { login } = loadApi(jest.fn(async () => { throw new Error("offline"); }));
    await login("new@example.com", "a-long-password", { createAccount: true, ageConfirmed: true });
    expect(window.localStorage.getItem(KEY)).toBe("CRIX5NH3B6");
  });
});
