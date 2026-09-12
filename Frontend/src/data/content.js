// ============================================================
// SAB CONTENT YAHI EDIT KARO — poori website ka text is ek
// file mein hai. Baad mein backend banoge to yehi data API
// se aayega (see src/services/api.js).
// ============================================================

export const site = {
  name: "Crix Technology",
  tagline: "India's platform for virtual internships, cutting-edge IT services, and industry-ready online courses.",
  city: "Ahmedabad, Gujarat, India",
  eyebrow: "Ahmedabad · Serving pan-India & globally",
  email: "crixtechnology@gmail.com",
  phone: "+91 97232 23588",
  phoneAlt: "+91 97123 65388",
  whatsapp: "919723223588",             // 91 + 10 digit, bina + ke
  whatsappAlt: "919712365388",
  hours: "Mon–Sat, 10am–6pm IST",
  website: "https://crixtechnology.in",
  cin: "U63122GJ2026PTC179737",
  udyam: "UDYAM-GJ-01-0667027",
  legalName: "Crix Technology Private Limited",
  registeredAddress: "G-403, Jalaram Vatika, Nr. Sadguru Bunglows, New Maninagar, Ramol, Daskroi, Ahmedabad – 382449, Gujarat",
  year: 2026,
};

// Statutory / registration details shown in the "Company Information" block on
// the About page. Only rows with a value are rendered.
export const company = {
  legalName: "Crix Technology Private Limited",
  entityType: "Private Limited Company",
  incorporated: "2026 · Registrar of Companies, Ahmedabad, Gujarat",
  authority: "Incorporated under the Companies Act, 2013 (Ministry of Corporate Affairs)",
  cin: "U63122GJ2026PTC179737",
  registeredOffice: "G-403, Jalaram Vatika, Nr. Sadguru Bunglows, New Maninagar, Ramol, Daskroi, Ahmedabad – 382449, Gujarat, India",
  jurisdiction: "Ahmedabad, Gujarat, India",
  udyam: "UDYAM-GJ-01-0667027",
};

export const hero = {
  titleParts: ["We", "train", "the"],
  rotatingWords: ["AI-native engineers", "full-stack developers", "agent builders", "AI-first capstone builders", "Pan-India virtual cohorts"],
  titleEnd: ["of", "tomorrow."],
  subtitle:
    "Crix Technology is India's platform for virtual internships, cutting-edge IT services, and industry-ready online courses — with structured, hands-on programs in MERN stack development and AI Agentic Systems.",
  meta: [
    { big: "Structured", small: "virtual internships" },
    { big: "100%", small: "hands-on labs" },
    { big: "Pan-India", small: "& globally" },
    { big: "AI-first", small: "capstone projects" },
  ],
};

export const marquee = [
  "React", "Next.js", "Node.js", "Express", "TypeScript", "Python",
  "MongoDB", "PostgreSQL", "MySQL", "LangChain", "CrewAI", "RAG Pipelines",
  "OpenAI & LLM APIs", "Gemini API", "React Native", "Flutter",
  "REST APIs", "JWT Auth", "Docker", "AWS · GCP · Azure", "CI/CD",
];

// Grouped tech stack from the company portfolio — rendered on the About page.
export const techStack = [
  { group: "Web", items: ["HTML", "CSS", "JavaScript", "TypeScript", "PHP", "Python", "React", "Next.js", "Node.js", "Express.js"] },
  { group: "Mobile", items: ["Java", "Kotlin", "Swift", "Dart", "React Native", "Flutter"] },
  { group: "Databases", items: ["MongoDB", "MySQL", "PostgreSQL", "MSSQL"] },
  { group: "AI / ML", items: ["Python", "TensorFlow / PyTorch", "OpenAI & LLM APIs", "RAG (Retrieval-Augmented Generation)"] },
  { group: "Digital Marketing", items: ["Google Analytics", "Google Ads", "Meta Ads Manager", "SEMrush"] },
  { group: "Design & Collaboration", items: ["Figma", "Postman", "Jira / Trello"] },
  { group: "Infrastructure & Tools", items: ["Git", "AWS / GCP / Azure", "Docker", "CI/CD"] },
];

// What each *type* of program issues — a fixed business rule (every
// internship gets all three documents, every course gets a certificate
// only), not a per-entry choice, so it lives here once instead of being
// repeated on every internship/course object. Bug fix (2026-09-12): it used
// to be copied onto each static entry's own `deliverables` field, but the
// live `Course` Mongo schema (Backend/src/models/Course.js) has no such
// field — any course/internship fetched from a real, connected backend
// would have silently lost its deliverable chips. Deriving from `type`
// instead (already a required field on the live model) means InfoCard and
// CourseDetail get correct chips regardless of whether the data came from
// this static fallback or the live API. See [[crix-saas-course-platform]].
export const programDeliverables = {
  internship: ["Offer letter on day one", "Completion certificate", "Letter of Recommendation"],
  // Courses are training, not employment — a completion certificate only
  // (no offer letter / LOR, those are internship-only, see above).
  course: ["Certificate of completion"],
};

