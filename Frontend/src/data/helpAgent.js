// The help agent behind the floating chat (components/HelpAgent.jsx). No AI
// service and nothing sent anywhere except an unanswered question, anonymously
// (reportUnansweredQuestion) — every reply is built here from what the site
// itself says: the live programs, open roles and services, plus the answer
// bank in data/faqData.js.
//
// What makes it an agent rather than a FAQ list:
//   • it keeps track of the conversation (`state.topic`), so a follow-up such as
//     "how much?" or "how do I apply?" is answered for what was being discussed;
//   • when a message could mean two things it asks, with quick replies;
//   • it recommends real programs / roles by what was asked for;
//   • it knows who is logged in (name, missing profile details);
//   • it hands over to the RIGHT department's number only, so the IT services
//     line doesn't get student calls and the other way round.
//
// respond(state, text, ctx) -> { state, replies }
//   ctx: { user, programs, openings, services, taught } — any may be empty/missing.
//     taught: answers an admin wrote for questions visitors asked
//             (Admin → Help agent questions): [{ q, a, keywords, linkTo, linkLabel, dept }]
//   A reply: { text, links?, chips?, dept?, more? }
//     links  [{ to | href, label }]
//     chips  quick replies: [{ label, say, icon?, hint? }] — `say` is sent back as the user's message
//     dept   "it" | "programs" | "both": show that department's contact card
//     more   related answer-bank entries: [{ id, q }]
import { site } from "./content.js";
import { ALL_FAQS, searchFaqs } from "./faqData.js";
import { understand, buildVocab, similarity } from "./agentLanguage.js";
import { findNamed, programAnswer, roleAnswer } from "./agentKnowledge.js";

export const DEPARTMENTS = {
  programs: {
    id: "programs",
    label: site.phoneAltLabel,
    phone: site.phoneAlt,
    hint: site.phoneAltHint,
  },
  it: {
    id: "it",
    label: site.phoneLabel,
    phone: site.phone,
    hint: site.phoneHint,
  },
};

// Each topic the agent can hold a conversation about, and which department owns it.
const TOPIC_DEPT = { programs: "programs", careers: "programs", payments: "programs", account: "programs", wallet: "programs", services: "it" };

const MAIN_CHIPS = [
  { icon: "🎓", label: "Internships & courses", hint: "Find a program to join", say: "Internships and courses" },
  { icon: "💼", label: "Careers & jobs", hint: "Open roles and the test", say: "Careers and open roles" },
  { icon: "💻", label: "IT services", hint: "A website, app or project", say: "IT services for my business" },
  { icon: "💳", label: "Payments & refunds", hint: "Fees, receipts, issues", say: "Payment help" },
  { icon: "👤", label: "My account", hint: "Login, profile, password", say: "Help with my account" },
  { icon: "📞", label: "Talk to the team", hint: "The right number for you", say: "I want to talk to someone" },
];

// ---------- understanding a message ----------
const norm = (t) => ` ${String(t || "").toLowerCase().replace(/[^a-z0-9₹ ]+/g, " ").replace(/\s+/g, " ")} `;
const has = (n, words) => words.some((w) => n.includes(` ${w}`));

