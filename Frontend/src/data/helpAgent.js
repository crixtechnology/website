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
//     links  [{ to | href, label }] — only where the next step happens on another
//            page (a form, checkout, applying, a legal document). The answer
//            itself is always in `text`; a link is never a substitute for it.
//   No reply states an amount of money (a price, fee, discount or stipend): those
//   are shown on the program's page or the role's card, where they're always current.
//   The wallet's rate (1 credit = ₹1) isn't a price and is said where it helps.
//     chips  quick replies: [{ label, say, icon?, hint? }] — `say` is sent back as the user's message
//     dept   "it" | "programs" | "both": show that department's contact card
//     more   related answer-bank entries: [{ id, q }]
import { site, programDeliverables, clientProcess, engagementModels } from "./content.js";
import { ALL_FAQS, searchFaqs } from "./faqData.js";
import { understand, buildVocab, similarity } from "./agentLanguage.js";
import { findNamed, programAnswer, roleAnswer, programLine } from "./agentKnowledge.js";
import { freeEligibility, CV_MAX_MB, RESULT_DAYS } from "./freeInternships.js";

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
const TOPIC_DEPT = { programs: "programs", careers: "programs", free: "programs", payments: "programs", account: "programs", wallet: "programs", services: "it" };

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
  clientTerms: ["refund", "money back", "own", "ownership", "copyright", "intellectual property", "source code", "nda", "confidential", "late", "delay", "deadline", "cancel", "terms", "contract"],
  // Naming the unlisted free internships page (see freeInternshipReply).
  freeInternship: ["free internship", "free intern ", "processing fee", "₹94", "94 fee", "rs 94", "94 rupees", "bca internship"],
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
const HOURS_LINE = `We're available ${site.hours}. You can also email ${site.email} — we reply within two working days.`;
const PROCESS_LINES = clientProcess.map((s) => `• ${s.title} — ${s.desc}`).join("\n");
const MODEL_LINES = engagementModels.map((m) => `• ${m.title} — ${m.desc}`).join("\n");

// A service in one line: what it covers, from its points (or its description).
const serviceLine = (s) => `• ${s.title} — ${(s.points || []).length ? s.points.slice(0, 5).join(", ") : s.desc || ""}`;

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

// What each kind of program is and what comes with it, said in full in the chat.
const INTERNSHIP_LINE = `• Virtual internships (15 days, 1, 3 or 6 months) — real project tasks by email, built with mentor guidance. You get: ${programDeliverables.internship.join(", ").toLowerCase()}.`;
const COURSE_LINE = `• Self-paced courses — live classes and recorded lectures in My Dashboard, with mentor support. You get: ${programDeliverables.course.join(", ").toLowerCase()}.`;

function programsReply(ctx, n) {
  const programs = ctx.programs || [];
  const { track, list } = matchPrograms(programs, n);
  const wantsInternship = has(n, ["internship", "intern "]);
  const wantsCourse = has(n, ["course"]);
  if (track && list.length) {
    const shown = list.filter((p) => (wantsInternship ? kindOf(p) === "Internship" : wantsCourse ? kindOf(p) === "Course" : true));
    const pick = (shown.length ? shown : list).slice(0, 4);
    return {
      text: `For ${track.label}, these would suit you:\n${pick.map(programLine).join("\n")}\nAll are fully online, open to anyone in India. Ask me about any of them — its plans, what it covers or how long it runs — or open it below to see the price and enrol.`,
      links: pick.map(programLink),
      chips: [{ label: "How do I join?", say: "How do I join?" }, { label: "Is there a certificate?", say: "Do I get a certificate?" }, { label: "Other tracks", say: "Show me other tracks" }],
    };
  }
  return {
    text: `Happy to help you pick. ${wantsCourse ? "Here's how our courses work" : wantsInternship ? "Here's how our internships work" : "We run two kinds of programs"} — fully online, from anywhere in India:\n${[!wantsCourse && INTERNSHIP_LINE, !wantsInternship && COURSE_LINE].filter(Boolean).join("\n")}\nWhich area interests you?`,
    chips: [...TRACKS.map((t) => ({ label: t.label, say: `${wantsCourse ? "Courses" : wantsInternship ? "Internships" : "Programs"} in ${t.words[0]}` })), { label: "Show everything", say: "Show all programs" }],
  };
}

