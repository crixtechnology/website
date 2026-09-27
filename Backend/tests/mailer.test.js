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

  it("sends nothing when no email service is configured", async () => {
    global.fetch = jest.fn();
    const { sendPasswordChangedEmail } = loadMailer({ BREVO_API_KEY: "", SMTP_HOST: "", MAIL_DEV_LOG: "" });
    expect(await sendPasswordChangedEmail({ to: "a@example.com", name: "A" })).toMatchObject({ sent: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