const WORDS = {
  greet: ["hi", "hii", "hello", "hey", "namaste", "good morning", "good afternoon", "good evening", "hlo"],
  thanks: ["thanks", "thank you", "thankyou", "thx", "ty ", "dhanyavad", "shukriya"],
  bye: ["bye", "goodbye", "see you", "tata"],
  yes: ["yes", "yeah", "yep", "sure", "ok", "okay", "haan", "ha ", "han ", "please do", "go ahead"],
  no: ["no", "nope", "nah", "not now", "nahi"],
  human: ["talk to", "speak to", "call", "phone", "number", "contact", "human", "person", "someone", "live agent", "real agent", "customer care", "support team", "executive", "representative", "mobile number", "mobile no", "reach you", "baat"],
  programs: ["internship", "intern ", "course", "program", "training", "learn", "certificate", "lor", "track", "batch", "class", "lecture", "syllabus", "join", "enrol", "enroll"],
  careers: ["career", "job", "hiring", "vacancy", "vacancies", "role", "opening", "aptitude", "test", "stipend", "interview", "fresher", "naukri", "placement"],
  services: ["it service", "it services", "website", "web site", "app ", "application", "ecommerce", "e commerce", "online store", "shop", "seo", "marketing", "chatbot", "software", "crm", "erp", "redesign", "business", "client", "project", "quote", "develop", "build my", "make my"],
  payments: ["payment", "pay ", "paid", "refund", "money", "deducted", "debited", "upi", "card", "razorpay", "receipt", "invoice", "gst", "transaction", "failed"],
  account: ["account", "login", "log in", "signin", "sign in", "password", "otp", "profile", "logout", "logged out", "email change", "delete my"],
  wallet: ["wallet", "credit", "referral", "refer", "coupon", "offer code", "discount", "bonus"],
  price: ["price", "fee", "fees", "cost", "how much", "charges", "charge", "kitna", "rupees", "₹", "free"],
  apply: ["apply", "how do i join", "how to join", "register", "enrol", "enroll", "buy", "purchase", "sign up", "signup"],
  want: ["want", "looking for", "interested", "suggest", "recommend", "need", "help with", "show me", "which", "chahiye"],
  careerList: ["hiring", "open role", "open roles", "openings", "vacancy", "vacancies", "jobs", "job opening", "any job", "careers and"],
  failure: ["deducted", "debited", "failed", "not received", "no access", "didnt get", "didn t get", "stuck", "pending", "not showing", "not visible", "not unlocked", "cant see", "can t see", "not working", "but no", "but course", "but not"],
  allNumbers: ["contact numbers", "phone numbers", "your numbers", "all numbers", "both numbers", "contact details", "all your numbers"],
};

// The tracks people ask for, matched to words in a program's title / points.
const TRACKS = [
  { label: "Web development (MERN, React, Node)", words: ["web", "mern", "react", "node", "javascript", "full stack", "fullstack", "frontend", "backend", "website"] },
  { label: "AI, ML & agents", words: ["ai", "ml", "machine learning", "agent", "agentic", "rag", "llm", "genai", "data science", "python"] },
  { label: "Android apps", words: ["android", "kotlin", "java", "mobile"] },
  { label: "Databases & SQL", words: ["sql", "database", "mysql", "db"] },
];

const SERVICE_NEEDS = [
  { label: "A business website", say: "I need a website for my business", words: ["website", "web site", "landing", "portfolio", "static"] },
  { label: "An online store", say: "I need an online store", words: ["ecommerce", "e commerce", "online store", "shop", "store"] },
  { label: "A mobile app", say: "I need a mobile app", words: ["mobile", "android", "ios", "app "] },
  { label: "A chatbot or AI tool", say: "I need a chatbot or AI solution", words: ["chatbot", "bot", "ai", "automation", "ml"] },
  { label: "Marketing & SEO", say: "I need digital marketing and SEO", words: ["seo", "marketing", "ads", "social media", "google ranking"] },
  { label: "Something else", say: "I need custom software", words: ["software", "crm", "erp", "custom", "dashboard", "portal"] },
];

const topicOf = (n) => {
  const order = ["payments", "wallet", "account", "careers", "services", "programs"];
  const scores = order.map((t) => [t, WORDS[t].filter((w) => n.includes(` ${w}`)).length]);
  const best = scores.reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0]);
  return best[1] > 0 ? best[0] : null;
};

const firstName = (user) => {
  if (!user || user.profilePending) return "";
  const n = String(user.name || "").trim().split(/\s+/)[0];
  return n && n.length <= 20 ? n : "";
};

// ---------- what the agent knows ----------
const programText = (p) => `${p.title} ${(p.points || []).join(" ")} ${p.desc || ""}`.toLowerCase();
const programLink = (p) => (p.slug ? { to: `/programs/${p.slug}`, label: p.title } : { to: "/programs", label: p.title });
const kindOf = (p) => (p.type === "internship" ? "Internship" : p.type === "course" ? "Course" : p.kind === "internship" ? "Internship" : "Course");

// Whole-word match, so "web" doesn't find "website" or "ai" find "maintain".
// (Track words are plain letters and spaces, so they need no regex escaping.)
const mentions = (text, w) => new RegExp(`(^|[^a-z0-9])${w.trim()}([^a-z0-9]|$)`).test(text);

