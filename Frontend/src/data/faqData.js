// Canned Q&A for the floating help bot (components/FaqBot.jsx). Every answer is
// taken from what the site itself says (content.js, the Terms and the program
// pages) — keep them in step when those change. No prices or timelines are
// quoted: those live on each program's page / depend on the project.
//
// Answer text: plain lines; a line starting with "• " becomes a bullet.
// `links`: [{ to: "/path", label }] for in-site pages, [{ href, label }] for external.
// `k`: extra keywords the free-text search should match on.
import { site, internships, courses } from "./content.js";

const list = (items) => items.map((i) => `• ${i.title}`).join("\n");

export const FAQ_TOPICS = [
  {
    id: "internships", icon: "🎓", label: "Internships",
    faqs: [
      { id: "i-offer", q: "What internships do you offer?", k: "internship tracks mern ai agentic android guided virtual program list",
        a: `Our virtual internships include:\n${list(internships)}\nThe internships page always shows what is open right now.`,
        links: [{ to: "/internships", label: "See internships" }] },
      { id: "i-who", q: "Who can apply?", k: "eligibility eligible age student graduate college qualify requirement",
        a: "Internships are open to:\n• Students currently enrolled in a college or university\n• Recent graduates (within 1 year of graduation)\n• Anyone who is at least 16 years old" },
      { id: "i-paid", q: "Is the internship free or paid?", k: "free paid fee cost price charge apply payment",
        a: "Both exist. Most slots are apply-only and applying never needs payment, but some slots carry a fee. The price (if any) is shown on each program's page.\nIf a program shows no price or says “Currently closed”, use “Request to apply” on its page and we'll get back to you.",
        links: [{ to: "/internships", label: "Browse internships" }] },
      { id: "i-get", q: "What will I get from an internship?", k: "benefit offer letter lor recommendation certificate joining kit linkedin resume",
        a: "Every internship includes:\n• Offer letter on day one\n• Joining kit\n• Completion certificate\n• Letter of Recommendation (LOR)\nCertificates and the LOR are issued after you satisfactorily complete all assigned tasks." },
      { id: "i-how", q: "How does the internship work?", k: "process steps tasks mentor mail how works procedure",
        a: "It's four steps:\n• Choose your domain (Web, Android, AI/ML and more)\n• Register and complete your enrollment\n• Get project tasks by email and build real applications with mentor guidance\n• Submit your work and get certified" },
      { id: "i-duration", q: "How long is an internship?", k: "duration length months days weeks time period",
        a: "It depends on the track. For example, Android Development comes in 15 Days, 3 Month and 6 Month tracks. Each program's page shows its duration, and its start date where one is set." },
      { id: "i-online", q: "Is it online? Can I do it from home?", k: "online virtual remote home location offline",
        a: "Yes — it's fully virtual. Join from anywhere in India or abroad; there is no need to come to an office." },
      { id: "i-kit", q: "When will I get the joining kit?", k: "kit courier delivery shipping post welcome",
        a: "The joining kit is shipped to your postal address. Our team will get in touch to collect it. Delivery time depends on your location and the courier, so please keep your address complete and correct." },
    ],
  },
  {
    id: "courses", icon: "📚", label: "Courses",
    faqs: [
      { id: "c-offer", q: "Which courses do you have?", k: "course list online learn programming react node sql python kotlin price",
        a: `Our online courses include:\n${list(courses)}\nThe courses page always shows what is open and its price.`,
        links: [{ to: "/courses", label: "See courses" }] },
      { id: "c-begin", q: "I'm a beginner — where should I start?", k: "beginner start fresher basics new first",
        a: "The Web Development Track is beginner friendly — HTML, CSS and JavaScript through to the full MERN stack, self-paced with mentor support.",
        links: [{ to: "/courses", label: "Browse courses" }] },
      { id: "c-cert", q: "Do courses give a certificate?", k: "certificate completion credential recognized",
        a: "Yes — a certificate of completion, issued once you meet the attendance, assessment and project requirements. Courses are training, so there's no offer letter or LOR (those are internship-only).\nA certificate does not guarantee a job or any career outcome." },
      { id: "c-access", q: "How do I watch my course after buying?", k: "access watch lectures recorded live class learn dashboard login video",
        a: "Sign in and open My Dashboard, then pick your course. You'll find the live-class schedule and recorded lectures there. Access is tied to your account.",
        links: [{ to: "/dashboard", label: "Open My Dashboard" }] },
      { id: "c-plans", q: "What are Basic, Plus and Pro plans?", k: "plan tier upgrade basic plus pro difference",
        a: "A course or internship may be offered in more than one plan, each with its own price and features (shown on its page). To move up, pay the difference between the higher plan's price and what you've already paid — your access dates stay the same. Offer codes and referral discounts don't apply to upgrades." },
      { id: "c-start", q: "Can I buy before the start date?", k: "start date early advance begin when",
        a: "Yes. Where a program has a set start date, you can buy early and your access begins from that date." },
      { id: "c-job", q: "Do you guarantee a job or placement?", k: "placement job guarantee hire career",
        a: "No. Where placement help or interview preparation is offered it's on a best-effort basis, and no job, interview or employment outcome is guaranteed. What you get is real project experience and a certificate for your resume." },
    ],
  },
  {
    id: "payments", icon: "💳", label: "Payments & receipts",
    faqs: [
      { id: "p-pay", q: "How do I pay?", k: "pay payment razorpay upi card netbanking wallet secure checkout buy purchase",
        a: "Payments go through Razorpay — card, UPI, net-banking or wallet. Your payment details are entered directly in Razorpay's secure screen and are never stored on our servers.\nIf you have credit in your Crix wallet, it is taken off the price first — and if it covers the whole price you can pay with the wallet alone." },
      { id: "p-refund", q: "What is the refund policy?", k: "refund cancel cancellation money back return",
        a: "All course and internship purchases are final — there are no refunds or cancellations once payment is complete. If you have doubts, ask before buying using “Request to apply” / “Request to enroll” on the program's page. This does not affect any statutory right you may have under consumer law.",
        links: [{ to: "/terms-of-service", label: "Read the Terms" }] },
      { id: "p-receipt", q: "How do I get my receipt?", k: "receipt invoice bill pdf download proof",
        a: "A receipt is issued after a confirmed payment — it's emailed to you and you can also download it from your dashboard.",
        links: [{ to: "/dashboard", label: "My Dashboard" }] },
      { id: "p-failed", q: "My payment failed or money was deducted", k: "failed deducted stuck pending error not received access",
        a: "If money left your account but you didn't get access, please contact us with your name, email, the program name and the payment reference from your bank / UPI app, and we'll check it.",
        links: [{ href: `https://wa.me/${site.whatsappAlt}?text=${encodeURIComponent("Hi Crix Technology! My payment went through but I don't have access yet.")}`, label: "WhatsApp internships & courses" }, { to: "/contact", label: "Contact page" }] },
      { id: "p-request", q: "What is a payment request?", k: "payment request pay admin closed price link",
        a: "Sometimes we send a payment request to your registered account for a specific course or internship (even one that's closed or has no listed price). It appears under “Payment requests” in My Dashboard, is personal to your account, and you pay it through Razorpay. Offer codes and wallet credit don't apply to it.",
        links: [{ to: "/dashboard", label: "My Dashboard" }] },
      { id: "p-nobuy", q: "A program has no price or says “Currently closed”", k: "closed no price unavailable request enroll apply not available",
        a: "That program can't be bought online right now. Use “Request to apply” or “Request to enroll” on its page and we'll reply with pricing and upcoming availability." },
    ],
  },
  {
    id: "account", icon: "👤", label: "Account & login",
    faqs: [
      { id: "a-create", q: "How do I create an account?", k: "signup sign up register create account google email",
        a: "Sign up with your email and a password, or choose “Continue with Google”. Use a permanent, valid email — disposable or temporary emails aren't accepted." },
      { id: "a-forgot", q: "I forgot my password", k: "forgot reset password code otp login cannot working",
        a: "On the sign-in box choose “Forgot password” and we'll email you a code. If the code doesn't arrive, message us on WhatsApp and we'll reset it for you.",
        links: [{ href: `https://wa.me/${site.whatsappAlt}?text=${encodeURIComponent("Hi Crix Technology! I can't log in — please help me reset my password.")}`, label: "WhatsApp for password help" }] },
      { id: "a-logout", q: "Why was I logged out?", k: "logout signed out session device inactive timeout",
        a: "For security, an account can be signed in on only one device at a time — signing in elsewhere ends the earlier session. You're also signed out automatically after 30 minutes of inactivity." },
      { id: "a-profile", q: "How do I change my name or phone number?", k: "profile edit update details name phone settings",
        a: "Open your Profile page after signing in. Your name and phone number can be updated there, and your wallet balance and history are on the same page.",
        links: [{ to: "/profile", label: "Open Profile" }] },
      { id: "a-dash", q: "Where do I find my courses and certificates?", k: "dashboard my courses enrolled certificate where find",
        a: "Everything is in My Dashboard — your enrolled courses and internships, payment requests, receipts and referral details.",
        links: [{ to: "/dashboard", label: "My Dashboard" }] },
    ],
  },
  {
    id: "referrals", icon: "🎁", label: "Wallet, referrals & offers",
    faqs: [
      { id: "r-wallet", q: "What is the wallet and how do I use it?", k: "wallet credit balance history pay spend add money top up",
        a: "Your wallet holds credit — from referrals, or credit our team adds to your account. Your balance and a full history are on your Profile page.\nAt checkout the credit is taken off the price automatically. If it covers the whole price, you can pay with the wallet alone — no card or UPI needed.",
        links: [{ to: "/profile", label: "Open my wallet" }] },
      { id: "r-how", q: "How does the referral program work?", k: "referral refer friend code earn credit reward share",
        a: "Every registered student has a personal referral code.\n• Your friend applies it once, at sign-up or at checkout before their first purchase, and gets a discount on that purchase\n• When their first payment is confirmed, you earn referral credit\n• The credit goes into your wallet and is applied automatically at checkout\nReferral codes are for new students, so you can't add one once you already have a course." },
      { id: "r-credit", q: "Can I withdraw wallet credit as cash?", k: "credit cash withdraw transfer money value",
        a: "No. Wallet credit has no cash value and can't be withdrawn, transferred or exchanged." },
      { id: "r-offer", q: "How do offer / discount codes work?", k: "offer code coupon discount promo voucher",
        a: "Offer codes are issued by Crix Technology, usually to individual students. They can be limited to certain programs, dates, a number of uses or a maximum discount. Only one offer code can be used per order, and codes can't be exchanged for cash." },
      { id: "r-self", q: "Can I use my own referral code?", k: "own self code myself",
        a: "No — you can't use your own code, and a student can be referred only once." },
    ],
  },
  {
    id: "it", icon: "💻", label: "IT services",
    faqs: [
      { id: "s-offer", q: "What IT services do you offer?", k: "services it build website app development offer list",
        a: "• Static websites\n• Dynamic websites & web apps\n• Chatbot development\n• Website upgrade & redesign\n• Mobile app development\n• Digital marketing\n• AI / ML solutions\n• Software & IT consulting",
        links: [{ to: "/services", label: "See all services" }] },
      { id: "s-cost", q: "How much does a project cost?", k: "cost price quote estimate budget charges rate pricing website app project",
        a: "It depends on the scope — pages, features, integrations and timeline. Every engagement starts with a clear written scope and cost estimate, with no surprise line items later. Share your requirements with our IT team for a quote." },
      { id: "s-models", q: "How can we work together?", k: "engagement model fixed price dedicated team hourly retainer hire developer contract",
        a: "Three ways:\n• Fixed price — a clear scope, agreed cost and timeline up front, paid in milestones\n• Dedicated team — a developer or small team embedded in your business, billed monthly\n• Hourly / retainer — ad-hoc support and maintenance, billed hourly or monthly" },
      { id: "s-process", q: "What is your process?", k: "process steps workflow discover estimate build deliver support timeline how long time",
        a: "• Discover — understand your goals, users and constraints\n• Estimate — a clear proposal with timeline, deliverables and cost\n• Build — design and develop in short, reviewable iterations\n• Deliver & Support — ship, test, and stay on for fixes and enhancements\nTimelines depend on the project; we confirm one once we know your requirements." },
      { id: "s-start", q: "How do I start a project with you?", k: "start begin get started contact project enquiry inquiry hire",
        a: "Message our IT team on WhatsApp or send the contact form with a short description of what you need. We'll reply and set up a quick discussion.",
        links: [{ to: "/contact", label: "Open contact form" }] },
      { id: "s-redo", q: "Can you redesign my existing website?", k: "redesign upgrade revamp existing site migrate seo performance",
        a: "Yes — from a visual refresh to a full rebuild on a modern stack, with performance and SEO fixes and your redirects preserved." },
      { id: "s-bot", q: "Do you build chatbots?", k: "chatbot bot ai assistant faq lead",
        a: "Yes — rule-based FAQ and lead-capture bots, and AI assistants trained on your own content, for your website and WhatsApp, with hand-off to your team when a human is needed." },
      { id: "s-tech", q: "Which technologies do you use?", k: "technology tech stack react node python flutter database cloud",
        a: "• Web: HTML, CSS, JavaScript, TypeScript, PHP, Python, React, Next.js, Node.js, Express\n• Mobile: Java, Kotlin, Swift, Dart, React Native, Flutter\n• Databases: MongoDB, MySQL, PostgreSQL, MSSQL\n• AI / ML: Python, TensorFlow / PyTorch, LLM APIs, RAG\n• Cloud & tools: AWS / GCP / Azure, Docker, CI/CD, Git",
        links: [{ to: "/about", label: "About us" }] },
      { id: "s-terms", q: "Where are the client terms?", k: "client terms agreement contract nda confidentiality ownership",
        a: "Our client terms cover scope, fees and taxes, timelines, IP, confidentiality, warranties and termination.",
        links: [{ to: "/client-terms", label: "Read client terms" }] },
    ],
  },
  {
    id: "company", icon: "🏢", label: "About & contact",
    faqs: [
      { id: "o-who", q: "Who is Crix Technology?", k: "about company who crix what do you do",
        a: "Crix Technology Private Limited is an Ahmedabad-based technology company with three pillars: structured virtual internships, industry-ready online courses, and IT services for businesses. We're virtual-first, serving clients and learners across India and globally.",
        links: [{ to: "/about", label: "About us" }] },
      { id: "o-phone", q: "What are your contact numbers?", k: "phone number call whatsapp contact mobile reach",
        a: `• IT services: ${site.phone}\n• Internships & courses: ${site.phoneAlt}\nBoth numbers take calls and WhatsApp.`,
        links: [{ href: `https://wa.me/${site.whatsappAlt}`, label: "WhatsApp internships & courses" }, { to: "/contact", label: "Contact page" }] },
      { id: "o-hours", q: "What are your working hours?", k: "hours timing time open available when reach",
        a: `We're available ${site.hours}. You can message us on WhatsApp any time — we'll reply when we're back.` },
      { id: "o-email", q: "What is your email address?", k: "email mail write reply response",
        a: `Email us at ${site.email}. We reply within two working days.`,
        links: [{ href: `mailto:${site.email}`, label: "Send an email" }] },
      { id: "o-where", q: "Where are you located?", k: "location address office city ahmedabad gujarat visit map",
        a: "We're based in Ahmedabad, Gujarat, and work virtually with clients and learners across India and globally.\nRegistered office: G-403, Jalaram Vatika, Nr. Sadguru Bunglows, New Maninagar, Ramol, Daskroi, Ahmedabad – 382449, Gujarat." },
      { id: "o-legal", q: "Is Crix Technology a registered company?", k: "registered legal cin udyam msme genuine trust verify",
        a: "Yes. Crix Technology Private Limited is incorporated under the Companies Act, 2013 (CIN U63122GJ2026PTC179737) and has Udyam registration UDYAM-GJ-01-0667027." },
      { id: "o-privacy", q: "How is my data used?", k: "privacy data personal policy security dpdp",
        a: "Your data is used only to run your account and programs — communication, certificates, payments and (where relevant) joining kits. We don't sell personal data. Payment details are handled by Razorpay, not stored by us.",
        links: [{ to: "/privacy-policy", label: "Privacy Policy" }] },
      { id: "o-social", q: "Where can I follow you?", k: "linkedin instagram social media follow",
        a: "Find us on LinkedIn and Instagram.",
        links: [{ href: site.linkedin, label: "LinkedIn" }, { href: site.instagram, label: "Instagram" }] },
    ],
  },
];

