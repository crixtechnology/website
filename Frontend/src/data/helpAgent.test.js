import { respond, initialState, greeting, DEPARTMENTS, answerFor } from "./helpAgent.js";
import { site } from "./content.js";

// The help agent's conversation logic: context, clarifying questions,
// recommendations from live data, and sending people to the right team.
const ctx = {
  user: null,
  programs: [
    { slug: "mern-ai", title: "MERN Stack with AI Integration", type: "internship", points: ["React", "Node.js", "MongoDB"] },
    { slug: "android", title: "Android Development", type: "internship", points: ["Kotlin"] },
    { slug: "react-js", title: "React.js Programming", type: "course", points: ["Hooks"] },
    { slug: "ai-agents", title: "Building AI Agents & RAG Systems", type: "course", points: ["LLM", "RAG"] },
    { slug: "sql", title: "SQL & Databases", type: "course", desc: "Design schemas and write queries.", durationDays: 30, tiers: [{ tier: "basic", price: 1000, discountPercent: 10 }, { tier: "pro", price: 2000 }] },
  ],
  openings: [
    { title: "Web Development Intern", feeRequired: true, stipend: "Up to ₹6,000/month" },
    { title: "Data Science Intern", feeRequired: false },
  ],
  services: [
    { title: "Static Website", desc: "A fast business website" },
    { title: "Dynamic Website & Web Apps", desc: "Web apps with logins and dashboards" },
    { title: "Mobile App Development", desc: "Android and iOS apps", points: ["Android apps", "iOS apps", "Cross-platform apps"] },
  ],
};

// Runs a whole conversation, returning every reply and the final state.
function chat(...lines) {
  let state = initialState();
  const replies = [];
  for (const line of lines) {
    const r = respond(state, line, ctx);
    state = r.state;
    replies.push(r.replies[0]);
  }
  return { state, replies, last: replies[replies.length - 1] };
}
const chipSays = (reply) => (reply.chips || []).map((c) => c.say);