export const internships = [
  {
    tag: "Flagship",
    title: "MERN Stack with AI Integration",
    desc: "Full-stack development from zero to deployed — with AI features woven in from day one.",
    points: ["React, Node.js, Express, MongoDB", "Authentication with JWT", "Gemini API integration", "Capstone: AI-Powered Job Portal"],
  },
  {
    tag: "Advanced",
    title: "AI Agentic Systems",
    desc: "Design agents that reason, use tools, and work in teams — the skill set every company is hiring for.",
    points: ["LangChain & CrewAI frameworks", "RAG pipelines & vector search", "Multi-agent orchestration", "Free-tier stack: Gemini, Groq, Colab"],
  },
  {
    tag: "Structured Track",
    title: "Guided Virtual Internship",
    desc: "A structured, mentor-led curriculum designed to convert students into contributors.",
    points: ["Live sessions with structured decks", "Hands-on labs, not lectures", "Team capstone with code review", "Completion certificate"],
  },
  {
    tag: "Mobile",
    title: "Android Development",
    desc: "Build and ship native Android apps — from UI fundamentals to a deployed project.",
    points: ["Java · Kotlin · React Native", "UI, navigation & local storage", "REST API integration", "15 Days / 3 Month / 6 Month tracks"],
  },
];

export const services = [
  {
    tag: "For businesses",
    title: "Static Website",
    desc: "Fixed, fast-loading informational sites — brochure, portfolio and landing pages with no database or backend, built for speed and simplicity.",
    points: ["Responsive design", "Contact / enquiry forms", "SEO-friendly structure", "Fast page-load optimization"],
  },
  {
    tag: "For businesses",
    title: "Dynamic Website & Web Apps",
    desc: "Database and CMS-driven sites — content that updates, admin panels, e-commerce and custom web applications built on modern, maintainable stacks.",
    points: ["CMS / admin dashboard", "Blog or news section", "Payment gateway integration where needed", "Custom web applications"],
  },
  {
    tag: "For businesses",
    title: "Website Upgrade & Redesign",
    desc: "Refresh, modernize or re-platform an existing site — from a cosmetic update to a full rebuild on a modern stack.",
    points: ["Responsive redesign", "Performance & SEO fixes", "Content / data migration with redirects preserved"],
  },
  {
    tag: "For businesses",
    title: "Mobile App Development",
    desc: "Android / iOS and cross-platform apps, from concept through to deployment and store release.",
    points: ["Native or cross-platform builds", "Backend / API integration", "Push notifications", "App store submission support"],
  },
  {
    tag: "For businesses",
    title: "Digital Marketing",
    desc: "SEO, social media management and paid ad campaigns to grow a business's online presence.",
    points: ["Social media management", "On-page SEO", "Google / Meta ads management", "Monthly performance reporting"],
  },
  {
    tag: "For businesses",
    title: "AI / ML Solutions",
    desc: "Applied machine learning, automation and data-driven features built into existing products or delivered as standalone tools.",
    points: ["Currently offering: small, rule-based chatbots", "FAQ automation for websites & support workflows", "Data-driven features layered into existing products"],
  },
  {
    tag: "For businesses",
    title: "Software & IT Consulting",
    desc: "Technical audits, architecture guidance and ongoing support for teams that need a reliable extended engineering partner.",
    points: ["Code & architecture reviews", "Performance / security audits", "Short-term staff augmentation"],
  },
];

// Client delivery process from the company portfolio (distinct from the
// student `process` above). Rendered on the Services page.
export const clientProcess = [
  { n: "01", title: "Discover", desc: "Understand your goals, users and constraints; scope the problem." },
  { n: "02", title: "Estimate", desc: "Share a clear proposal with timeline, deliverables and cost." },
  { n: "03", title: "Build", desc: "Design and develop in short, reviewable iterations." },
  { n: "04", title: "Deliver & Support", desc: "Ship, test, and stay on for fixes and enhancements." },
];

// How clients can engage Crix Technology (no pricing — model descriptions only).
export const engagementModels = [
  { title: "Fixed Price", desc: "Best for projects with a clear, well-defined scope. Agreed cost and timeline upfront, paid in milestones." },
  { title: "Dedicated Team", desc: "Best for ongoing product work. A developer or small team embedded with your business, billed monthly." },
  { title: "Hourly / Retainer", desc: "Best for ad-hoc support, maintenance and small ongoing tasks, billed by the hour or a monthly retainer." },
];