export const ALL_FAQS = FAQ_TOPICS.flatMap((t) => t.faqs.map((f) => ({ ...f, topic: t.id })));

const STOP = new Set(["the", "and", "for", "you", "your", "are", "can", "how", "what", "who", "when", "where", "does", "this", "that", "with", "have", "will", "from", "about", "please", "tell", "want", "need", "get", "give", "any", "was", "its", "our", "not", "no", "do", "is", "it", "to", "of", "my", "me", "in", "on", "a", "i"]);

// Lower-case word tokens, with a trailing plural "s" removed so "fees" finds "fee"
// and "apps" finds "app".
const stem = (w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
const tokens = (text) => (text.toLowerCase().match(/[a-z0-9₹]+/g) || []).map(stem);

const INDEX = ALL_FAQS.map((f) => ({ f, q: new Set(tokens(f.q)), k: new Set(tokens(f.k)) }));

// Free-text search over whole words: a typed word scores 3 when it is one of a
// question's curated keywords, 2 when it appears in the question itself.
export function searchFaqs(text, limit = 3) {
  const words = tokens(text).filter((w) => (w.length > 2 || w === "ai") && !STOP.has(w));
  if (!words.length) return [];
  return INDEX
    .map(({ f, q, k }) => ({ f, score: words.reduce((sum, w) => sum + (k.has(w) ? (q.has(w) ? 4 : 3) : q.has(w) ? 2 : 0), 0) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter((r, _, all) => r.score * 2 >= all[0].score) // drop weak "related" matches
    .slice(0, limit)
    .map((r) => r.f);
}