function allProgramsReply(ctx) {
  const programs = ctx.programs || [];
  const intern = programs.filter((p) => kindOf(p) === "Internship");
  const course = programs.filter((p) => kindOf(p) === "Course");
  const lines = [
    intern.length && `Internships — each with ${programDeliverables.internship.join(", ").toLowerCase()}:\n${intern.slice(0, 6).map(programLine).join("\n")}`,
    course.length && `Courses — each with a ${programDeliverables.course[0].toLowerCase()}:\n${course.slice(0, 8).map(programLine).join("\n")}`,
  ].filter(Boolean);
  return {
    text: lines.length ? `${lines.join("\n")}\nAsk me about any of them by name.` : "Our internships and courses are being updated — the Programs page shows what's open right now.",
    links: [{ to: "/programs", label: "Browse & enrol" }],
    chips: TRACKS.map((t) => ({ label: t.label, say: `Programs in ${t.words[0]}` })),
  };
}

const CAREER_STEPS = "How it works:\n• Log in and press Apply Now on the role\n• Accept the terms, and pay the registration fee if the role has one — the whole fee comes back to your wallet as credit\n• Take the online aptitude test (laptop, webcam on, full screen)\n• You hear within 7 days whether you're shortlisted; shortlisted candidates get an online interview";

const openRoles = (ctx) => (ctx.openings || []).filter((o) => o && o.status !== "closed");
const roleLine = (o) => `• ${o.title} — ${o.feeRequired === false ? "free to apply" : "registration fee applies"}${o.stipend ? " · with a stipend" : ""}${o.duration ? ` · ${o.duration}` : ""}`;

function careersReply(ctx) {
  const roles = openRoles(ctx);
  if (!roles.length) {
    return {
      text: `There's no open role right now — new openings are posted on the Careers page first, so do check back.\nMeanwhile, our paid internships are open to join any time:\n${INTERNSHIP_LINE}`,
      links: [{ to: "/programs", label: "Browse internships" }],
      chips: [{ label: "Internships", say: "Internships and courses" }],
    };
  }
  return {
    text: `We're hiring for:\n${roles.slice(0, 6).map(roleLine).join("\n")}\nFreshers aged 18+ from anywhere in India are welcome.\n${CAREER_STEPS}`,
    links: [{ to: "/careers", label: "Apply on the Careers page" }],
    chips: [{ label: "How does the test work?", say: "What is the aptitude test like?" }, { label: "Is there a fee?", say: "Is there a fee for careers?" }, { label: "When do I get results?", say: "When will I get my result?" }],
  };
}

function servicesReply(ctx, n) {
  const services = ctx.services || [];
  const need = SERVICE_NEEDS.find((s) => has(n, s.words));
  if (!need) {
    return {
      text: services.length
        ? `We build for businesses in India and around the world. Our IT services:\n${services.slice(0, 12).map(serviceLine).join("\n")}\nWhat do you need? I can tell you how a project works, how pricing works, and who to talk to.`
        : "We build for businesses in India and around the world — websites, custom software, web & mobile apps, chatbots and AI tools, integrations, cloud, and digital marketing. What do you need?",
      chips: SERVICE_NEEDS.map((s) => ({ label: s.label, say: s.say })),
    };
  }
  // Most specific word first, and a service's title before its description.
  const lower = (x) => String(x || "").toLowerCase();
  const match = need.words.map((w) => services.find((s) => lower(s.title).includes(w.trim()))).find(Boolean)
    || services.find((s) => need.words.some((w) => lower(s.desc).includes(w.trim())));
  return {
    text: [
      `${need.label} — yes, we do that${match ? `, as part of “${match.title}”` : ""}.`,
      match && match.desc,
      `How a project runs:\n${PROCESS_LINES}`,
      "Pricing: every project is quoted on its scope — pages, features, integrations and timeline — with a written estimate before any work starts, so there's no fixed price list.",
      `To get a quote, send a short description through the inquiry form, or call our IT Services team on ${site.phone} (${site.hours}).`,
    ].filter(Boolean).join("\n"),
    links: [{ to: "/services", label: "Send an inquiry" }],
    chips: [{ label: "Ways to work with us", say: "How can we work together?" }, { label: "Which technologies?", say: "Which technologies do you use?" }, { label: "Talk to the IT team", say: "Talk to the IT services team" }],
  };
}

// ---------- the free internships ----------
// That page is shared only by its address and never advertised (data/freeInternships.js),
// so these answers are given only to someone who names it ("free internship", "the
// processing fee"): nothing else here mentions it, and it isn't in the answer bank, whose
// questions show up as suggestions. No link to it either — they already have the address.
const FREE_STEPS = [
  "Sign up — create your free Crix account with your email, or log in",
  "Apply with your CV — pick a role, add your college, course, branch and semester, and upload your CV",
  "Pay the test processing fee shown on the page — it comes back to your wallet as credit",
  "Take the online aptitude test — straight away, or later from My Dashboard",
  `Get your result — by email within ${RESULT_DAYS} days of submitting the test, selected or not selected`,
];

