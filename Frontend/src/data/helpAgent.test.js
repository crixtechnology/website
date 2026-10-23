import { respond, initialState, greeting, DEPARTMENTS } from "./helpAgent.js";
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
  ],
  openings: [
    { title: "Web Development Intern", feeRequired: true, stipend: "Up to ₹6,000/month" },
    { title: "Data Science Intern", feeRequired: false },
  ],
  services: [
    { title: "Static Website", desc: "A fast business website" },
    { title: "Dynamic Website & Web Apps", desc: "Web apps with logins and dashboards" },
    { title: "Mobile App Development", desc: "Android and iOS apps" },
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
    expect(chat("I want an internship in react", "how much?").last.text).toMatch(/price is on its own page/i);
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

  it("flags what it couldn't understand and offers the main topics", () => {
    const r = respond(initialState(), "xyzzy qwertyuiop", ctx);
    expect(r.state.unanswered).toBe(true);
    expect(r.replies[0].chips.length).toBeGreaterThan(3);
  });

  it("handles small talk", () => {
    expect(chat("thanks").last.text).toMatch(/welcome/i);
    expect(chat("hello").last.text).toMatch(/help agent/i);
  });
});