// The kinds of work Crix Technology is set up to deliver end to end.
export const expertise = [
  { title: "Business & e-commerce websites", desc: "Marketing sites, dashboards and online stores for small and mid-sized businesses." },
  { title: "Custom web applications", desc: "Internal tools, booking systems, portals and SaaS-style products built from scratch." },
  { title: "AI / ML features & automation", desc: "Chatbots, recommendation logic, data pipelines and predictive tooling layered into existing products." },
  { title: "Mobile companion apps", desc: "Cross-platform apps that extend a web product to Android and iOS." },
];

// Why clients choose Crix Technology (from the company portfolio).
export const whyCrix = [
  { title: "Full-cycle delivery", desc: "From requirement gathering to deployment and post-launch support, one team owns the outcome end to end." },
  { title: "Transparent estimates", desc: "Every engagement starts with a clear, written scope and cost estimate — no surprise line items later." },
  { title: "Right-sized teams", desc: "We scale the team to the complexity of the job, so small projects don't carry large-project overhead." },
  { title: "Talent pipeline", desc: "Our internship and training programs mean a steady bench of trained developers ready to staff new work quickly." },
];

export const courses = [
  {
    tag: "Beginner friendly",
    title: "Web Development Track",
    desc: "HTML, CSS, JavaScript to full MERN stack — self-paced with mentor support.",
    points: ["Frontend fundamentals", "React in depth", "Node.js & MongoDB", "Deploy your own projects"],
  },
  {
    tag: "In demand",
    title: "AI & ML Fundamentals",
    desc: "Practical AI/ML for students — Python, APIs, and building real AI features.",
    points: ["Python for AI", "Working with LLM APIs", "Prompt engineering", "Mini projects portfolio"],
  },
  {
    tag: "Career",
    title: "Building AI Agents & RAG Systems",
    desc: "The advanced track — build agents that use tools, retrieve knowledge, and work in teams.",
    points: ["LangChain & CrewAI", "RAG systems", "Multi-agent projects", "Certificate on completion"],
  },
  {
    tag: "Mobile",
    title: "Kotlin & Java for Android",
    desc: "Beginner to pro — build native Android apps and publish a portfolio project.",
    points: ["Java & Kotlin foundations", "Jetpack & Material UI", "REST APIs & local storage", "Ship a real app"],
  },
  {
    tag: "Backend",
    title: "Node.js Programming",
    desc: "Server-side JavaScript — build REST APIs, auth, and database-backed services.",
    points: ["Express & routing", "JWT authentication", "MongoDB & Mongoose", "Deploy your API"],
  },
  {
    tag: "Frontend",
    title: "React.js Programming",
    desc: "Component-driven UIs — hooks, state, routing, and production patterns.",
    points: ["Hooks & state management", "React Router", "API integration", "Build & deploy projects"],
  },
  {
    tag: "Data",
    title: "SQL & Databases",
    desc: "Design schemas and write queries that scale — the data layer every developer needs.",
    points: ["Relational modelling", "Joins, indexes & views", "Transactions", "Practical query projects"],
  },
];

export const process = [
  { n: "01", title: "Choose Your Domain", desc: "Pick from Web Dev, Android, AI/ML, Data Science, Cybersecurity, or Cloud Computing." },
  { n: "02", title: "Register & Pay", desc: "Fill in your details and complete the payment. Selection is open to all eligible students." },
  { n: "03", title: "Complete Tasks", desc: "Receive project tasks via email. Build real applications with mentor guidance." },
  { n: "04", title: "Get Certified", desc: "Submit your work and receive your certificate — internships also include an offer letter and Letter of Recommendation." },
];

export const benefits = [
  { icon: "gift", title: "Paid Internship Program", desc: "Affordable fee with real industry experience and mentorship." },
  { icon: "award", title: "Verified Certificate", desc: "Industry-recognized digital certificate on completion." },
  { icon: "home", title: "Work from Home", desc: "Fully virtual — join from anywhere, pan-India or globally." },
  { icon: "document", title: "Offer Letter + LOR", desc: "Official offer letter and Letter of Recommendation — issued to internship program graduates." },
  { icon: "linkedin", title: "LinkedIn Recognition", desc: "Official LinkedIn recommendation added to your profile." },
  { icon: "briefcase", title: "Resume Boost", desc: "Real project experience to impress top recruiters." },
  { icon: "mentor", title: "Mentor Support", desc: "Dedicated mentor guidance throughout the program." },
  { icon: "tasks", title: "Real Tasks", desc: "Industry-level project tasks — not just theory." },
  { icon: "star", title: "Path to Internship", desc: "Outstanding performers in any course may be invited into our paid internship program." },
];

export const stats = [
  { value: 3, suffix: "", label: "Learning tracks" },
  { value: 12, suffix: "+", label: "Technologies taught" },
  { value: 100, suffix: "%", label: "Hands-on labs" },
  { value: 1, suffix: "", label: "Deployed capstone" },
];

