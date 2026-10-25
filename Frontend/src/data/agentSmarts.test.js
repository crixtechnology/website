import { respond, initialState } from "./helpAgent.js";
import { understand, buildVocab, editDistance, similarity } from "./agentLanguage.js";

// The free (no-AI) upgrades to the help agent: typos, Hinglish, answers about a
// named program or role from live data, "did you mean", and admin-taught answers.
const ctx = {
  programs: [
    { slug: "mern", title: "MERN Stack with AI Integration", type: "internship", durationDays: 90, status: "open", desc: "Full-stack from zero to deployed.",
      points: ["React, Node.js, Express, MongoDB"], tiers: [{ tier: "basic", price: 4999, discountPercent: 20 }, { tier: "pro", price: 8999 }] },
    { slug: "android", title: "Android Development", type: "internship", durationDays: 30, status: "open", points: ["Kotlin"], tiers: [{ tier: "basic", price: 2999 }] },
    { slug: "aiml", title: "AI & ML Fundamentals", type: "course", status: "closed", points: ["Python"], tiers: [] },
    { slug: "agents", title: "Building AI Agents & RAG Systems", type: "course", status: "open", points: ["LLM"], tiers: [{ tier: "basic", price: 1999 }] },
  ],
  openings: [{ title: "Data Science Intern", feeRequired: false, stipend: "Up to ₹6,000/month", duration: "3 months", mode: "Remote",
    experience: "0–1 year", test: { questions: 40, durationMinutes: 45, negativeMarks: 0.25 } }],
  services: [],
  taught: [{ q: "is there a weekend batch", a: "Yes — weekend batches run on Saturdays and Sundays.", keywords: "saturday sunday weekend", linkTo: "/programs", linkLabel: "Programs", dept: "" }],
};

function chat(...lines) {
  let state = initialState();
  let last;
  for (const line of lines) { const r = respond(state, line, ctx); state = r.state; last = r.replies[0]; last.unanswered = r.state.unanswered; }
  return { state, last };
}

describe("understanding what people type", () => {
  it("measures typos, including swapped letters", () => {
    expect(editDistance("internshp", "internship")).toBe(1);
    expect(editDistance("certficate", "certificate")).toBe(1);
    expect(editDistance("teh", "the")).toBe(1);
    expect(editDistance("payment", "android")).toBeGreaterThan(2);
  });

  it("corrects misspellings and adds the meaning of Hinglish words", () => {
    const vocab = buildVocab([["internship", "certificate", "refund", "price"]]);
    expect(understand("internshp ka certficate", vocab)).toContain("internship");
    expect(understand("internshp ka certficate", vocab)).toContain("certificate");
    expect(understand("kitna lagega")).toContain("price");
    expect(understand("kitne din ka hai")).toContain("how long");
    expect(understand("mujhe naukri chahiye")).toMatch(/job.*want/);
  });

  it("scores similar sentences higher", () => {
    expect(similarity("is there a weekend batch", "do you have weekend batches")).toBeGreaterThan(similarity("is there a weekend batch", "refund policy"));
  });
});

describe("answers about a named program or role", () => {
  it("names a program's real plans and a running discount, in Hinglish with a typo — without amounts", () => {
    const { last, state } = chat("mern internshp ka price kitna hai");
    expect(last.text).toContain("in 2 plans (Basic, Pro)");
    expect(last.text).toContain("the discount running now");
    expect(last.text).not.toMatch(/₹|\d+%/);
    expect(last.links[0].to).toBe("/programs/mern");
    expect(state.about.title).toBe("MERN Stack with AI Integration");
  });

  it("follows up on the same program: “how much?”, “kitne din ka hai”", () => {
    expect(chat("tell me about mern", "how much?").last.text).toContain("MERN Stack with AI Integration is open to enrol");
    expect(chat("tell me about mern", "kitne din ka hai").last.text).toBe("MERN Stack with AI Integration runs for 3 months.");
    expect(chat("how long is android").last.text).toBe("Android Development runs for 1 month.");
  });

  it("finds programs whose titles have a dot, like React.js", () => {
    const withReact = { ...ctx, programs: [...ctx.programs, { slug: "react-js", title: "React.js Programming", type: "course", status: "open", durationDays: 30, tiers: [{ tier: "basic", price: 999 }] }] };
    const r = respond(initialState(), "price of react.js course", withReact);
    expect(r.replies[0].text).toContain("React.js Programming is open to enrol");
    expect(r.state.about.title).toBe("React.js Programming");
  });

  it("leaves short real words alone instead of 'correcting' them", () => {
    const vocab = buildVocab([["card", "paid"]]);
    expect(understand("where is my cart", vocab)).toBe("where is my cart");
  });

  it("says a closed program isn't on sale, instead of inventing a price", () => {
    expect(chat("price of AI & ML fundamentals").last.text).toMatch(/isn't open for online enrolment/);
  });

  it("doesn't pick one program for a word several share", () => {
    const { last, state } = chat("ai course");
    expect(state.about).toBeFalsy();
    expect(last.text).toContain("AI & ML Fundamentals");
    expect(last.text).toContain("Building AI Agents & RAG Systems");
  });

  it("answers about a Careers role: stipend, then its test as a follow-up", () => {
    expect(chat("data science intern stipend").last.text).toBe("This role comes with a stipend — the amount is shown on its card on the Careers page.");
    expect(chat("data science intern", "test kaisa hota hai").last.text).toContain("40 questions in 45 minutes");
  });
});

describe("when it isn't sure", () => {
  it("routes Hinglish job-seeking to the open roles", () => {
    expect(chat("mujhe naukri chahiye").last.text).toContain("Data Science Intern");
  });

  it("suggests the closest questions instead of guessing", () => {
    const { last } = chat("whats the refnd rule for course");
    expect(last.text).toMatch(/refund|non-refundable|final/i);
  });

  it("doesn't answer nonsense from a typo-corrected word", () => {
    const { last } = chat("blah blah random words");
    expect(last.unanswered).toBe(true);
  });
});

describe("answers an admin taught it", () => {
  it("uses a taught answer for differently worded questions, with its link", () => {
    for (const q of ["is there a weekend batch?", "do you have weekend classes", "saturday sunday batch?"]) {
      const { last } = chat(q);
      expect(last.text).toBe("Yes — weekend batches run on Saturdays and Sundays.");
      expect(last.links).toEqual([{ to: "/programs", label: "Programs" }]);
    }
  });
});