function freeInternshipReply(n) {
  const facts = [];
  // ("free" is in its name, so it doesn't count as asking about the price.)
  if (has(n, [...WORDS.price.filter((w) => w !== "free"), "refund", "credit", "wallet", "pay", "money", "94", "₹94"])) {
    facts.push(`The internship itself is free. The only charge is the aptitude-test processing fee shown on the page, paid through Razorpay. The whole fee comes back to your Crix wallet as credit as soon as the payment is confirmed — 1 credit = ₹1, to use on Crix courses and internships. It's never refunded in cash and can't be withdrawn, and paying it doesn't guarantee selection. Crix Technology never asks for any other payment — if anyone does, don't pay and tell us.`);
  }
  if (has(n, ["cv", "resume", "pdf", "upload"])) {
    facts.push(`Your CV must be a PDF of up to ${CV_MAX_MB} MB, in your own name, and true. You can replace it until you start the test.`);
  }
  if (has(n, ["eligib", "who can", "field", "stream", "branch", "bca", "age", "year"])) {
    facts.push(`Who can apply:\n${freeEligibility.map((x) => `• ${x}`).join("\n")}`);
  }
  if (has(n, ["result", "selected", "when", "hear back"])) {
    facts.push(`Results — selected or not selected — are emailed to you within ${RESULT_DAYS} days of submitting the test, and shown in My Dashboard → My Applications. If you're not selected, you can apply again after the waiting period shown when you try.`);
  }
  if (!facts.length) {
    facts.push(
      `The free internships are for students of any field, with real project work and mentors from Crix Technology. To apply:\n${FREE_STEPS.map((x) => `• ${x}`).join("\n")}`,
      `You need to be 18 or older and in India, with a laptop or desktop and a working webcam for the test. You can apply for more than one role; each has its own test, and you get one attempt per application.`,
    );
  }
  return {
    text: facts.join("\n"),
    chips: [
      { label: "About the fee", say: "free internship processing fee" },
      { label: "Who can apply?", say: "free internship eligibility" },
      { label: "The test rules", say: "What are the test rules? What do I need?" },
      { label: "When's the result?", say: "free internship result when" },
    ],
  };
}

function priceReply(state, ctx) {
  if (state.topic === "free") return freeInternshipReply(norm("fee"));
  if (state.topic === "careers") {
    const roles = openRoles(ctx);
    return {
      text: `It depends on the role: each one is either “Free to apply” or has an aptitude-test registration fee.${roles.length ? `\n${roles.slice(0, 6).map(roleLine).join("\n")}` : ""}\nWhere there is a fee, the whole amount comes back to your wallet as credit (1 credit = ₹1), to use on any Crix course or internship. It can't be withdrawn as cash.`,
      links: roles.length ? [{ to: "/careers", label: "Apply on the Careers page" }] : [],
    };
  }
  if (state.topic === "services") {
    return {
      text: `IT projects are quoted individually — the price depends on what you need (pages, features, integrations, timeline), and you get a clear written estimate before any work starts. There are three ways to work with us:\n${MODEL_LINES}\nShare your requirements through the inquiry form, or call our IT Services team on ${site.phone}, for a quote.`,
      links: [{ to: "/services", label: "Request a quote" }],
    };
  }
  if (state.topic === "programs") {
    return {
      text: "Each program has its own price, usually in Basic, Plus and Pro plans with different features, and any discount running is taken off. You'll see the price on the program's page when you enrol. Wallet credit and offer codes come off at checkout, and if your credit covers the whole price you can pay with the wallet alone.",
      links: [{ to: "/programs", label: "See prices & enrol" }],
    };
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
    return { text: `• Log in (a new email gets an account straight away)\n• Pick a role on the Careers page and press Apply Now\n• Accept the terms — and pay the registration fee if the role has one (it comes back as wallet credit)\n• Take the online aptitude test\n• Hear back within 7 days; if shortlisted, you get an online interview${profileNote}`, links: [{ to: "/careers", label: "Apply on the Careers page" }] };
  }
  if (state.topic === "services") {
    return {
      text: `Starting a project:\n• Send a short description of what you need through the inquiry form — or call our IT Services team on ${site.phone}\n• We set up a quick call to understand your goals, users and constraints\n• You get a written proposal with the timeline, deliverables and cost\n• Once you approve it, we build in short, reviewable iterations and stay on for support`,
      links: [{ to: "/services", label: "Send an inquiry" }],
    };
  }
  return {
    text: `• Open the program on the Programs page\n• Choose a plan and press Buy\n• Log in with your email and a password (a new email gets an account)\n• Accept the terms and pay by card, UPI, net-banking or wallet — access is instant${profileNote}`,
    links: [{ to: "/programs", label: "Browse & enrol" }, ...(missing ? [{ to: "/profile", label: "Complete your profile" }] : [])],
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
    text: `${dept === "it" ? "Here's our IT services team — for websites, apps and business projects." : "Here's our Internships & Courses team — for programs, careers, payments and student accounts."}\n${HOURS_LINE}`,
    dept,
  };
}