// Programs for the track asked about — first those naming the exact technology
// typed ("react"), and only then anything else in that track.
function matchPrograms(programs, n) {
  const track = TRACKS.find((t) => has(n, t.words));
  if (!track) return { track: null, list: [] };
  const typed = track.words.filter((w) => has(n, [w]));
  const exact = programs.filter((p) => typed.some((w) => mentions(programText(p), w)));
  const list = exact.length ? exact : programs.filter((p) => track.words.some((w) => mentions(programText(p), w)));
  return { track, list };
}

function programsReply(ctx, n) {
  const programs = ctx.programs || [];
  const { track, list } = matchPrograms(programs, n);
  const wantsInternship = has(n, ["internship", "intern "]);
  const wantsCourse = has(n, ["course"]);
  if (track && list.length) {
    const shown = list.filter((p) => (wantsInternship ? kindOf(p) === "Internship" : wantsCourse ? kindOf(p) === "Course" : true));
    const pick = (shown.length ? shown : list).slice(0, 4);
    return {
      text: `For ${track.label}, these would suit you:\n${pick.map((p) => `• ${p.title} (${kindOf(p)})`).join("\n")}\nEach page shows the plans, price and what's included.`,
      links: pick.map(programLink),
      chips: [{ label: "How do I join?", say: "How do I join?" }, { label: "Is there a certificate?", say: "Do I get a certificate?" }, { label: "Other tracks", say: "Show me other tracks" }],
    };
  }
  return {
    text: `Happy to help you pick. ${wantsCourse ? "Courses are self-paced with mentor support" : wantsInternship ? "Internships are virtual, with an offer letter, a certificate and an LOR" : "We run virtual internships (offer letter, certificate, LOR) and self-paced courses (certificate)"} — all fully online, from anywhere in India.\nWhich area interests you?`,
    chips: [...TRACKS.map((t) => ({ label: t.label, say: `${wantsCourse ? "Courses" : wantsInternship ? "Internships" : "Programs"} in ${t.words[0]}` })), { label: "Show everything", say: "Show all programs" }],
    links: [{ to: "/programs", label: "All internships & courses" }],
  };
}

function allProgramsReply(ctx) {
  const programs = ctx.programs || [];
  const intern = programs.filter((p) => kindOf(p) === "Internship");
  const course = programs.filter((p) => kindOf(p) === "Course");
  const lines = [
    intern.length && `Internships:\n${intern.slice(0, 6).map((p) => `• ${p.title}`).join("\n")}`,
    course.length && `Courses:\n${course.slice(0, 8).map((p) => `• ${p.title}`).join("\n")}`,
  ].filter(Boolean);
  return {
    text: lines.length ? lines.join("\n") : "All our internships and courses are on the Programs page.",
    links: [{ to: "/programs", label: "Open the Programs page" }],
    chips: TRACKS.map((t) => ({ label: t.label, say: `Programs in ${t.words[0]}` })),
  };
}

function careersReply(ctx) {
  const roles = (ctx.openings || []).filter((o) => o && o.status !== "closed");
  if (!roles.length) {
    return {
      text: "There's no open role right now — new openings are posted on the Careers page first, so do check back.\nMeanwhile, our internships on the Programs page are open to join any time.",
      links: [{ to: "/careers", label: "Careers page" }, { to: "/programs", label: "Internships & courses" }],
    };
  }
  return {
    text: `We're hiring for:\n${roles.slice(0, 6).map((o) => `• ${o.title} — ${o.feeRequired === false ? "free to apply" : "registration fee applies"}${o.stipend ? ` · ${o.stipend}` : ""}`).join("\n")}\nFreshers are welcome. You apply on the Careers page, take an online aptitude test, and shortlisted candidates get an interview.`,
    links: [{ to: "/careers", label: "See roles & apply" }],
    chips: [{ label: "How does the test work?", say: "What is the aptitude test like?" }, { label: "Is there a fee?", say: "Is there a fee for careers?" }, { label: "When do I get results?", say: "When will I get my result?" }],
  };
}