export const about = {
  heading: "Built in Ahmedabad. Serving pan-India and globally.",
  body: "Crix Technology Private Limited is a technology and training company with three pillars: structured virtual internships, IT services for growing businesses, and industry-ready online courses. Our curricula and products are built by working developers — so students learn, and clients get, what industry actually uses in production.",
  overview:
    "Crix Technology Private Limited is an Ahmedabad-based technology company offering IT services, custom software development, and industry-ready training programs, including paid virtual internships and online courses. We're virtual-first — delivered remotely from our Ahmedabad base to clients pan-India and globally — working with businesses that need dependable engineering support and with learners who want hands-on, real-world project experience, particularly in web development and AI/ML.",
  history:
    "Registered as a private limited company in Gujarat (CIN U63122GJ2026PTC179737), Crix Technology was built around two connected ideas: giving businesses a dependable extended engineering team for software and web work, and giving learners a paid, mentor-led route into real project experience in web development and AI/ML — a model in which the training arm also feeds a talent pipeline for client delivery work.",
  facts: [
    { title: "Pan-India & globally", desc: "Virtual-first delivery, from Ahmedabad to clients globally" },
    { title: "Production-first", desc: "Every module ends in something deployed" },
    { title: "Free-tier stack", desc: "Gemini, Groq & Colab — no paid tools required" },
    { title: "Small cohorts", desc: "Direct mentor feedback, real code review" },
  ],
};

export const testimonials = [
  {
    quote: "Crix Technology gave me real project experience that no classroom could. The certificate helped me land my first job!",
    name: "Rahul Sharma", college: "GTU, Ahmedabad", track: "Web Development", initials: "RS", color: "blue",
  },
  {
    quote: "The task-based learning was incredible. I built 3 production-level projects in just one month!",
    name: "Priya Mehta", college: "PDPU, Gandhinagar", track: "AI/ML Intern", initials: "PM", color: "purple",
  },
  {
    quote: "Supportive mentors, clear tasks, and a certificate recognized by top recruiters. Highly recommended!",
    name: "Arjun Patel", college: "SVIT, Vasad", track: "Android Dev", initials: "AP", color: "teal",
  },
  {
    quote: "I went from zero Python knowledge to building ML models. The curriculum is perfectly structured.",
    name: "Sneha Joshi", college: "CHARUSAT", track: "Data Science", initials: "SJ", color: "amber",
  },
];