describe("help agent", () => {
  it("greets a logged-in user by first name, but not by a placeholder name", () => {
    expect(greeting({ user: { name: "Asha Mehta" } }).text).toMatch(/^Hi Asha!/);
    expect(greeting({ user: { name: "Rahul Sharma", profilePending: true } }).text).toMatch(/^Hi!/);
    expect(greeting({}).chips.length).toBeGreaterThan(3);
  });

  it("recommends real programs for the track asked about, with links to them", () => {
    const { last, state } = chat("I want an internship in react");
    expect(state.topic).toBe("programs");
    expect(last.text).toContain("MERN Stack with AI Integration");
    expect(last.text).not.toContain("Android Development");
    expect(last.links.map((l) => l.to)).toContain("/programs/mern-ai");
  });

  it("asks which area when the interest is unclear, then follows up on the answer", () => {
    const first = chat("internships");
    expect(first.last.text).toMatch(/which area/i);
    expect(chipSays(first.last).length).toBeGreaterThan(2);
    const { last } = chat("internships", "Internships in android");
    expect(last.text).toContain("Android Development");
  });

  it("answers “how much?” for whatever was being discussed", () => {
    expect(chat("I want an internship in react", "how much?").last.text).toMatch(/price on the program's page when you enrol/);
    expect(chat("open jobs", "how much?").last.text).toMatch(/Free to apply/);
    expect(chat("I need a website for my shop", "how much?").last.text).toMatch(/quoted individually/i);
    // No context yet: it asks which one.
    expect(chipSays(chat("how much?").last).length).toBe(3);
  });

  it("lists the open roles, saying which are free", () => {
    const { last } = chat("are you hiring?");
    expect(last.text).toContain("Web Development Intern — registration fee applies");
    expect(last.text).toContain("Data Science Intern — free to apply");
    expect(last.links[0].to).toBe("/careers");
  });

  it("asks what a business needs, then points to a quote", () => {
    expect(chipSays(chat("IT services for my business").last).length).toBeGreaterThan(3);
    const { last, state } = chat("I need a website for my business");
    expect(state.topic).toBe("services");
    expect(last.links.map((l) => l.to)).toContain("/services");
  });

  it("hands over to the right team only — and asks which one when it can't tell", () => {
    const unsure = chat("I want to talk to someone");
    expect(unsure.last.dept).toBeUndefined();
    expect(chipSays(unsure.last).length).toBe(2);
    expect(chat("I want to talk to someone", "IT services for a business").last.dept).toBe("it");
    expect(chat("I want to talk to someone", "internships and courses").last.dept).toBe("programs");
    // Mid-conversation it already knows.
    expect(chat("are you hiring?", "can I call you?").last.dept).toBe("programs");
    expect(chat("I need a mobile app", "give me your number").last.dept).toBe("it");
  });

  it("never offers WhatsApp, and every department has its own number and hint", () => {
    const all = chat("hi", "payment failed money deducted", "talk to someone", "what are your contact numbers");
    for (const r of all.replies) for (const l of r.links || []) expect(l.href || "").not.toMatch(/wa\.me/);
    expect(all.replies[1].dept).toBe("programs");
    expect(all.last.dept).toBe("both");
    expect(DEPARTMENTS.it.phone).toBe(site.phone);
    expect(DEPARTMENTS.programs.phone).toBe(site.phoneAlt);
    expect(DEPARTMENTS.it.hint).toBeTruthy();
    expect(DEPARTMENTS.programs.hint).toBeTruthy();
  });

  it("doesn't mistake a product for a request to call ('mobile app', 'AI agents')", () => {
    const app = chat("I need a mobile app");
    expect(app.state.topic).toBe("services");
    expect(app.last.dept).toBeUndefined();
    expect(app.last.text).toContain("“Mobile App Development”");
    const agents = chat("I want an AI agents course");
    expect(agents.state.topic).toBe("programs");
    expect(agents.last.dept).toBeUndefined();
    expect(agents.last.text).toContain("Building AI Agents & RAG Systems");
  });

  it("tells a logged-in student what their profile is missing", () => {
    const user = { name: "Rahul Sharma", email: "rahul@example.com", phone: "", profilePending: true };
    const r = respond(initialState(), "help with my account", { ...ctx, user });
    expect(r.replies[0].text).toContain("full name and phone number");
    expect(r.replies[0].links[0].to).toBe("/profile");
  });

  it("still answers specific questions from the answer bank", () => {
    expect(chat("what is your refund policy").last.text).toMatch(/refund/i);
    expect(chat("do you charge gst").last.text).toMatch(/GST/);
  });

  it("answers client-terms questions in the chat, apart from the student ones", () => {
    expect(chat("is my website project fee refundable?").last.text).toMatch(/final and non-refundable/);
    expect(chat("what is your refund policy").last.text).toMatch(/course and internship purchases are final/);
    const own = chat("who owns the code you build").last;
    expect(own.text).toMatch(/once you've paid in full/);
    expect(own.links).toBeUndefined();
  });

  it("answers about the free internships when asked, without a link to the page", () => {
    const fee = chat("what is the ₹94 processing fee?");
    expect(fee.state.topic).toBe("free");
    expect(fee.last.text).toMatch(/internship itself is free/);
    expect(fee.last.text).toMatch(/comes back to your Crix wallet as credit/);
    expect(fee.last.links).toBeUndefined();
    const overview = chat("how do I apply for the free internship?").last.text;
    expect(overview).toMatch(/Apply with your CV/);
    expect(overview).toMatch(/within 7 days/i);
    // Follow-ups stay on it, and the right team is the students' one.
    expect(chat("free internship", "is the cv a pdf?").last.text).toMatch(/PDF of up to 2 MB/);
    expect(chat("free internship", "how much?").last.text).toMatch(/processing fee shown on the page/);
    expect(chat("free internship", "can I call you?").last.dept).toBe("programs");
  });

  it("never brings up the free internships page unasked", () => {
    const quiet = (r) => expect(`${r.text} ${(r.chips || []).map((c) => c.say).join(" ")} ${(r.more || []).map((m) => m.q).join(" ")}`).not.toMatch(/free internship|₹94|processing fee/i);
    const all = chat("hi", "internships", "is the internship free or paid?", "show all programs", "are you hiring?", "how much?", "aptitude test fee", "what is the wallet", "is there anything free?", "I need a website");
    all.replies.forEach(quiet);
    quiet(greeting({}));
    quiet(respond(initialState(), "xyzzy qwertyuiop", ctx).replies[0]);
    quiet(respond(initialState(), "internshp fre", ctx).replies[0]);
  });

  it("flags what it couldn't understand and offers the main topics", () => {
    const r = respond(initialState(), "xyzzy qwertyuiop", ctx);
    expect(r.state.unanswered).toBe(true);
    expect(r.replies[0].chips.length).toBeGreaterThan(3);
  });

  it("lists every IT service in the chat, each with what it covers", () => {
    const { last } = chat("IT services for my business");
    expect(last.text).toContain("Static Website — A fast business website");
    expect(last.text).toContain("Mobile App Development — Android apps, iOS apps, Cross-platform apps");
    expect(last.links || []).toEqual([]);
  });

  it("answers a business need in full — process, pricing and the IT number — with the inquiry form as the next step", () => {
    const { last } = chat("I need a mobile app");
    expect(last.text).toMatch(/Discover/);
    expect(last.text).toMatch(/Deliver & Support/);
    expect(last.text).toMatch(/written estimate/);
    expect(last.text).toContain(site.phone);
    expect(last.links).toEqual([{ to: "/services", label: "Send an inquiry" }]);
  });

  it("explains programs in the chat instead of sending people to a page", () => {
    const { last } = chat("internships");
    expect(last.text).toMatch(/offer letter on day one/i);
    expect(last.text).toMatch(/letter of recommendation/i);
    expect(last.links).toBeUndefined();
    // Program lists say how long each one runs right in the chat.
    expect(chat("show all programs").last.text).toContain("SQL & Databases (Course · 1 month) — Design schemas and write queries.");
  });

  it("never states an amount of money — no price, fee, discount or stipend", () => {
    const money = /₹|\brs\.? ?\d|\binr\b|\d+ ?(rupees|credits)|\d+% off|\bwas \d/i;
    // The wallet's rate isn't a price, so it's allowed.
    const said = (r) => `${r.text} ${(r.chips || []).map((c) => `${c.label} ${c.say}`).join(" ")}`.replace(/1 credit = ₹1/g, "");
    const asks = [
      ["price of SQL & Databases"], ["how much is SQL & Databases"], ["courses in sql"], ["show all programs"], ["internships", "how much?"],
      ["what courses do you offer"], ["are you hiring?", "how much?"], ["stipend for the web development intern"], ["Web Development Intern"],
      ["aptitude test fee"], ["what is the wallet"], ["what is the ₹94 processing fee?"], ["free internship", "how much?"], ["free internship"],
      ["how much does a website cost"], ["signup bonus"], ["referral"],
    ];
    for (const lines of asks) for (const r of chat(...lines).replies) expect(said(r)).not.toMatch(money);
    for (const id of ["i-offer", "c-offer", "k-open", "k-fee", "r-wallet"]) expect(answerFor(id, ctx).text.replace(/1 credit = ₹1/g, "")).not.toMatch(money);
    // …and the wallet answers still give it.
    expect(answerFor("r-wallet").text).toContain("1 credit = ₹1");
    expect(chat("are you hiring?", "how much?").last.text).toContain("1 credit = ₹1");
  });

  it("gives engagement models with the price of IT work, and roles with the careers fee", () => {
    expect(chat("I need a website for my shop", "how much?").last.text).toMatch(/Fixed Price[\s\S]*Dedicated Team[\s\S]*Hourly \/ Retainer/);
    expect(chat("open jobs", "how much?").last.text).toContain("Data Science Intern — free to apply");
  });

  it("says the hours and email along with a team's number", () => {
    const { last } = chat("I need a mobile app", "give me your number");
    expect(last.text).toContain(site.hours);
    expect(last.text).toContain(site.email);
  });

  it("answers “what do you offer” from the live data", () => {
    expect(chat("what it services do you offer").last.text).toContain("Dynamic Website & Web Apps — Web apps with logins and dashboards");
    expect(answerFor("i-offer", ctx).text).toContain("MERN Stack with AI Integration (Internship)");
    expect(answerFor("k-open", ctx).text).toContain("Web Development Intern");
    // Without live data it falls back to the answer bank.
    expect(answerFor("s-offer").text).toMatch(/Website Development & Web Solutions/);
  });

  it("handles small talk", () => {
    expect(chat("thanks").last.text).toMatch(/welcome/i);
    expect(chat("hello").last.text).toMatch(/help agent/i);
  });
});
