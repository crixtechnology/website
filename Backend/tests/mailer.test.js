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
