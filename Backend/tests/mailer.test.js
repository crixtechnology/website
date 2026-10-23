// Brevo HTTP API transport (utils/mailer.js). No network: fetch is mocked.
const realFetch = global.fetch;

function loadMailer(env) {
  let mailer;
  jest.isolateModules(() => {
    Object.assign(process.env, env);
    mailer = require("../src/utils/mailer");
  });
  return mailer;
}

afterEach(() => {
  global.fetch = realFetch;
  delete process.env.BREVO_API_KEY;
  delete process.env.MAIL_FROM;
});

describe("mailer via Brevo's HTTP API", () => {
  it("sends from the configured address, with the PDF attached as base64", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ messageId: "<m1@brevo>" }), { status: 201 }));
    const { sendReceiptEmail } = loadMailer({ BREVO_API_KEY: "test-key", MAIL_FROM: "Crix Technology <support@crixtechnology.com>", SMTP_HOST: "" });

    const result = await sendReceiptEmail({
      receipt: { receiptNumber: "CRX-2026-00001", buyerName: "Asha", buyerEmail: "asha@example.com", itemTitle: "React.js", itemType: "course", totalPaid: 1499 },
      pdfBuffer: Buffer.from("fake-pdf"),
    });

    expect(result).toEqual({ sent: true, id: "<m1@brevo>" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("test-key");
    const body = JSON.parse(init.body);
    expect(body.sender).toEqual({ name: "Crix Technology", email: "support@crixtechnology.com" });
    expect(body.to).toEqual([{ email: "asha@example.com" }]);
    expect(body.subject).toContain("CRX-2026-00001");
    expect(body.htmlContent).toContain("Asha");
    expect(body.attachment).toEqual([{ name: "Receipt-CRX-2026-00001.pdf", content: Buffer.from("fake-pdf").toString("base64") }]);
  });

  it("welcomes a new account with the profile step first, and the bonus when one is waiting", async () => {
    global.fetch = jest.fn(async () => new Response("{}", { status: 201 }));
    const { sendWelcomeEmail } = loadMailer({ BREVO_API_KEY: "test-key", SMTP_HOST: "", PUBLIC_SITE_URL: "https://www.crixtechnology.com" });
    await sendWelcomeEmail({ to: "new@example.com", name: "", profileIncomplete: true, bonusCredits: 300 });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.subject).toBe("Welcome to Crix Technology — your account is ready");
    expect(body.htmlContent).toContain("Hi there");
    expect(body.htmlContent).toContain("Complete your profile");
    expect(body.htmlContent).toContain("300 bonus credits");
    expect(body.htmlContent).toContain("/profile?reason=new");
    expect(body.textContent).toMatch(/Complete your profile: Add your full name and phone number/);

    global.fetch.mockClear();
    await sendWelcomeEmail({ to: "g@example.com", name: "Asha", profileIncomplete: false, bonusCredits: 0 });
    const second = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(second.htmlContent).toContain("Hi Asha");
    expect(second.htmlContent).not.toContain("Complete your profile");
    expect(second.htmlContent).not.toContain("bonus credits");
  });

  it("sends the owner the week's unanswered help-agent questions, escaped, with the admin link", async () => {
    global.fetch = jest.fn(async () => new Response("{}", { status: 201 }));
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = "development"; // notifyOwner is silent in test runs
    try {
      const { sendBotDigestEmail } = loadMailer({ BREVO_API_KEY: "test-key", SMTP_HOST: "", ADMIN_ORIGIN: "https://admin.example.com", CONTACT_TO_EMAIL: "owner@example.com" });
      await sendBotDigestEmail({ total: 12, questions: [{ question: "do you teach <b>rust</b>?", timesAsked: 5 }, { question: "weekend batch?", timesAsked: 1 }] });
    } finally {
      process.env.NODE_ENV = env;
      delete process.env.ADMIN_ORIGIN;
      delete process.env.CONTACT_TO_EMAIL;
    }
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.to).toEqual([{ email: "owner@example.com" }]);
    expect(body.subject).toBe("Help agent: 12 questions to teach this week");
    expect(body.htmlContent).toContain("do you teach &lt;b&gt;rust&lt;/b&gt;?");
    expect(body.htmlContent).not.toContain("<b>rust</b>");
    expect(body.htmlContent).toContain("asked 5 times");
    expect(body.htmlContent).toContain("and 10 more in the admin panel");
    expect(body.htmlContent).toContain("https://admin.example.com/admin/bot-questions");
    expect(body.textContent).toMatch(/1\. .do you teach <b>rust<\/b>\?. — asked 5 times/);
  });

  it("defaults the sender to support@crixtechnology.com", async () => {
    global.fetch = jest.fn(async () => new Response("{}", { status: 201 }));
    const { sendPasswordChangedEmail } = loadMailer({ BREVO_API_KEY: "test-key", SMTP_HOST: "" });
    await sendPasswordChangedEmail({ to: "a@example.com", name: "A" });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).sender.email).toBe("support@crixtechnology.com");
  });

  it("throws with Brevo's reason when it refuses the email", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: "sender not valid" }), { status: 400 }));
    const { sendPasswordChangedEmail } = loadMailer({ BREVO_API_KEY: "test-key", SMTP_HOST: "" });
    await expect(sendPasswordChangedEmail({ to: "a@example.com", name: "A" })).rejects.toThrow(/Brevo API error 400: .*sender not valid/);
  });

  it("puts a customer's email in the branded layout, with a text version too", async () => {
    global.fetch = jest.fn(async () => new Response("{}", { status: 201 }));
    const { sendPaymentRequestEmail } = loadMailer({ BREVO_API_KEY: "test-key", SMTP_HOST: "" });
    await sendPaymentRequestEmail({ to: "a@example.com", name: "A", itemTitle: "Android <b>Dev</b>", itemType: "internship", tier: "plus", amount: 3999, note: "" });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.htmlContent).toContain("crix-logo.png");
    expect(body.htmlContent).toContain("Pay now");
    expect(body.htmlContent).toContain("₹3,999");
    // Program titles come from admin/visitor input — escaped in the HTML.
    expect(body.htmlContent).toContain("Android &lt;b&gt;Dev&lt;/b&gt;");
    expect(body.textContent).toContain("Amount: ₹3,999");
  });

  it("builds the wallet credit email: amounts, reason, balance, a link to the wallet, and escaped text", async () => {
    global.fetch = jest.fn(async () => new Response("{}", { status: 201 }));
    const { sendWalletCreditEmail } = loadMailer({ BREVO_API_KEY: "test-key", SMTP_HOST: "" });

    await sendWalletCreditEmail({ to: "a@example.com", name: "Asha <b>", amount: 500, balance: 1250.5, reason: "admin", note: "Welcome <i>credit</i>" });
    let body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.subject).toBe("₹500 added to your Crix wallet");
    expect(body.htmlContent).toContain("crix-logo.png");
    expect(body.htmlContent).toContain("View my wallet");
    expect(body.htmlContent).toContain("/profile");
    expect(body.htmlContent).toContain("₹1,250.50");
    // Names and admin notes are free text — escaped in the HTML.
    expect(body.htmlContent).toContain("Asha &lt;b&gt;");
    expect(body.htmlContent).toContain("Welcome &lt;i&gt;credit&lt;/i&gt;");
    expect(body.htmlContent).not.toContain("<i>credit</i>");
    expect(body.textContent).toContain("Reason: Welcome <i>credit</i>");
    expect(body.textContent).toContain("Wallet balance: ₹1,250.50");

    // Referral rewards get their own wording; a missing note falls back to a plain one.
    global.fetch.mockClear();
    await sendWalletCreditEmail({ to: "a@example.com", name: "", amount: 500, balance: 500, reason: "referral" });
    body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.textContent).toContain("A friend you referred made their first purchase");
    global.fetch.mockClear();
    await sendWalletCreditEmail({ to: "a@example.com", amount: 100, balance: 100, reason: "admin" });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).textContent).toContain("Credit from Crix");

    // No address, no email.
    global.fetch.mockClear();
    expect(await sendWalletCreditEmail({ to: "", amount: 100, balance: 100, reason: "admin" })).toEqual({ sent: false, reason: "No email" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends the owner's new-application ping through Brevo when it's set up, without the applicant's details", async () => {
    global.fetch = jest.fn(async () => new Response("{}", { status: 201 }));
    const prevEnv = process.env.NODE_ENV;
    const { sendApplicationEmail } = loadMailer({ BREVO_API_KEY: "test-key", SMTP_HOST: "", CONTACT_TO_EMAIL: "owner@example.com" });
    process.env.NODE_ENV = "production";
    try {
      await sendApplicationEmail({ type: "internship", refTitle: "AI Agentic Systems" });
    } finally {
      process.env.NODE_ENV = prevEnv;
      delete process.env.CONTACT_TO_EMAIL;
    }
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toContain("api.brevo.com");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual([{ email: "owner@example.com" }]);
    expect(body.subject).toBe("New Internship application — AI Agentic Systems");
    expect(body.htmlContent).toContain("/admin/applications");
  });

  it("sends nothing when no email service is configured", async () => {
    global.fetch = jest.fn();
    const { sendPasswordChangedEmail } = loadMailer({ BREVO_API_KEY: "", SMTP_HOST: "", MAIL_DEV_LOG: "" });
    expect(await sendPasswordChangedEmail({ to: "a@example.com", name: "A" })).toMatchObject({ sent: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
