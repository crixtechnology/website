const { secretProblems, checkSecretsOrExit } = require("../src/utils/startupChecks");

// The server must not run in production with a guessable token-signing secret.
describe("startup secret checks", () => {
  const strong = "a".repeat(20) + "9f3c1d7e5b2a8c4f6e0d1b3a5c7e9f";

  it("accepts a long random JWT_SECRET", () => {
    expect(secretProblems({ JWT_SECRET: strong, NODE_ENV: "production" })).toEqual([]);
  });

  it("flags a missing, short or example secret", () => {
    expect(secretProblems({})).toEqual(["JWT_SECRET is not set."]);
    expect(secretProblems({ JWT_SECRET: "short" })[0]).toMatch(/shorter than 32/);
    expect(secretProblems({ JWT_SECRET: "change_this_to_a_long_random_string_please_now" })[0]).toMatch(/example value/);
  });

  it("flags one-time codes being logged on a real server", () => {
    expect(secretProblems({ JWT_SECRET: strong, NODE_ENV: "production", MAIL_DEV_LOG: "true" })[0]).toMatch(/MAIL_DEV_LOG/);
    expect(secretProblems({ JWT_SECRET: strong, MAIL_DEV_LOG: "true" })).toEqual([]);
  });

  it("refuses to start in production, and only warns in development", () => {
    const exit = jest.spyOn(process, "exit").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    checkSecretsOrExit({ JWT_SECRET: "short", NODE_ENV: "production" });
    expect(exit).toHaveBeenCalledWith(1);
    exit.mockClear();
    checkSecretsOrExit({ JWT_SECRET: "short" });
    expect(exit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    exit.mockRestore(); error.mockRestore(); warn.mockRestore();
  });
});
