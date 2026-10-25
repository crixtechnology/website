// The answer bank of the floating help agent (data/helpAgent.js). Every answer is
// taken from what the site itself says (content.js, the Terms and the program
// pages) — keep them in step when those change. No prices or timelines are
// quoted: those live on each program's page / depend on the project.
//
// Answer text: plain lines; a line starting with "• " becomes a bullet. Say the
// answer in full here — don't send people to another page to read it.
// `links`: [{ to: "/path", label }] for in-site pages, [{ href, label }] for external —
// only where the next step happens there (a form, checkout, applying, a legal document).
// `dept`: "programs" | "it" | "both" — the help agent shows that team's number card.
// `k`: extra keywords the free-text search should match on.
import { site, internships, courses, services, clientProcess, engagementModels, programDeliverables } from "./content.js";
import { careersContact } from "./careers.js";

const list = (items) => items.map((i) => `• ${i.title}${i.desc ? ` — ${i.desc}` : ""}`).join("\n");
const steps = (items) => items.map((i) => `• ${i.title} — ${i.desc}`).join("\n");

export const FAQ_TOPICS = [
  {
    id: "internships", icon: "🎓", label: "Internships",
    faqs: [
      { id: "i-offer", q: "What internships do you offer?", k: "internship tracks mern ai agentic android guided virtual program list",
        a: `Our virtual internships include:\n${list(internships)}\nEvery internship includes: ${programDeliverables.internship.join(", ").toLowerCase()}. All fully online, from anywhere in India.`,
        links: [{ to: "/programs", label: "Browse & enrol" }] },
      { id: "i-who", q: "Who can apply?", k: "eligibility eligible age student graduate college qualify requirement",
        a: "Internships are open to:\n• Students currently enrolled in a college or university\n• Recent graduates (within 1 year of graduation)\n• Anyone who is at least 16 years old" },
      { id: "i-paid", q: "Is the internship free or paid?", k: "free paid fee cost price charge apply payment",
        a: "Internships on the Programs page are paid — the price is shown on each program's page. Free opportunities are listed as roles on the Careers page, where each role shows whether it has a registration fee or is free to apply.\nIf a program shows no price or says “Currently closed”, use “Request to apply” on its page and we'll get back to you.",
        links: [{ to: "/programs", label: "Browse programs" }, { to: "/careers", label: "Careers page" }] },
      { id: "i-get", q: "What will I get from an internship?", k: "benefit offer letter lor recommendation certificate joining kit linkedin resume",
        a: "Every internship includes:\n• Offer letter on day one\n• Joining kit\n• Completion certificate\n• Letter of Recommendation (LOR)\nCertificates and the LOR are issued after you satisfactorily complete all assigned tasks." },
      { id: "i-how", q: "How does the internship work?", k: "process steps tasks mentor mail how works procedure",
        a: "It's four steps:\n• Choose your domain (Web, Android, AI/ML and more)\n• Register and complete your enrollment\n• Get project tasks by email and build real applications with mentor guidance\n• Submit your work and get certified" },
      { id: "i-duration", q: "How long is an internship?", k: "duration length months days weeks time period",
        a: "Internships run for 15 days, 1 month, 3 months or 6 months, depending on the program. Each program's page shows its duration, and its start date where one is set." },
      { id: "i-online", q: "Is it online? Can I do it from home?", k: "online virtual remote home location offline",
        a: "Yes — it's fully virtual. Join from anywhere in India; there is no need to come to an office. Internships and courses are open to residents of India." },
      { id: "i-kit", q: "When will I get the joining kit?", k: "kit courier delivery shipping post welcome",
        a: "The joining kit is shipped to your postal address. Our team will get in touch to collect it. Delivery time depends on your location and the courier, so please keep your address complete and correct." },
    ],
  },
  {
    id: "courses", icon: "📚", label: "Courses",
    faqs: [
      { id: "c-offer", q: "Which courses do you have?", k: "course list online learn programming react node sql python kotlin price",
        a: `Our online courses include:\n${list(courses)}\nEach is self-paced with mentor support and ends with a ${programDeliverables.course[0].toLowerCase()}.`,
        links: [{ to: "/programs", label: "Browse & enrol" }] },
      { id: "c-begin", q: "I'm a beginner — where should I start?", k: "beginner start fresher basics new first",
        a: "The Web Development Track is beginner friendly — HTML, CSS and JavaScript through to the full MERN stack, self-paced with mentor support. It covers:\n• Frontend fundamentals\n• React in depth\n• Node.js & MongoDB\n• Deploying your own projects\nFor Android, start with Kotlin & Java for Android; for data, SQL & Databases.",
        links: [{ to: "/programs", label: "Browse & enrol" }] },
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
    id: "careers", icon: "💼", label: "Careers & aptitude test",
    faqs: [
      { id: "k-open", q: "Are you hiring? Which roles are open?", k: "hiring jobs job openings vacancy vacancies roles career careers opening position",
        a: "We post every role we're hiring for on the Careers page first, each with its skills, stipend, duration and test details — and freshers aged 18+ from anywhere in India are welcome. You apply, take an online aptitude test, and hear within 7 days whether you're shortlisted for an online interview.",
        links: [{ to: "/careers", label: "Apply on the Careers page" }] },
      { id: "k-apply", q: "How do I apply for a role?", k: "apply application job role register hiring process steps",
        a: "• Log in with your email and a password (a new email gets an account)\n• Pick a role on the Careers page, or in My Dashboard → Apply / Aptitude Test\n• Accept the terms — and, if the role has a registration fee, pay it (the whole fee comes back to your wallet as credit)\n• Take the online aptitude test\n• If you're shortlisted, we schedule an online interview, then share the result",
        links: [{ to: "/careers", label: "Careers page" }, { to: "/dashboard", label: "My Dashboard" }] },
      { id: "k-fee", q: "Do I have to pay to take the aptitude test?", k: "test fee registration fee cost charge money back refund credit aptitude",
        a: "It depends on the role. Each role on the Careers page shows either its registration fee or “Free to apply”. Where there is a fee, the whole fee comes back to your wallet as credit — 1 credit = ₹1 — which you can use on any Crix course or internship before it expires. It can't be withdrawn as cash, and paying for the test doesn't guarantee selection.",
        links: [{ to: "/careers", label: "Careers page" }] },
      { id: "k-test", q: "What is the aptitude test like?", k: "aptitude test exam questions pattern syllabus marks negative marking time duration sections",
        a: "It's an online, timed test you take once, with sections on quantitative aptitude, logical reasoning, verbal ability and a technical section for your role. Wrong answers can cost marks (negative marking), so it's fine to leave a question you don't know. Each role sets its own number of questions and time limit — ask me about the test for a role by name and I'll tell you. The full rules can be downloaded as a PDF from the Careers page.",
        links: [{ to: "/careers", label: "Test details & rules" }] },
      { id: "k-rules", q: "What are the test rules? What do I need?", k: "rules webcam camera fullscreen full screen tab switch laptop browser cheating violation warning",
        a: "• Use a laptop or desktop with Chrome, Edge or Firefox, a working webcam and a steady connection\n• The test runs in full screen with your webcam on — a photo is taken from time to time\n• Leaving full screen or switching tabs/apps counts as a warning; at the limit the test is submitted automatically\n• Your answers are saved as you pick them, and if your connection drops you can resume — the timer keeps running",
        links: [{ to: "/careers", label: "Download the rules" }] },
      { id: "k-who", q: "Who can take the aptitude test?", k: "eligible eligibility age 18 fresher graduate student who can apply experience",
        a: "Candidates aged 18 or older. Freshers are welcome — students in any year, recent graduates, and anyone with up to a year of experience, from anywhere in India. Each role lists its own eligibility on the Careers page.",
        links: [{ to: "/careers", label: "See roles" }] },
      { id: "k-result", q: "When will I hear back after the test?", k: "result shortlist shortlisted interview selected status when hear back offer letter",
        a: "You'll get your shortlisting result within 7 days of submitting the test — by email and under My Applications in My Dashboard. If you're shortlisted, your online interview's date, time and meeting link appear there too, followed by the final result.",
        links: [{ to: "/dashboard", label: "My Applications" }] },
      { id: "k-again", q: "Can I apply again if I'm not selected?", k: "again retry reapply second attempt not selected rejected not shortlisted",
        a: "Yes. Once an application has ended without an offer (not shortlisted, or not selected after the interview), you can apply for the role again. For a role with a registration fee, each application is a new test with its own fee, which again comes back as wallet credit. For a free role, there's a short wait before you can apply to the same role again — the Careers page tells you the date if you try too soon." },
      { id: "k-photos", q: "What happens to my webcam photos?", k: "webcam photos camera images privacy proctoring stored delete data",
        a: "They're used only to check that the test was taken fairly, and are stored privately. They're deleted automatically 6 months after your application is closed, and never kept longer than 12 months after the test — or straight away if you delete your account.",
        links: [{ to: "/privacy-policy", label: "Privacy Policy" }] },
      { id: "k-help", q: "I had a problem during my test", k: "problem issue test submitted error stuck camera not working disconnected help support",
        a: `Write to us at ${careersContact.email} with your name and the role, and tell us what happened — we'll look into it.`,
        links: [{ href: `mailto:${careersContact.email}`, label: "Email us" }] },
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
      { id: "p-gst", q: "Do you charge GST?", k: "gst tax gstin cgst sgst igst tax invoice",
        a: "No. Crix Technology is not registered under GST, so no GST is charged on our courses, internships or the aptitude test fee, and your receipt shows no GST." },
      { id: "p-delete", q: "How do I delete my account?", k: "delete account remove erase data close deactivate privacy dpdp",
        a: "Go to your Profile page and choose “Delete my account”. We email a code to your account's email address to confirm it's you; once you enter it, your account and personal data are deleted straight away and you'll get a confirmation email.\nUnused wallet credit and course access are lost and not refunded. Payment records and receipts are kept, with no link to an account, as Indian tax law requires.",
        links: [{ to: "/profile", label: "My Profile" }, { to: "/privacy-policy", label: "Privacy Policy" }] },
      { id: "p-failed", q: "My payment failed or money was deducted", k: "failed deducted stuck pending error not received access",
        a: "• Wait 10 minutes and refresh My Dashboard — most payments confirm on their own\n• If money was taken but nothing unlocked, Razorpay confirms or returns it automatically, usually within 5–7 working days\n• Still stuck? Call our Internships & Courses team with your name, email, the program name and the payment reference from your bank / UPI app, and we'll check it",
        links: [{ to: "/dashboard", label: "My Dashboard" }], dept: "programs" },
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
        a: "Open Log in and enter your email and a password. If the email is new, we ask you to confirm and your account is created with that password — or choose “Continue with Google”. Then add your full name and phone number in Profile; you need them before buying anything. Use a permanent, valid email — disposable or temporary emails aren't accepted.\nYou need to be at least 16; if you're 16 or 17, a parent or guardian must agree to you using Crix Technology — you confirm this with a tick box when your account is created." },
      { id: "a-forgot", q: "I forgot my password", k: "forgot reset password code otp login cannot working",
        a: "On the Log in box choose “Forgot password” and we'll email you a code. If the code doesn't arrive, call our Internships & Courses team and we'll reset it for you.",
        dept: "programs" },
      { id: "a-logout", q: "Why was I logged out?", k: "logout signed out session device inactive timeout",
        a: "For security, an account can be signed in on only one device at a time — signing in elsewhere ends the earlier session. You're also signed out automatically after 30 minutes of inactivity." },
      { id: "a-profile", q: "How do I change my name, phone or education details?", k: "profile edit update details name phone settings college course branch department semester education year passing",
        a: "Open your Profile page after signing in. Your name, phone number and education (college, course, branch / department, semester and year of passing) can be updated there, and your wallet balance and history are on the same page.",
        links: [{ to: "/profile", label: "Open Profile" }] },
      { id: "a-dash", q: "Where do I find my courses and certificates?", k: "dashboard my courses enrolled certificate where find",
        a: "Everything is in My Dashboard:\n• My Courses — your courses and internships, payment requests, receipts and referral details\n• Apply / Aptitude Test — apply for a role and take its test\n• My Applications — where each job application stands\n• My Wallet — your credit, its history and expiry dates",
        links: [{ to: "/dashboard", label: "My Dashboard" }] },
    ],
  },
  {
    id: "referrals", icon: "🎁", label: "Wallet, referrals & offers",
    faqs: [
      { id: "r-wallet", q: "What is the wallet and how do I use it?", k: "wallet credit balance history pay spend add money top up",
        a: "Your wallet holds credit (1 credit = ₹1). It comes from:\n• Your signup bonus, once your email is verified\n• Aptitude test fees, which come back as credit\n• Referral rewards, and credit our team adds\nAt checkout the credit is taken off the price automatically, and if it covers the whole price you can pay with the wallet alone. Your balance, history and each credit's expiry date are in My Dashboard → My Wallet.\nBonus and test-fee credit is valid for a limited time, and there may be a limit on how much of one purchase credit can pay for — the wallet shows both.",
        links: [{ to: "/dashboard", label: "Open my wallet" }] },
      { id: "r-bonus", q: "How do I get my signup bonus?", k: "signup bonus welcome credit free credits new account verify email code",
        a: "New accounts get bonus credits. If you signed up with Google, they're added straight away. If you signed up with an email and password, open My Dashboard → My Wallet and choose “Email me a code” — enter the code we send you and the credits are added. Like test-fee credit, the bonus is valid for a limited time.",
        links: [{ to: "/dashboard", label: "Open my wallet" }] },
      { id: "r-how", q: "How does the referral program work?", k: "referral refer friend code earn credit reward share",
        a: "Every registered student has a personal referral code.\n• Your friend applies it once, when their account is created or at checkout before their first purchase, and gets a discount on that purchase\n• When their first payment is confirmed, you earn referral credit\n• The credit goes into your wallet and is applied automatically at checkout\nReferral codes are for new students, so you can't add one once you already have a course." },
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
        a: `We work with businesses in India and around the world:\n${services.map((s) => `• ${s.title} — ${s.points.slice(0, 5).join(", ")}`).join("\n")}` },
      { id: "s-cost", q: "How much does a project cost?", k: "cost price quote estimate budget charges rate pricing website app project",
        a: `It depends on the scope — pages, features, integrations and timeline — so there's no fixed price list. Every engagement starts with a clear written scope and cost estimate, with no surprise line items later. You can work with us in three ways:\n${steps(engagementModels)}\nShare your requirements with our IT Services team for a quote.`,
        links: [{ to: "/services", label: "Request a quote" }], dept: "it" },
      { id: "s-models", q: "How can we work together?", k: "engagement model fixed price dedicated team hourly retainer hire developer contract",
        a: `Three ways:\n${steps(engagementModels)}` },
      { id: "s-process", q: "What is your process?", k: "process steps workflow discover estimate build deliver support timeline how long time",
        a: `${steps(clientProcess)}\nTimelines depend on the project; we confirm one in the estimate, once we know your requirements.` },
      { id: "s-start", q: "How do I start a project with you?", k: "start begin get started contact project enquiry inquiry hire",
        a: `Send a short description of what you need through the inquiry form, or call our IT Services team (${site.hours}). Then:\n${steps(clientProcess)}`,
        links: [{ to: "/services", label: "Send an inquiry" }], dept: "it" },
      { id: "s-redo", q: "Can you redesign my existing website?", k: "redesign upgrade revamp existing site migrate seo performance",
        a: "Yes — from a visual refresh to a full rebuild on a modern stack, with performance and SEO fixes and your redirects preserved." },
      { id: "s-bot", q: "Do you build chatbots?", k: "chatbot bot ai assistant faq lead",
        a: "Yes — rule-based FAQ and lead-capture bots, and AI assistants trained on your own content, for your website and WhatsApp, with hand-off to your team when a human is needed." },
      { id: "s-tech", q: "Which technologies do you use?", k: "technology tech stack react node python flutter database cloud",
        a: "• Web: HTML, CSS, JavaScript, TypeScript, PHP, Python, React, Next.js, Node.js, Express\n• Mobile: Java, Kotlin, Swift, Dart, React Native, Flutter\n• Databases: MongoDB, MySQL, PostgreSQL, MSSQL\n• AI / ML: Python, TensorFlow / PyTorch, LLM APIs, RAG\n• Cloud & tools: AWS / GCP / Azure, Docker, CI/CD, Git" },
      { id: "s-terms", q: "Where are the client terms?", k: "client terms agreement contract nda confidentiality ownership",
        a: "Every project starts from a written scope and estimate that you approve. Our Client Services Terms then cover:\n• Scope and changes to it\n• Fees, taxes and payment milestones\n• Timelines and what each side provides\n• Ownership of the work (IP) and confidentiality\n• Warranties, support and termination\nThe full terms are a legal document — read them in full before you sign off a project.",
        links: [{ to: "/client-terms", label: "Read client terms" }] },
    ],
  },
  {
    id: "company", icon: "🏢", label: "About & contact",
    faqs: [
      { id: "o-who", q: "Who is Crix Technology?", k: "about company who crix what do you do",
        a: "Crix Technology Private Limited is an Ahmedabad-based technology company with three pillars: structured virtual internships, industry-ready online courses, and IT services for businesses. We're virtual-first, serving clients across India and around the world, and learners across India.\nOur curricula and products are built by working developers, so students learn — and clients get — what industry actually uses in production. Registered as ${site.legalName} (CIN ${site.cin})." },
      { id: "o-phone", q: "What are your contact numbers?", k: "phone number call whatsapp contact mobile reach",
        a: `We have two separate teams, each with its own number — please call the one your question is for. We're available ${site.hours}, or email ${site.email}.`,
        links: [{ to: "/contact", label: "Or send the contact form" }], dept: "both" },
      { id: "o-hours", q: "What are your working hours?", k: "hours timing time open available when reach",
        a: `We're available ${site.hours}. Outside those hours, email ${site.email} or send the contact form and we'll reply when we're back — within two working days.`,
        links: [{ to: "/contact", label: "Contact form" }], dept: "both" },
      { id: "o-email", q: "What is your email address?", k: "email mail write reply response",
        a: `Email us at ${site.email}. We reply within two working days.`,
        links: [{ href: `mailto:${site.email}`, label: "Send an email" }] },
      { id: "o-where", q: "Where are you located?", k: "location address office city ahmedabad gujarat visit map",
        a: "We're based in Ahmedabad, Gujarat, and work virtually with clients across India and around the world, and with learners across India.\nRegistered office: G-403, Jalaram Vatika, Nr. Sadguru Bunglows, New Maninagar, Ramol, Daskroi, Ahmedabad – 382449, Gujarat." },
      { id: "o-legal", q: "Is Crix Technology a registered company?", k: "registered legal cin udyam msme genuine trust verify",
        a: "Yes. Crix Technology Private Limited is incorporated under the Companies Act, 2013 (CIN U63122GJ2026PTC179737) and has Udyam registration UDYAM-GJ-01-0667027." },
      { id: "o-privacy", q: "How is my data used?", k: "privacy data personal policy security dpdp",
        a: "Your data is used only to run your account and programs — communication, certificates, payments and (where relevant) joining kits. We don't sell personal data. Payment details are handled by Razorpay, not stored by us.",
        links: [{ to: "/privacy-policy", label: "Privacy Policy" }] },
      { id: "o-cookies", q: "Do you use cookies?", k: "cookies cookie analytics tracking consent google banner settings",
        a: "Only what the site needs to work — keeping you logged in, your theme and your cookie choice. Google Analytics cookies, which count visits, are used only if you choose “Accept analytics” in the cookie banner, and never for ads. You can change your choice any time from “Cookie settings” at the bottom of every page.",
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
// `minShare`: drop matches scoring under this share of the best one.
export function searchFaqs(text, limit = 3, minShare = 0.5) {
  const words = tokens(text).filter((w) => (w.length > 2 || w === "ai") && !STOP.has(w));
  if (!words.length) return [];
  return INDEX
    .map(({ f, q, k }) => ({ f, score: words.reduce((sum, w) => sum + (k.has(w) ? (q.has(w) ? 4 : 3) : q.has(w) ? 2 : 0), 0) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter((r, _, all) => r.score >= all[0].score * minShare) // drop weak "related" matches
    .slice(0, limit)
    .map((r) => r.f);
}