// `prefer`: the message's own topic — among close matches, an answer from that
// topic goes first ("refund rule for a course" is about payments, not courses).
function faqReply(text, prefer, ctx) {
  const found = searchFaqs(text);
  if (!found.length) return null;
  // Look a little further down the list for an answer from the message's own topic.
  const wider = prefer ? searchFaqs(text, 6, 0.3) : found;
  const preferred = wider.find((f) => FAQ_TOPIC_MAP[f.topic] === prefer);
  const hits = preferred && preferred !== found[0] ? [preferred, ...found.filter((f) => f !== preferred)].slice(0, 3) : found;
  const [best, ...more] = hits;
  return { ...faqAnswer(best, ctx), more: more.map((f) => ({ id: f.id, q: f.q })), topicFromFaq: best.topic, matchedQ: best.q };
}

// "What do you offer?" answers listed from the live data when it has any, so the
// chat shows what's actually open (with prices) instead of the static list.
const LIVE_ANSWERS = {
  "i-offer": (ctx) => {
    const list = (ctx.programs || []).filter((p) => kindOf(p) === "Internship");
    return list.length && `Our virtual internships right now:\n${list.map(programLine).join("\n")}\nEvery internship includes: ${programDeliverables.internship.join(", ").toLowerCase()}. All fully online, from anywhere in India.`;
  },
  "c-offer": (ctx) => {
    const list = (ctx.programs || []).filter((p) => kindOf(p) === "Course");
    return list.length && `Our online courses right now:\n${list.map(programLine).join("\n")}\nEach is self-paced with mentor support and ends with a ${programDeliverables.course[0].toLowerCase()}.`;
  },
  "s-offer": (ctx) => (ctx.services || []).length && `Our IT services, for businesses in India and around the world:\n${ctx.services.slice(0, 12).map(serviceLine).join("\n")}`,
  "k-open": (ctx) => openRoles(ctx).length && careersReply(ctx).text,
};

function faqAnswer(f, ctx = {}) {
  const live = LIVE_ANSWERS[f.id] && LIVE_ANSWERS[f.id](ctx);
  return { text: live || f.a, links: f.links, dept: f.dept };
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
    text: `Hi${name ? ` ${name}` : ""}! 👋 I'm the Crix help agent. Tell me what you're looking for — a program to join, a job, or a project for your business — and I'll answer right here.`,
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
    return out({ text: `We have two separate teams, each with its own number — please call the one your question is for.\n${HOURS_LINE}`, dept: "both", links: [{ to: "/contact", label: "Or send the contact form" }] });
  }
  if (has(n, ["other tracks", "all programs", "all program", "show everything", "everything"])) return out(allProgramsReply(ctx), "programs");
  if (has(n, WORDS.human) && !has(n, ["change my phone", "change phone", "update phone", "phone number change"])) {
    return out(handoffReply({ topic: state.topic === "free" && !topic ? "free" : ctxTopic }), ctxTopic);
  }

  // The free internships — only when the message names them, or follows up on them.
  const namesFree = has(n, WORDS.freeInternship);
  const followsFree = state.topic === "free" && words.length <= 6 && !topic;
  if (namesFree || (followsFree && has(n, [...WORDS.price, ...WORDS.apply, "cv", "resume", "eligib", "who can", "result", "when", "refund", "credit"]))) {
    return out(freeInternshipReply(n), "free");
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
  // A question about the client terms ("who owns my website's code?") is answered
  // from the answer bank, not with the pitch for that kind of project.
  const termsQuestion = has(n, WORDS.clientTerms);
  if (topic === "services" && !termsQuestion && (wants || has(n, ["it services", "it service"]) || SERVICE_NEEDS.some((x) => has(n, x.words)))) {
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
  const faq = faqReply(u, topic, ctx);
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
export function answerFor(id, ctx) {
  const f = ALL_FAQS.find((x) => x.id === id);
  return f ? faqAnswer(f, ctx) : null;
}
