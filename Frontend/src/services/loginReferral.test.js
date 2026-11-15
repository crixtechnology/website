// The referral program is off the site: creating an account never sends a
// referral code, even one an old ?ref= link left in this browser.

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

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); window.localStorage.setItem("crix_ref", "CRIX5NH3B6"); });

it("creates an account without any referral code", async () => {
  const fetchMock = reply({ ok: true, created: true, token: "tok", user: { id: "u1" } }, 201);
  const { login } = loadApi(fetchMock);
  await login("new@example.com", "a-long-password", { createAccount: true, ageConfirmed: true });
  expect(sentBody(fetchMock)).toEqual({ email: "new@example.com", password: "a-long-password", createAccount: true, ageConfirmed: true });
});

it("sends only the email and password on an ordinary login", async () => {
  const fetchMock = reply({ ok: true, token: "tok", user: { id: "u1" } });
  const { login } = loadApi(fetchMock);
  await login("asha@example.com", "a-long-password");
  expect(sentBody(fetchMock)).toEqual({ email: "asha@example.com", password: "a-long-password" });
});

it("signs in with Google without any referral code", async () => {
  const fetchMock = reply({ ok: true, token: "tok", user: { id: "u1" } });
  const { googleAuth } = loadApi(fetchMock);
  await googleAuth("google-id-token", { ageConfirmed: true });
  expect(sentBody(fetchMock)).toEqual({ credential: "google-id-token", ageConfirmed: true });
});
