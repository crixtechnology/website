// The backend's host sleeps when idle; the public lists keep trying while it
// wakes instead of leaving the page empty until the visitor refreshes.

function loadApi(fetchImpl) {
  process.env.REACT_APP_API_URL = "http://api.test";
  global.fetch = fetchImpl;
  let api;
  jest.isolateModules(() => { api = require("./api.js"); });
  return api;
}
const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const notJson = (status) => ({ ok: false, status, json: async () => { throw new SyntaxError("Unexpected token <"); } });

describe("getJsonWhileWaking", () => {
  it("tries again after a network error or a waking host's 502, then returns the list", async () => {
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(notJson(502))
      .mockResolvedValueOnce(answer({ ok: true, openings: [{ slug: "web" }] }));
    const { getJsonWhileWaking } = loadApi(fetchMock);
    const res = await getJsonWhileWaking("http://api.test/careers/free/openings", undefined, [0, 0, 0]);
    expect(res).toEqual({ ok: true, openings: [{ slug: "web" }] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("doesn't retry an ordinary 4xx answer", async () => {
    const fetchMock = jest.fn().mockResolvedValue(answer({ ok: false, error: "Not found" }, 404));
    const { getJsonWhileWaking } = loadApi(fetchMock);
    await expect(getJsonWhileWaking("http://api.test/courses/nope", undefined, [0, 0])).resolves.toEqual({ ok: false, error: "Not found" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last retry", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const { getJsonWhileWaking } = loadApi(fetchMock);
    await expect(getJsonWhileWaking("http://api.test/courses", undefined, [0, 0])).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("the public lists", () => {
  // Real timers: the first retry waits 2 seconds.
  it("getFreeOpenings waits out a sleeping backend instead of reporting no roles", async () => {
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(answer({ ok: true, openings: [{ slug: "web" }] }));
    const { getFreeOpenings } = loadApi(fetchMock);
    await expect(getFreeOpenings()).resolves.toEqual({ ok: true, openings: [{ slug: "web" }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10000);
});