function servicesReply(ctx, n) {
  const need = SERVICE_NEEDS.find((s) => has(n, s.words));
  if (!need) {
    return {
      text: "We build for businesses in India and abroad — websites, web & mobile apps, chatbots and AI tools, and digital marketing. What do you need?",
      chips: SERVICE_NEEDS.map((s) => ({ label: s.label, say: s.say })),
      links: [{ to: "/services", label: "All IT services" }],
    };
  }
  const services = ctx.services || [];
  // Most specific word first, and a service's title before its description.
  const lower = (x) => String(x || "").toLowerCase();
  const match = need.words.map((w) => services.find((s) => lower(s.title).includes(w.trim()))).find(Boolean)
    || services.find((s) => need.words.some((w) => lower(s.desc).includes(w.trim())));
  return {
    text: `${need.label} — yes, we do that${match ? ` (see “${match.title}”)` : ""}. Every project is quoted on what you need, so there's no fixed price list.\nThe quickest way: send a short description through the inquiry form on the Services page, and our IT team will get back to you with a plan and a quote.`,
    links: [{ to: "/services", label: "Request a quote" }, { to: "/contact", label: "Contact form" }],
    chips: [{ label: "How long does it take?", say: "How long does a project take?" }, { label: "Talk to the IT team", say: "Talk to the IT services team" }],
  };
}

function priceReply(state, ctx) {
  if (state.topic === "careers") {
    return { text: "It depends on the role: each role on the Careers page shows either “Free to apply” or its aptitude-test registration fee. Where there is a fee, the whole amount comes back to your wallet as credit.", links: [{ to: "/careers", label: "See roles" }] };
  }
  if (state.topic === "services") {
    return { text: "IT projects are quoted individually — the price depends on what you need (pages, features, integrations). Send your requirements through the Services page and we'll send a quote.", links: [{ to: "/services", label: "Request a quote" }] };
  }
  if (state.topic === "programs") {
    return { text: "Each program's price is on its own page — most have Basic, Plus and Pro plans, and any discount running is shown there too. Wallet credit and offer codes are taken off at checkout.", links: [{ to: "/programs", label: "See programs & prices" }] };
  }
  return {
    text: "Happy to help with pricing — which one is it about?",
    chips: [{ label: "Internships & courses", say: "Price of internships and courses" }, { label: "Careers test fee", say: "Is there a fee for careers?" }, { label: "IT services", say: "Price of IT services" }],
  };
}

function applyReply(state, ctx) {
  const missing = ctx.user && (ctx.user.profilePending || !String(ctx.user.phone || "").trim());
  const profileNote = missing ? "\nBefore paying, add your full name and phone number in your Profile — checkout asks for them." : "";
  if (state.topic === "careers") {
    return { text: `• Log in (a new email gets an account straight away)\n• Pick a role on the Careers page and press Apply Now\n• Accept the terms — and pay the registration fee if the role has one\n• Take the online aptitude test${profileNote}`, links: [{ to: "/careers", label: "Careers page" }] };
  }
  if (state.topic === "services") {
    return { text: "Send us your requirements from the Services page (or the contact form). Our IT team replies, sets up a quick call, and shares a plan and quote.", links: [{ to: "/services", label: "Services page" }] };
  }
  return {
    text: `• Open the program on the Programs page\n• Choose a plan and press Buy\n• Log in with your email and a password (a new email gets an account)\n• Accept the terms and pay — access is instant${profileNote}`,
    links: [{ to: "/programs", label: "Programs" }, ...(missing ? [{ to: "/profile", label: "Complete your profile" }] : [])],
  };
}

function accountReply(ctx) {
  const u = ctx.user;
  if (u && (u.profilePending || !String(u.phone || "").trim())) {
    return {
      text: `You're logged in as ${u.email}. Your profile still needs your ${[u.profilePending && "full name", !String(u.phone || "").trim() && "phone number"].filter(Boolean).join(" and ")} — you'll need them before buying anything.`,
      links: [{ to: "/profile", label: "Complete your profile" }],
      chips: [{ label: "Forgot password", say: "I forgot my password" }, { label: "Logged out?", say: "Why was I logged out?" }],
    };
  }
  return {
    text: u ? `You're logged in as ${u.email}. What do you need help with?` : "There's one Log in box for everyone: enter your email and a password. If the email is new, we ask you to confirm and your account is created with that password. What do you need help with?",
    chips: [{ label: "Forgot password", say: "I forgot my password" }, { label: "Why was I logged out?", say: "Why was I logged out?" }, { label: "Change my details", say: "How do I change my phone number?" }, { label: "Delete my account", say: "How do I delete my account?" }],
    links: u ? [{ to: "/profile", label: "My profile" }] : [],
  };
}

