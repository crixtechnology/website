const { checkEmailDomain, suggestDomain } = require("../src/utils/emailDomain");

describe("email domain check", () => {
  test("suggests the common provider a domain is one slip away from", () => {
    expect(suggestDomain("gmial.com")).toBe("gmail.com");
    expect(suggestDomain("gmail.con")).toBe("gmail.com");
    expect(suggestDomain("yaho.co.in")).toBe("yahoo.co.in");
    expect(suggestDomain("rediffmial.com")).toBe("rediffmail.com");
    expect(suggestDomain("outlok.com")).toBe("outlook.com");
  });

  test("leaves real domains alone", () => {
    expect(suggestDomain("gmail.com")).toBe("");
    expect(suggestDomain("mail.com")).toBe("");
    expect(suggestDomain("crixtechnology.com")).toBe("");
    // Short names only get a hint for a single slip.
    expect(suggestDomain("abc.com")).toBe("");
  });

  test("rejects a bad format and disposable inboxes before any DNS lookup", async () => {
    expect((await checkEmailDomain("not-an-email")).ok).toBe(false);
    const temp = await checkEmailDomain("someone@mailinator.com");
    expect(temp.ok).toBe(false);
    expect(temp.error).toMatch(/disposable/i);
  });
});

test("a typo of a big provider is an error with a one-click fix, before any DNS lookup", async () => {
  const r = await checkEmailDomain("Abc@gmial.com");
  expect(r.ok).toBe(false);
  expect(r.suggestion).toBe("abc@gmail.com");
  expect(r.error).toMatch(/Did you mean abc@gmail.com/);
});