// ============================================================
// LEGAL — Privacy Policy & Terms of Service. Rendered verbatim
// on /privacy-policy and /terms-of-service.
// ============================================================
export const legal = {
  updated: "Effective date: September 2026 · Last updated: September 2026",
  privacy: {
    intro:
      "At Crix Technology, we are committed to protecting your privacy. This policy explains how we collect, use, and safeguard your personal information when you use our website, internship programs, and courses.",
    sections: [
      {
        title: "1. Information We Collect",
        content: `When you create an account, apply for an internship, enroll in or purchase a course, or contact us, we collect:
• Full name, email address, phone number
• College/university name and year of study (where applicable)
• Internship or course preference
• Account credentials — either a password, stored as a secure one-way hash and never in plain text, or, if you choose "Continue with Google", the name, email address, and account identifier provided to us by Google
• Any messages or project submissions you send us

Payment for a course is collected and processed securely on this website through our payment partner, Razorpay — see "Payment Processing" below. Payment arrangements for the paid internship program, where applicable, are communicated separately during the application process.`,
      },
      {
        title: "2. How We Use Your Information",
        content: `We use the information you provide to:
• Create and maintain your account, and verify your identity when you log in
• Process your internship application or course purchase
• Grant and manage access to purchased course content, live-class schedules, and recordings
• Send you tasks, updates, and certificates via email
• Respond to your queries and support requests
• Improve our programs and website experience
• Send relevant announcements about new batches or courses (you may opt out anytime)`,
      },
      {
        title: "3. Information Sharing",
        content: `We do not sell, trade, or rent your personal information to third parties. We may share information only in these limited circumstances:
• With service providers who assist in operating our website — for example, Razorpay for payment processing, and Google for "Sign in with Google" authentication
• If required by law or to protect the rights and safety of Crix Technology or its users
• With your explicit consent`,
      },
      {
        title: "4. Payment Processing",
        content: `All payments for courses are processed through Razorpay, a licensed payment aggregator regulated by the Reserve Bank of India. When you make a payment, your card, UPI, net-banking, or wallet details are entered directly into Razorpay's secure payment interface and are never transmitted to or stored on Crix Technology's own servers — we receive only a payment status, an order/transaction reference, and the amount paid. Please refer to Razorpay's own privacy policy for details on how it handles your payment data.`,
      },
      {
        title: "5. Data Storage & Security",
        content: `Your data is stored securely and we take reasonable technical and organizational measures to protect it from unauthorized access, loss, or misuse — including hashing passwords and never storing payment card details ourselves. However, no method of transmission over the internet is 100% secure.`,
      },
      {
        title: "6. Data Retention",
        content: `We retain your account and course-related information for as long as your account remains active, and for a reasonable period afterward to respond to queries, resolve disputes, and comply with our legal obligations. Financial and transaction records related to course payments are retained for the period required under applicable Indian tax and accounting law. You may request deletion of your account at any time, subject to these retention requirements.`,
      },
      {
        title: "7. Cookies & Similar Technologies",
        content: `Our website uses browser local storage to keep you signed in between visits, by storing an authentication token after you log in. We may also use cookies or similar technologies to analyze site traffic and improve the browsing experience. Clearing your browser's site data will sign you out, and disabling storage or cookies may affect some features of the website.`,
      },
      {
        title: "8. Third-Party Links & Services",
        content: `Our website may contain links to third-party websites, and integrates third-party services such as Razorpay (payments), Google (sign-in), and WhatsApp (contact and course inquiries). We are not responsible for the privacy practices or content of these third parties. We encourage you to review their respective privacy policies before using them.`,
      },
      {
        title: "9. Your Rights",
        content: `You have the right to:
• Access the personal information we hold about you
• Request correction of inaccurate data
• Request deletion of your data or your account (subject to legal and record-keeping obligations)
• Withdraw consent for communications at any time

To exercise any of these rights, contact us at crixtechnology@gmail.com.`,
      },
      {
        title: "10. Children's Privacy",
        content: `Our services are intended for students who are 16 years of age or older. We do not knowingly collect personal information from children under 16. If you believe we have inadvertently collected such information, please contact us immediately.`,
      },
      {
        title: "11. International Users",
        content: `Crix Technology is based in India, and your information is collected, stored, and processed in India. If you access our services from outside India, you consent to the transfer and processing of your information in India, which may have data protection laws different from those of your home country.`,
      },
      {
        title: "12. Grievance Officer",
        content: `In accordance with the Information Technology Act, 2000 and the rules made thereunder, Crix Technology has designated a Grievance Officer to address complaints or concerns regarding this Privacy Policy or the processing of your personal data.

Grievance Officer
Email: crixtechnology@gmail.com
Address: G-403, Jalaram Vatika, Nr. Sadguru Bunglows, New Maninagar, Ramol, Daskroi, Ahmedabad – 382449, Gujarat, India

We aim to acknowledge grievances within 24 hours and resolve them within 30 days of receipt, as required under applicable law.`,
      },
      {
        title: "13. Changes to This Policy",
        content: `We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated effective date. We encourage you to review this policy periodically.`,
      },
      {
        title: "14. Contact Us",
        content: `If you have any questions or concerns about this Privacy Policy, please reach out to us:

Email: crixtechnology@gmail.com
Phone: +91 97232 23588
Location: Ahmedabad, Gujarat, India`,
      },
    ],
  },
  terms: {
    intro:
      "Please read these Terms of Service carefully before using Crix Technology's website or enrolling in any of our programs. These terms constitute a legally binding agreement between you and Crix Technology.",
    sections: [
      {
        title: "1. Acceptance of Terms",
        content: `By accessing or using Crix Technology's website, internship programs, or courses, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, please do not use our services.`,
      },
      {
        title: "2. Eligibility",
        content: `Our internship programs are open to:
• Students currently enrolled in a college or university
• Recent graduates (within 1 year of graduation)
• Individuals who are at least 16 years of age

By applying, you confirm that you meet the eligibility criteria.`,
      },
      {
        title: "3. User Accounts & Registration",
        content: `To purchase a course or access enrolled course content, you must create an account using a valid email address and password, or by signing in with your Google account. You agree to:
• Provide accurate, current, and complete information when registering
• Keep your password confidential and not share your account with anyone else
• Notify us immediately of any unauthorized use of your account
• Register with a permanent, valid email address — disposable or temporary email services are not accepted

You are responsible for all activity that occurs under your account. Crix Technology reserves the right to suspend or terminate accounts registered with false information or used in violation of these Terms. Admin accounts are provisioned only by Crix Technology and are not available through public registration.`,
      },
      {
        title: "4. Internship Program",
        content: `Crix Technology offers a paid virtual internship program. By enrolling you agree to:
• Complete assigned tasks honestly and on time
• Submit original work — plagiarism will result in immediate disqualification
• Maintain professional conduct in all communications
• Not share confidential task materials with third parties

Certificates and Letters of Recommendation are issued only upon satisfactory completion of all assigned tasks.`,
      },
      {
        title: "5. Courses",
        content: `Course content provided by Crix Technology is for personal, non-commercial educational use only. You may not:
• Reproduce, redistribute, or resell any course material
• Share login credentials or access links with others
• Record or screen-capture video lectures without written permission`,
      },
      {
        title: "6. Course Purchases, Payment & Cancellations",
        content: `Course prices, along with any active discount, are as displayed on the course page at the time of purchase and are payable in full through our payment partner, Razorpay, at checkout — see our Privacy Policy for how payment data is handled. A course is available for online purchase only once Crix Technology has opened it for enrollment; courses shown without a listed price, or marked "Currently closed", are not available for purchase — you may use the "Inquire" option on that course's page to contact us directly about pricing or upcoming availability.

Access to a purchased course's live-class schedule and recorded lectures is granted upon confirmed payment and remains tied to your account. Crix Technology may reschedule live sessions, substitute mentors, or make reasonable changes to course content and delivery format, provided the overall quality and scope of the course is not materially reduced.

All course purchases are final. Crix Technology does not offer refunds or cancellations for courses once payment has been completed, regardless of whether course materials, recordings, or live sessions have been accessed. Please review the course details and use the "Request to enroll" option on a course's page to ask any questions before purchasing. This clause does not affect any statutory right you may have under applicable consumer protection law.`,
      },
      {
        title: "7. User Conduct",
        content: `When using our website or services, you agree not to:
• Provide false or misleading information during registration
• Engage in any activity that disrupts or interferes with our services
• Attempt to gain unauthorized access to our systems
• Use our platform for any unlawful or harmful purpose`,
      },
      {
        title: "8. Intellectual Property",
        content: `All content on this website — including text, graphics, logos, icons, and course material — is the property of Crix Technology and is protected by applicable intellectual property laws. You may not use, copy, or distribute any content without our prior written consent.`,
      },
      {
        title: "9. Certificates & Credentials",
        content: `Certificates of completion are issued to students who meet the attendance, assessment, and project/assignment requirements specified for the respective course, and who have no outstanding fee dues or unresolved disciplinary action. Certification reflects successful completion of the course and does not constitute a guarantee of employment, salary, or any specific career outcome. Crix Technology reserves the right to withhold or revoke a certificate in cases of academic dishonesty, non-payment of fees, or breach of these Terms. Misrepresenting the nature of a Crix Technology certificate (e.g., claiming it is a government-issued credential) is strictly prohibited.`,
      },
      {
        title: "10. Code of Conduct",
        content: `Students are expected to maintain discipline, punctuality, and respectful behaviour towards trainers, staff, and fellow students at all times, whether in-person or online. Crix Technology maintains a zero-tolerance policy towards harassment, discrimination, cheating, plagiarism, or disruptive behaviour. Violations may result in warnings, suspension, or termination of enrollment without refund. Students must not record, reproduce, distribute, or resell course materials or live sessions without prior written permission.`,
      },
      {
        title: "11. Placement Assistance Disclaimer",
        content: `Where Crix Technology offers placement assistance, interview preparation, or job-referral support as part of a course, this is provided on a best-effort basis only. Crix Technology does not guarantee job placement, interviews, or employment outcomes for any student, as these depend on factors including market conditions, employer requirements, and individual performance.`,
      },
      {
        title: "12. Student Work",
        content: `Any code, projects, or assignments created solely by a student as part of coursework ("Student Work") remain the intellectual property of that student. By submitting Student Work for evaluation, or agreeing to feature it as a showcase/portfolio project, the student grants Crix Technology a non-exclusive, royalty-free, worldwide licence to use, reproduce, and display such Student Work for promotional, marketing, and educational purposes, unless the student opts out in writing.`,
      },
      {
        title: "13. Data Privacy",
        content: `Personal data collected through your account and during enrollment is processed in accordance with the Digital Personal Data Protection Act, 2023 ("DPDP Act") and used solely for administration of your account and courses, communication, certification, payment processing, and (where applicable) placement assistance. Students may, by written request, access, correct, or request erasure of their personal data, or withdraw consent, subject to Crix Technology's legal and administrative record-keeping requirements. Crix Technology will not sell student personal data to third parties without consent. See our Privacy Policy for full details, including our designated Grievance Officer's contact information.`,
      },
      {
        title: "14. Limitation of Liability",
        content: `Crix Technology provides its services "as is" without warranties of any kind. We are not liable for:
• Any indirect, incidental, or consequential damages arising from use of our services
• Loss of data, income, or missed employment opportunities resulting from technical issues
• Actions taken by third-party platforms we integrate with (e.g., email, authentication, or payment providers)

Our total liability in any matter shall not exceed the amount you paid for our services.`,
      },
      {
        title: "15. Force Majeure",
        content: `Crix Technology shall not be liable for any delay, cancellation, or change in course delivery caused by circumstances beyond its reasonable control, including natural disasters, government restrictions, internet outages, or public health emergencies. In such cases, Crix Technology will make reasonable efforts to reschedule or provide alternate arrangements.`,
      },
      {
        title: "16. Termination",
        content: `We reserve the right to terminate or suspend access to our services, including your account, at our discretion for conduct that we believe violates these Terms or is harmful to other users, us, or third parties. Upon termination, your right to use our services immediately ceases.`,
      },
      {
        title: "17. Changes to Terms",
        content: `We may revise these Terms of Service at any time. Changes will be posted on this page with an updated effective date. Continued use of our services after changes constitutes acceptance of the revised terms.`,
      },
      {
        title: "18. Governing Law & Dispute Resolution",
        content: `These Terms shall be governed by and construed in accordance with the laws of India. The parties shall first attempt to resolve any dispute amicably through good-faith discussion. If unresolved, the dispute shall be referred to arbitration under the Arbitration and Conciliation Act, 1996 (as amended), before a sole arbitrator, with the seat and venue of arbitration at Ahmedabad, Gujarat, India, and proceedings conducted in English. Subject to this clause, the courts at Ahmedabad, Gujarat, India shall have exclusive jurisdiction.`,
      },
      {
        title: "19. Third-Party Services",
        content: `Our website integrates third-party services, including Razorpay for payment processing and Google for sign-in, and links to WhatsApp for inquiries and support. Your use of these services is also subject to their own terms and privacy policies, over which Crix Technology has no control. Crix Technology is not responsible for the availability, content, security, or practices of these third-party services.`,
      },
      {
        title: "20. General Provisions",
        content: `If any provision of these Terms is found invalid or unenforceable by a court or arbitrator of competent jurisdiction, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall continue in full force and effect. No failure or delay by Crix Technology in exercising any right under these Terms shall operate as a waiver of that right. You may not assign or transfer your rights or obligations under these Terms without our prior written consent; Crix Technology may assign these Terms in connection with a merger, acquisition, or sale of assets. These Terms, together with any policies referenced herein, constitute the entire agreement between you and Crix Technology regarding your use of our services.`,
      },
      {
        title: "21. Contact Us",
        content: `For any questions regarding these Terms of Service, please contact us:

Email: crixtechnology@gmail.com
Phone: +91 97232 23588
Location: Ahmedabad, Gujarat, India`,
      },
    ],
  },
  clientTerms: {
    intro:
      "These Terms and Conditions govern the provision of software development, web/app development, IT consulting, and related digital services (the \"Services\") by Crix Technology to the client named in the applicable proposal, quotation, or Statement of Work. By engaging Crix Technology for any Services, signing a proposal, making a payment, or instructing us to commence work, the client agrees to be bound by these Terms.",
    sections: [
      {
        title: "1. Scope of Services",
        content: `The specific scope, deliverables, timelines, and fees for each engagement are set out in a separate proposal, quotation, or Statement of Work ("SOW"), which forms part of this Agreement. In the event of any conflict between these Terms and a SOW, the SOW prevails for that engagement only. Any work requested outside the agreed scope is treated as a change request and may be subject to additional fees and revised timelines, agreed in writing before commencement. Crix Technology will use reasonable skill, care, and industry-standard practices in performing the Services.`,
      },
      {
        title: "2. Client Responsibilities",
        content: `The client shall provide timely access to information, content, credentials, approvals, and feedback reasonably required for Crix Technology to perform the Services. Delays caused by the client's failure to provide necessary inputs may result in corresponding delays to project timelines. The client warrants that any content, data, or materials supplied do not infringe the rights of any third party, and that all consents necessary to lawfully process any personal data supplied have been obtained.`,
      },
      {
        title: "3. Fees & Taxes",
        content: `Fees for the Services are as set out in the applicable proposal/SOW and are exclusive of any taxes that may apply, unless stated otherwise. Advance payment and milestone/payment schedules are specified in the SOW. All fees paid to Crix Technology are final and non-refundable, including in the event of project cancellation, delay, or a change in the client's requirements, except where required by applicable law.`,
      },
      {
        title: "4. Project Timelines & Delivery",
        content: `Estimated timelines communicated in the SOW are indicative, not guaranteed, and may be affected by scope changes, client delays, or factors beyond Crix Technology's reasonable control. Deliverables are shared with the client for review; absence of a written response within the review period specified in the SOW is deemed acceptance of the deliverable.`,
      },
      {
        title: "5. Intellectual Property Rights",
        content: `Upon full and final payment of all fees due, ownership of the final deliverables specifically created for the client under the applicable SOW transfers to the client, except for any pre-existing tools, frameworks, libraries, templates, or proprietary components owned by Crix Technology or third parties ("Background IP"), which remain the property of their respective owners and are licensed to the client on a perpetual, non-exclusive, worldwide basis for use solely in connection with the deliverables. Until full and final payment is received, all rights in the deliverables remain vested in Crix Technology. Crix Technology may showcase completed work (excluding confidential material) in its portfolio unless the client requests otherwise in writing.`,
      },
      {
        title: "6. Confidentiality & Data Protection",
        content: `Each party agrees to keep confidential any non-public information disclosed by the other party and to use it solely for the purposes of the engagement. Where Crix Technology processes personal data on the client's behalf, it does so in accordance with the Digital Personal Data Protection Act, 2023 ("DPDP Act") — processing personal data only for the purposes specified by the client, implementing reasonable technical and organizational safeguards, and notifying the client without undue delay of any personal data breach affecting data processed under this Agreement. Our designated Grievance Officer's contact details for privacy and data-related queries are published in our Privacy Policy.`,
      },
      {
        title: "7. Warranties & Disclaimers",
        content: `Crix Technology warrants that the Services will be performed in a professional and workmanlike manner consistent with generally accepted industry standards. Except as expressly stated, all Services and deliverables are provided "as is" without warranties of any kind, whether express or implied, to the extent permitted by applicable law. Crix Technology does not guarantee uninterrupted or error-free operation of any software, third-party platform, or hosting service.`,
      },
      {
        title: "8. Limitation of Liability",
        content: `To the maximum extent permitted by law, Crix Technology's total aggregate liability arising out of or in connection with the Agreement shall not exceed the total fees paid by the client for the Services giving rise to the claim in the months preceding the claim, as specified in the SOW. In no event shall Crix Technology be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, revenue, data, or business opportunity. Nothing limits either party's liability for fraud, wilful misconduct, or any liability that cannot be limited under applicable law.`,
      },
      {
        title: "9. Indemnification",
        content: `The client agrees to indemnify and hold harmless Crix Technology, its employees, and representatives from any claims, damages, or liabilities arising from the client's breach of these Terms, misuse of deliverables, or infringement of third-party rights through content or data supplied by the client.`,
      },
      {
        title: "10. Non-Solicitation",
        content: `During the engagement and for a defined period thereafter (as stated in the SOW), the client shall not, without Crix Technology's prior written consent, directly or indirectly solicit, hire, or engage any personnel of Crix Technology who were involved in delivering the Services, other than through a general public job advertisement not specifically targeted at such personnel.`,
      },
      {
        title: "11. Term & Termination",
        content: `The Agreement commences on the date the client accepts the applicable SOW/proposal and continues until the Services are completed, unless terminated earlier. Either party may terminate for convenience on written notice as specified in the SOW; the client shall pay for all Services rendered and expenses incurred up to the effective date of termination. Either party may terminate immediately upon an uncured material breach by the other party.`,
      },
      {
        title: "12. Force Majeure",
        content: `Neither party shall be liable for any failure or delay in performance due to causes beyond its reasonable control, including natural disasters, government action, internet or network outages, or other events of force majeure.`,
      },
      {
        title: "13. Governing Law & Dispute Resolution",
        content: `Unless otherwise specified in the applicable SOW, this Agreement is governed by and construed in accordance with the laws of India. The parties shall first attempt to resolve any dispute amicably through good-faith negotiation. If unresolved, the dispute shall be referred to and finally resolved by arbitration under the Arbitration and Conciliation Act, 1996 (as amended), before a sole arbitrator appointed by mutual agreement. The seat and venue of arbitration is Ahmedabad, Gujarat, India, and the language is English. Subject to this clause, the courts at Ahmedabad, Gujarat, India have exclusive jurisdiction. For clients located outside India, a different governing law, seat, or jurisdiction may be agreed in writing in the applicable SOW.`,
      },
      {
        title: "14. Amendments & Entire Agreement",
        content: `Crix Technology may update these Terms from time to time; material changes will be communicated to active clients, and continued use of Services after such changes constitutes acceptance. These Terms, together with the applicable SOW or proposal, constitute the entire agreement between the parties and supersede all prior discussions relating to the subject matter.`,
      },
      {
        title: "15. General Provisions",
        content: `Crix Technology may engage subcontractors or its own personnel to perform the Services at its discretion, provided overall responsibility for delivery remains with Crix Technology. The client may not assign or transfer this Agreement without Crix Technology's prior written consent. If any provision of these Terms is found invalid or unenforceable, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall continue in full force and effect. No failure or delay by either party in exercising any right under this Agreement shall operate as a waiver of that right.`,
      },
      {
        title: "16. Contact",
        content: `All notices, questions, or communications under this Agreement should be directed to:

Crix Technology Private Limited
Registered address: G-403, Jalaram Vatika, Nr. Sadguru Bunglows, New Maninagar, Ramol, Daskroi, Ahmedabad – 382449, Gujarat
Email: crixtechnology@gmail.com
Phone: +91 97232 23588
CIN: U63122GJ2026PTC179737`,
      },
    ],
  },
};