function paymentsReply(n) {
  if (has(n, WORDS.failure)) {
    return {
      text: "Sorry about that — here's what to do:\n• Wait 10 minutes and refresh My Dashboard: most payments confirm on their own\n• If money was taken but nothing unlocked, it's confirmed or returned by Razorpay automatically, usually within 5–7 working days\n• Still stuck? Call our Internships & Courses team with your payment ID and the email you used",
      links: [{ to: "/dashboard", label: "My Dashboard" }],
      dept: "programs",
    };
  }
  return {
    text: "I can help with payments. What's happening?",
    chips: [{ label: "Money deducted, no access", say: "Money deducted but no access" }, { label: "Refund policy", say: "What is your refund policy?" }, { label: "Download a receipt", say: "Where is my receipt?" }, { label: "Payment methods", say: "Which payment methods do you accept?" }],
  };
}

function handoffReply(state) {
  const dept = TOPIC_DEPT[state.topic];
  if (!dept) {
    return {
      text: "Sure — we have two separate teams, each with its own number. Which is your question about?",
      chips: [{ label: "Internships, courses or careers", say: "Talk to the internships and courses team" }, { label: "IT services for a business", say: "Talk to the IT services team" }],
      pending: "handoff",
    };
  }
  return {
    text: dept === "it" ? "Here's our IT services team — for websites, apps and business projects:" : "Here's our Internships & Courses team — for programs, careers, payments and student accounts:",
    dept,
  };
}

// `prefer`: the message's own topic — among close matches, an answer from that
// topic goes first ("refund rule for a course" is about payments, not courses).
function faqReply(text, prefer) {
  const found = searchFaqs(text);
  if (!found.length) return null;
  // Look a little further down the list for an answer from the message's own topic.
  const wider = prefer ? searchFaqs(text, 6, 0.3) : found;
  const preferred = wider.find((f) => FAQ_TOPIC_MAP[f.topic] === prefer);
  const hits = preferred && preferred !== found[0] ? [preferred, ...found.filter((f) => f !== preferred)].slice(0, 3) : found;
  const [best, ...more] = hits;
  return { text: best.a, links: best.links, dept: best.dept, more: more.map((f) => ({ id: f.id, q: f.q })), topicFromFaq: best.topic, matchedQ: best.q };
}

const FAQ_TOPIC_MAP = { internships: "programs", courses: "programs", careers: "careers", payments: "payments", account: "account", referrals: "wallet", it: "services", company: null };

// ---------- answers an admin taught it ----------
const SMALL = new Set(["the", "and", "for", "you", "your", "are", "can", "how", "what", "who", "when", "where", "does", "this", "that", "with", "have", "will", "from", "about", "please", "tell", "want", "need", "get", "any", "not", "is", "it", "to", "of", "my", "me", "in", "on", "a", "i", "do"]);
const keyTokens = (t) => (String(t || "").toLowerCase().match(/[a-z0-9₹]+/g) || []).map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)).filter((w) => w.length >= 3 && !SMALL.has(w));

function taughtReply(u, taught) {
  const asked = new Set(keyTokens(u));
  if (!asked.size || !(taught || []).length) return null;
  let best = null;
  let bestScore = 0;
  for (const t of taught) {
    const theirs = new Set(keyTokens(`${t.q} ${t.keywords || ""}`));
    const hits = [...asked].filter((w) => theirs.has(w)).length;
    const sim = similarity(u, t.q);
    const score = hits + sim * 2;
    if ((hits >= 2 || (hits >= 1 && asked.size <= 2) || sim >= 0.55) && score > bestScore) { best = t; bestScore = score; }
  }
  if (!best) return null;
  return {
    text: best.a,
    links: best.linkTo ? [{ to: best.linkTo, label: best.linkLabel || "Read more" }] : [],
    dept: best.dept || undefined,
  };
}

// The closest known questions to a message nothing matched, as "did you mean" chips.
function closestQuestions(u, taught) {
  return [...ALL_FAQS.map((f) => f.q), ...(taught || []).map((t) => t.q)]
    .map((q) => ({ q, s: similarity(u, q) }))
    .filter((x) => x.s >= 0.28)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => ({ label: x.q, say: x.q }));
}

// ---------- the conversation ----------
export function greeting(ctx) {
  const name = firstName(ctx && ctx.user);
  return {
    text: `Hi${name ? ` ${name}` : ""}! 👋 I'm the Crix help agent. Tell me what you're looking for — a program to join, a job, or a project for your business — and I'll point you to the right place.`,
    chips: MAIN_CHIPS,
  };
}

export const initialState = () => ({ topic: null, pending: null });

// The words the agent can recognise for this data. Build once per data load and
// pass as ctx.vocab (components/HelpAgent.jsx memoises it); respond() builds it
// itself when it isn't given one.
export function vocabFor(ctx = {}) {
  return buildVocab([
    Object.values(WORDS).flat(), TRACKS.flatMap((t) => t.words), SERVICE_NEEDS.flatMap((x) => x.words),
    ALL_FAQS.map((f) => `${f.q} ${f.k || ""}`), (ctx.programs || []).map((p) => p.title), (ctx.openings || []).map((o) => o.title),
    (ctx.taught || []).map((t) => `${t.q} ${t.keywords || ""}`),
  ]);
}

export function respond(state, text, ctx = {}) {
  // Hinglish, synonyms and typos first: "internshp kitne ka hai" reads as "internship price".
  const u = understand(text, ctx.vocab || vocabFor(ctx));
  const n = norm(u);
  const words = norm(text).trim().split(" ").filter(Boolean);
  const short = words.length <= 4;
  const next = { ...state, pending: null };
  // `about`: the program / role being discussed, so "how much?" next is about it.
  const out = (reply, topic = next.topic, about) => {
    const { pending, topicFromFaq, matchedQ, ...r } = reply;
    const keep = about !== undefined ? about : topic === state.topic ? state.about || null : null;
    return { state: { ...next, topic, pending: pending || null, about: keep }, replies: [r] };
  };

  // Answering the agent's own question ("which team?").
  if (state.pending === "handoff") {
    if (has(n, ["it ", "business", "website", "app ", "service", "project"])) return out(handoffReply({ topic: "services" }), "services");
    if (has(n, ["intern", "course", "career", "job", "student", "program", "payment"])) return out(handoffReply({ topic: "programs" }), "programs");
  }

  if (short && has(n, WORDS.thanks)) return out({ text: "You're welcome! Anything else I can help with?", chips: MAIN_CHIPS.slice(0, 4) });
  if (short && has(n, WORDS.bye)) return out({ text: "Bye for now! I'm here whenever you need me. 👋" });
  if (short && has(n, WORDS.greet) && !topicOf(n)) return out(greeting(ctx));
  if (short && has(n, WORDS.no)) return out({ text: "No problem. What else can I help with?", chips: MAIN_CHIPS });
  if (has(n, ["main topics", "start over", "menu"])) return out({ text: "Sure — what would you like help with?", chips: MAIN_CHIPS }, null);

  const topic = topicOf(n);
  const ctxTopic = topic || state.topic;
  const wants = has(n, WORDS.want);
  // A message that is nothing but the topic's name ("internships", "IT services").
  const bare = (extra) => words.every((w) => [...extra, "and", "or", "the", "a", "any", "my", "for", "about", "info", "please", "details"].includes(w));
  const track = TRACKS.some((t) => has(n, t.words));

  // "What are your numbers?" — both teams, each labelled with who it's for.
  if (has(n, WORDS.allNumbers)) {
    return out({ text: "We have two separate teams, each with its own number — please call the one your question is for:", dept: "both", links: [{ to: "/contact", label: "Contact page" }] });
  }
  if (has(n, ["other tracks", "all programs", "show everything", "everything"])) return out(allProgramsReply(ctx), "programs");
  if (has(n, WORDS.human) && !has(n, ["change my phone", "change phone", "update phone", "phone number change"])) {
    return out(handoffReply({ topic: ctxTopic }), ctxTopic);
  }

  // A program or role named outright ("price of MERN?", "stipend for the data science intern").
  const careerish = topic === "careers" || state.topic === "careers" || has(n, ["stipend", "role", "aptitude", "intern ", "hiring", "job"]);
  const role = careerish ? findNamed(ctx.openings, n) : null;
  if (role) return out(roleAnswer(role, n), "careers", { kind: "role", title: role.title });
  // Only the kind asked for: "an internship in react" isn't asking about the React.js course.
  const kindAsked = has(n, ["internship", "intern "]) ? "internship" : has(n, ["course"]) ? "course" : null;
  const program = findNamed((ctx.programs || []).filter((p) => !kindAsked || !p.type || p.type === kindAsked), n);
  if (program && (topic === "programs" || !topic || has(n, WORDS.price))) return out(programAnswer(program, n), "programs", { kind: "program", title: program.title });

  // Short follow-ups ("how much?", "how long?", "how do I join?") are about what was being discussed.
  const aboutList = state.about ? (state.about.kind === "program" ? ctx.programs : ctx.openings) || [] : [];
  const about = state.about && aboutList.find((x) => x.title === state.about.title);
  if (about && words.length <= 5 && (has(n, WORDS.price) || has(n, ["duration", "how long", "start", "certificate", "syllabus", "cover", "stipend", "test", "eligib", "remote", "mode"]))) {
    return state.about.kind === "program" ? out(programAnswer(about, n), "programs") : out(roleAnswer(about, n), "careers");
  }
  if (has(n, WORDS.price) && words.length <= 3) return out(priceReply({ topic: state.topic }, ctx));
  if (has(n, WORDS.apply) && short && (!topic || topic === state.topic)) return out(applyReply({ topic: ctxTopic }, ctx), ctxTopic);

  // Something an admin has taught the agent to answer.
  const taught = taughtReply(u, ctx.taught);
  if (taught) return out(taught, ctxTopic);

  // Guided flows: someone describing what they're after.
  if (has(n, WORDS.careerList)) return out(careersReply(ctx), "careers");
  if (topic === "careers" && wants) return out(careersReply(ctx), "careers");
  if ((topic === "payments" || has(n, [" paid", "payment"])) && has(n, WORDS.failure)) return out(paymentsReply(n), "payments");
  if (topic === "account" && (wants || bare(["account", "help", "with", "login", "profile"]))) return out(accountReply(ctx), "account");
  if (topic === "services" && (wants || has(n, ["it services", "it service"]) || SERVICE_NEEDS.some((x) => has(n, x.words)))) {
    return out(servicesReply(ctx, n), "services");
  }
  if (topic === "programs" && (wants || track || bare(["internship", "internships", "course", "courses", "program", "programs", "training"]))) {
    return out(programsReply(ctx, n), "programs");
  }
  // Naming a track while talking about programs ("python", "android").
  if (track && state.topic === "programs" && !topic) return out(programsReply(ctx, n), "programs");

  // A specific question: the answer bank.
  // An answer found only after typo-correcting the message must also look like
  // its question — otherwise "random words" -> "random works" finds "how does it work".
  const faq = faqReply(u, topic);
  const trusted = faq && (searchFaqs(text).length > 0 || words.length <= 3 || similarity(u, faq.matchedQ) >= 0.3);
  if (faq && trusted) return out(faq, FAQ_TOPIC_MAP[faq.topicFromFaq] || ctxTopic);

  // Otherwise, the topic's own guide.
  if (topic === "careers") return out(careersReply(ctx), "careers");
  if (topic === "services") return out(servicesReply(ctx, n), "services");
  if (topic === "programs") return out(programsReply(ctx, n), "programs");
  if (topic === "payments") return out(paymentsReply(n), "payments");
  if (topic === "account") return out(accountReply(ctx), "account");
  if (has(n, WORDS.price)) return out(priceReply({ topic: ctxTopic }, ctx), ctxTopic);

  // A track name on its own ("python", "android").
  if (TRACKS.some((t) => has(n, t.words))) return out(programsReply(ctx, n), "programs");

  // Nothing fits: offer the closest questions, else the main topics. Either way
  // the question is noted (anonymously) so an admin can teach the answer.
  const close = closestQuestions(u, ctx.taught);
  return {
    state: { ...next, unanswered: true },
    replies: [close.length
      ? { text: "I'm not completely sure what you mean — is it one of these? (I've also noted your question so the team can teach me.)", chips: [...close, { label: "Something else", say: "Show me the main topics" }] }
      : { text: "I'm not sure I understood that one — I've noted it so the team can teach me. Could you tell me which of these it's about?", chips: MAIN_CHIPS }],
  };
}

// An answer-bank entry picked from a "Related" button.
export function answerFor(id) {
  const f = ALL_FAQS.find((x) => x.id === id);
  return f ? { text: f.a, links: f.links, dept: f.dept } : null;
}
