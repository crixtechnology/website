// Per-length content for every Training + Internship program (applied once by
// utils/programContentOnce.js).
//
// Before this, each domain's 1, 2, 3 and 6 month programs (and the 6-month
// paid-internship version) had word-for-word the same description, points,
// skills and responsibilities, and empty outcomes / audience / prerequisites /
// FAQs. Google saw five copies of one page and indexed one, and the 1-month
// page promised the same capstone as the 6-month one. Here each length says
// what that length really covers.
//
// Wording rules (see Frontend/src/utils/programFacts.test.js): every enrolled
// student gets an offer letter, training certificate and Letter of
// Recommendation; a stipend, joining kit and LinkedIn recognition are only on
// the programs that include them (the "-6-months-2" paid-internship versions),
// and the stipend is performance based. No job guarantees.

const END_FAQ = (extra) => ({
  q: "What do I get at the end?",
  a: `An offer letter, a training certificate and a Letter of Recommendation${extra ? `, plus ${extra}` : ""}.`,
});

// The paid-internship 6-month version: 3 months of training, then 3 months on
// live projects with a performance-based stipend, a joining kit and LinkedIn
// recognition. Its training months follow the 3-month track of the same domain.
function paidInternship({ track, trainingSummary, skills, internshipWork, project }) {
  return {
    title: `${track} with Paid Internship`,
    desc: `Three months of ${trainingSummary}, then a three-month internship on live projects with our team, with a performance-based monthly stipend. Includes a joining kit and LinkedIn recognition.`,
    points: [`3 months ${track} training`, "3 months internship on live projects", "Performance-based monthly stipend", "Joining kit & LinkedIn recognition"],
    skills,
    responsibilities: [
      `Months 1–3: complete the ${track} training with live classes and mentor support`,
      `Build ${project} during the training months`,
      ...internshipWork,
      "Pick up tasks, raise your work for review and act on feedback",
      "Join regular team check-ins and report your progress",
    ],
    outcomes: [
      `The full skill set of the 3-month ${track} track`,
      "Real team experience: tasks, reviews and deadlines",
      "Live project work you can describe in interviews",
      "A monthly stipend during the internship months, based on your performance",
    ],
    audience: [
      "Students who want real work experience, not only training",
      `Learners ready to commit six months to ${track}`,
      "Final-year students and recent graduates building their CV",
    ],
    prerequisites: [
      "No experience needed for the training months",
      "A laptop or desktop with a stable internet connection",
      "About 2–3 hours a day; more time during the internship months helps",
    ],
    faqs: [
      {
        q: "How does the stipend work?",
        a: "The first three months are training. During the next three months of internship you receive a monthly stipend in the range shown on this page; the amount within that range depends on your performance.",
      },
      {
        q: `How is this different from the regular 6-month ${track} track?`,
        a: "The regular track is six months of training. This one is three months of training, then three months of internship on live projects, with a stipend, a joining kit and LinkedIn recognition.",
      },
      END_FAQ("internship experience on live projects"),
    ],
  };
}

const PROGRAM_CONTENT = {
  // ------------------------------------------------------------ MERN Stack
  "mern-stack-1-month": {
    desc: "A one-month start in web development: HTML, CSS and JavaScript from zero, Git, and your first responsive website, built with a mentor checking your work. A good first step before the longer MERN tracks.",
    points: ["HTML5 & modern CSS (Flexbox, Grid)", "JavaScript basics & the DOM", "Git & GitHub", "Project: responsive portfolio website"],
    skills: ["HTML", "CSS", "JavaScript", "Responsive design", "Git basics"],
    responsibilities: [
      "Build pages with semantic HTML and modern CSS",
      "Make layouts work on phones, tablets and laptops",
      "Add interactivity with JavaScript and the DOM",
      "Save and share your code with Git and GitHub",
      "Build and publish your own portfolio website",
    ],
    outcomes: [
      "Build a responsive, multi-page website from scratch",
      "Write JavaScript that reacts to clicks and form input",
      "Publish a website online and share its link",
      "Use Git to track and share your work",
    ],
    audience: [
      "Complete beginners who want to try web development",
      "Students deciding whether to take a longer MERN track",
      "Anyone who wants a portfolio website of their own",
    ],
    prerequisites: ["No coding experience needed", "A laptop or desktop with a stable internet connection", "About 2–3 hours a day for the month"],
    faqs: [
      { q: "Can I learn web development in one month?", a: "You'll learn the foundations — HTML, CSS, JavaScript and Git — and finish with a live portfolio website. React, Node.js and databases come in the 2, 3 and 6 month tracks." },
      { q: "Do I need to know coding before joining?", a: "No. The month starts from the very basics." },
      END_FAQ("a portfolio website you can show to employers"),
    ],
  },
  "mern-stack-2-months": {
    desc: "Two months from web basics to React: HTML, CSS and modern JavaScript, then React components, state and routing, finishing with a React app that shows live data from a public API.",
    points: ["HTML, CSS & modern JavaScript (ES6+)", "React components, state & hooks", "Fetching data from REST APIs", "Project: React app with live API data"],
    skills: ["HTML", "CSS", "JavaScript (ES6+)", "React", "REST APIs", "Git basics"],
    responsibilities: [
      "Build responsive layouts with HTML and CSS",
      "Write modern JavaScript: modules, async/await and fetch",
      "Build a React app from components, props and state",
      "Add page navigation with React Router",
      "Show live data from a public API, with loading and error states",
      "Deploy your React project and present it to your mentor",
    ],
    outcomes: [
      "Build a working React app with several pages",
      "Call an API and display its data",
      "Handle loading, empty and error states properly",
      "Deploy a front end to the web",
    ],
    audience: [
      "Beginners who want to reach React quickly",
      "Students who know a little HTML and want to go further",
      "Anyone who wants front-end skills before learning the back end",
    ],
    prerequisites: ["No experience needed; basic computer skills help", "A laptop or desktop with a stable internet connection", "About 2–3 hours a day for two months"],
    faqs: [
      { q: "Does the 2-month track cover the back end?", a: "Not in depth. It focuses on the front end with React. Node.js, Express and MongoDB are covered in the 3 and 6 month MERN tracks." },
      { q: "What will I build?", a: "A React app with several pages that shows live data from a public API, deployed online." },
      END_FAQ("a deployed React project"),
    ],
  },
  "mern-stack-3-months": {
    desc: "The full MERN stack in three months: React on the front end, Node.js and Express APIs, MongoDB and JWT login, ending in a full-stack app you build and deploy yourself.",
    points: ["React, Node.js, Express, MongoDB", "REST APIs & JWT authentication", "Deploying a full-stack app", "Project: full-stack app with login"],
    skills: ["JavaScript", "React", "Node.js", "Express", "MongoDB", "JWT authentication"],
    responsibilities: [
      "Build React front ends that talk to your own API",
      "Design REST APIs with Node.js and Express",
      "Store and query data in MongoDB with Mongoose",
      "Add sign-up and login with JWT",
      "Use Git and act on code-review feedback",
      "Build and deploy a full-stack app as your project",
    ],
    outcomes: [
      "Build a complete MERN app: front end, API and database",
      "Secure an app with login and protected pages",
      "Deploy the front end and back end and connect them",
      "Find and fix errors across the whole stack",
    ],
    audience: [
      "Students who want to become full-stack web developers",
      "Learners who know some HTML and JavaScript and want the full picture",
      "Final-year students preparing for developer interviews",
    ],
    prerequisites: ["No experience required; basic HTML and JavaScript make the pace easier", "A laptop or desktop with a stable internet connection", "About 2–3 hours a day for three months"],
    faqs: [
      { q: "Is MERN taught from scratch?", a: "Yes. The first weeks cover JavaScript and React before moving to Node.js, Express and MongoDB." },
      { q: "What is the difference between the 3 and 6 month MERN tracks?", a: "The 3-month track covers the full MERN stack and one full-stack project. The 6-month track adds AI features with the Gemini API, testing, performance and a larger capstone." },
      END_FAQ("a deployed full-stack project"),
    ],
  },
  "mern-stack-6-months": {
    desc: "The complete six-month MERN programme: everything in the 3-month track, then AI features with the Gemini API, testing, performance and deployment, ending in an AI-Powered Job Portal capstone.",
    points: ["Full MERN stack from the basics", "Gemini API integration", "Testing, performance & deployment", "Capstone: AI-Powered Job Portal"],
    skills: ["React", "Node.js", "Express", "MongoDB", "Gemini API", "Testing and deployment"],
    responsibilities: [
      "Go from web basics to advanced React patterns",
      "Build secure REST APIs with roles and input validation",
      "Model data in MongoDB and keep queries fast",
      "Add AI features to an app with the Gemini API",
      "Write tests and set up deployment for a real app",
      "Build and present the AI-Powered Job Portal capstone",
    ],
    outcomes: [
      "Build and deploy a production-style MERN application",
      "Add AI features such as smart search or summaries with the Gemini API",
      "Write tests and fix performance problems",
      "Present a capstone project that stands out in interviews",
    ],
    audience: [
      "Students aiming for a full-stack developer job",
      "Beginners who want one long, structured programme from zero",
      "Graduates who want a strong portfolio project",
    ],
    prerequisites: ["No experience needed: the programme starts from the basics", "A laptop or desktop with a stable internet connection", "About 2–3 hours a day for six months"],
    faqs: [
      { q: "Why choose 6 months over 3?", a: "Six months leaves time for AI integration, testing, performance work and a much larger capstone, which makes your portfolio stronger." },
      { q: "What is the AI-Powered Job Portal capstone?", a: "A full MERN app with job listings, applications and logins, plus AI features built with the Gemini API." },
      END_FAQ("the AI-Powered Job Portal for your portfolio"),
    ],
  },
  "mern-stack-6-months-2": paidInternship({
    track: "MERN Stack Developer",
    trainingSummary: "MERN training (React, Node.js, Express and MongoDB)",
    skills: ["React", "Node.js", "Express", "MongoDB", "Git and code review", "Working in a dev team"],
    project: "a full-stack app with login",
    internshipWork: ["Months 4–6: build features for live web projects with our development team"],
  }),

  // ------------------------------------------------------------ AI/ML Developer
  "ai-ml-developer-1-month": {
    desc: "A one-month introduction to AI and machine learning: Python for data, NumPy and Pandas, charts, and your first prediction model with scikit-learn, built step by step with a mentor.",
    points: ["Python for data work", "NumPy, Pandas & charts", "Your first scikit-learn model", "Project: house-price predictor"],
    skills: ["Python", "NumPy", "Pandas", "Matplotlib", "scikit-learn basics"],
    responsibilities: [
      "Learn the Python you need for data and AI",
      "Load, clean and explore datasets with Pandas",
      "Draw charts that show patterns in data",
      "Train a first prediction model with scikit-learn",
      "Build a simple house-price predictor and explain its results",
    ],
    outcomes: [
      "Write Python for everyday data tasks",
      "Clean and explore a real dataset",
      "Train and test a basic machine learning model",
      "Explain what a model predicts and how accurate it is",
    ],
    audience: [
      "Beginners curious about AI and machine learning",
      "Students who want to test their interest before a longer track",
      "Anyone who wants hands-on Python for data",
    ],
    prerequisites: ["No coding experience needed", "School-level maths is enough", "A laptop with internet (Google Colab works in the browser)"],
    faqs: [
      { q: "Do I need strong maths for this?", a: "No. School-level maths is enough for the first month; ideas are taught with examples, not formulas." },
      { q: "Will I build AI apps like chatbots in one month?", a: "Not yet. One month covers Python, data and a first model. AI APIs come in the 3-month track, and agents and RAG in the 6-month track." },
      END_FAQ("a working prediction model in your portfolio"),
    ],
  },
  "ai-ml-developer-2-months": {
    desc: "Two months of practical machine learning: Python and Pandas, then regression, classification, model evaluation and feature engineering, ending in a classification project with a written evaluation report.",
    points: ["Python, NumPy & Pandas", "Regression & classification", "Model evaluation & tuning", "Project: spam / sentiment classifier"],
    skills: ["Python", "Pandas", "scikit-learn", "Feature engineering", "Model evaluation", "Basic statistics"],
    responsibilities: [
      "Prepare real datasets: missing values, encoding and scaling",
      "Train regression and classification models",
      "Compare models with accuracy, precision, recall and cross-validation",
      "Tune models and avoid overfitting",
      "Build a spam or sentiment classifier and write an evaluation report",
    ],
    outcomes: [
      "Choose the right kind of model for a problem",
      "Measure model quality with the right metrics",
      "Improve a model with feature engineering and tuning",
      "Write up an ML experiment so others can repeat it",
    ],
    audience: [
      "Students who want solid machine learning basics",
      "Learners who know some Python and want to apply it to data",
      "Anyone preparing for data or ML internship interviews",
    ],
    prerequisites: ["No experience needed; some Python helps", "School-level maths", "A laptop with internet (Google Colab works in the browser)"],
    faqs: [
      { q: "What is the difference between the 1 and 2 month AI/ML tracks?", a: "One month covers Python, data handling and a first model. Two months go deeper into classification, evaluation and tuning, with a complete project and report." },
      { q: "Does this cover deep learning or ChatGPT-style AI?", a: "Not in depth. Neural networks and AI APIs start in the 3-month track; LLM agents and RAG are in the 6-month track." },
      END_FAQ("a classification project with a written report"),
    ],
  },
  "ai-ml-developer-3-months": {
    desc: "Three months from data to AI apps: machine learning with scikit-learn, neural network basics, and building AI features with the Gemini and Groq APIs, ending in an AI-powered app as your project.",
    points: ["Machine learning with scikit-learn", "Neural network basics", "AI APIs: Gemini & Groq", "Project: AI-powered document chatbot"],
    skills: ["Python", "Pandas", "scikit-learn", "Neural networks", "Prompt engineering", "AI APIs"],
    responsibilities: [
      "Clean, explore and prepare real datasets",
      "Train, tune and compare models with scikit-learn",
      "Understand and train a simple neural network",
      "Write effective prompts and call AI APIs from Python",
      "Write down your experiments so others can repeat them",
      "Build an AI-powered app that answers questions about documents",
    ],
    outcomes: [
      "Build classic ML models and judge their quality",
      "Explain how neural networks learn",
      "Add AI features to a Python app with AI APIs",
      "Deliver a working AI app as your project",
    ],
    audience: [
      "Students who want to build real AI applications",
      "Developers adding AI skills to their profile",
      "Final-year students preparing for AI/ML roles",
    ],
    prerequisites: ["No experience required; basic Python makes the pace easier", "School-level maths", "A laptop with internet (free tools: Colab, Gemini, Groq)"],
    faqs: [
      { q: "Do I need to pay for AI tools?", a: "No. The track uses free tiers: Google Colab, the Gemini API and Groq." },
      { q: "What is the difference between the 3 and 6 month AI/ML tracks?", a: "Three months cover ML, neural network basics and AI APIs. Six months add LangChain, CrewAI, RAG pipelines, vector search and multi-agent systems." },
      END_FAQ("an AI-powered app in your portfolio"),
    ],
  },
  "ai-ml-developer-6-months": {
    desc: "The complete six-month AI/ML programme: everything in the 3-month track, then LLM apps with LangChain and CrewAI, RAG pipelines, vector search and multi-agent systems, ending in a multi-agent AI assistant capstone.",
    points: ["LangChain & CrewAI frameworks", "RAG pipelines & vector search", "Multi-agent orchestration", "Free-tier stack: Gemini, Groq, Colab"],
    skills: ["Python", "scikit-learn", "LangChain", "CrewAI", "RAG and vector databases", "AI APIs"],
    responsibilities: [
      "Master data preparation and classic machine learning",
      "Build LLM apps with LangChain",
      "Create RAG pipelines with embeddings and vector search",
      "Design multi-agent workflows with CrewAI",
      "Evaluate AI outputs and reduce wrong answers",
      "Plan, build and present a multi-agent AI assistant capstone",
    ],
    outcomes: [
      "Build LLM apps that answer from your own documents",
      "Design AI agents that plan and use tools together",
      "Choose between classic ML and LLMs for a problem",
      "Present an advanced AI capstone in interviews",
    ],
    audience: [
      "Students aiming for AI/ML or AI engineer roles",
      "Beginners who want one long, structured programme into AI",
      "Developers who want to build agentic AI systems",
    ],
    prerequisites: ["No experience needed: the programme starts from Python basics", "School-level maths", "A laptop with internet (free tools: Colab, Gemini, Groq)"],
    faqs: [
      { q: "Why choose 6 months over 3?", a: "The extra three months cover agentic AI — LangChain, CrewAI, RAG and multi-agent systems — the skills most in demand for AI engineering roles." },
      { q: "What is RAG?", a: "Retrieval-Augmented Generation: an AI app looks up the right parts of your own documents before answering, so its answers are grounded in your data." },
      END_FAQ("a multi-agent AI assistant capstone"),
    ],
  },
  "ai-ml-developer-6-months-2": paidInternship({
    track: "AI/ML Developer",
    trainingSummary: "AI/ML training (machine learning, neural network basics and AI APIs)",
    skills: ["Python", "scikit-learn", "AI APIs", "Prompt engineering", "Git and code review", "Working in a dev team"],
    project: "an AI-powered document chatbot",
    internshipWork: ["Months 4–6: build and test AI features for live projects with our team"],
  }),

  // ------------------------------------------------------------ Data Science / Analytics
  "data-science-analytics-1-month": {
    desc: "A one-month start in data analytics: Excel or Google Sheets, pivot tables, charts and SQL basics, ending in a sales dashboard you build in a spreadsheet. Open to commerce, science and arts students.",
    points: ["Excel / Google Sheets formulas", "Pivot tables & charts", "SQL basics", "Project: sales dashboard in Sheets"],
    skills: ["Excel or Google Sheets", "Pivot tables", "Charts", "SQL basics"],
    responsibilities: [
      "Clean and organise data in a spreadsheet",
      "Use formulas such as VLOOKUP/XLOOKUP, IF and SUMIFS",
      "Summarise data with pivot tables and charts",
      "Write simple SQL queries to select and filter data",
      "Build a sales dashboard and explain what it shows",
    ],
    outcomes: [
      "Turn messy spreadsheet data into a clean table",
      "Answer business questions with pivot tables",
      "Write basic SQL queries",
      "Build a simple dashboard others can read",
    ],
    audience: [
      "Commerce, science and arts students new to data",
      "Anyone who wants practical spreadsheet skills for any job",
      "Students deciding whether to take a longer analytics track",
    ],
    prerequisites: ["No coding or maths background needed", "A laptop or desktop with internet", "A Google account (Sheets is free)"],
    faqs: [
      { q: "I'm from commerce or arts. Can I join?", a: "Yes. The first month needs no coding or advanced maths — only spreadsheets and simple SQL." },
      { q: "Does the 1-month track include Python?", a: "No. Python and Pandas start in the 2-month track; statistics and dashboard tools come in the 3 and 6 month tracks." },
      END_FAQ("a dashboard you can show to employers"),
    ],
  },
  "data-science-analytics-2-months": {
    desc: "Two months of hands-on analytics: spreadsheets and SQL, then Python with Pandas and charts, ending in an analysis of a real public dataset that you present to your mentor.",
    points: ["Excel / Sheets & SQL", "Python & Pandas", "Charts with Matplotlib", "Project: public dataset analysis"],
    skills: ["Excel or Google Sheets", "SQL", "Python", "Pandas", "Data visualisation"],
    responsibilities: [
      "Clean data in spreadsheets and with SQL",
      "Write SQL queries with joins and GROUP BY",
      "Load and clean data in Python with Pandas",
      "Make clear charts with Matplotlib",
      "Analyse a real public dataset and present what you found",
    ],
    outcomes: [
      "Use SQL and Pandas to answer questions from data",
      "Clean real-world data with missing and wrong values",
      "Choose the right chart for a message",
      "Present an analysis clearly in plain language",
    ],
    audience: [
      "Students who want to move from spreadsheets to Python",
      "Commerce, science and arts students heading into analytics",
      "Anyone preparing for data analyst internships",
    ],
    prerequisites: ["No experience needed", "Basic school maths", "A laptop or desktop with internet"],
    faqs: [
      { q: "Do I need to know Python already?", a: "No. Python is taught from the basics, focused only on what analysts use." },
      { q: "What is the difference between the 2 and 3 month tracks?", a: "Two months cover SQL, Python and charts. Three months add statistics and a dashboard tool, with a complete end-to-end analysis project." },
      END_FAQ("a presented analysis project"),
    ],
  },
  "data-science-analytics-3-months": {
    desc: "The complete data analyst track in three months: spreadsheets, SQL, Python and Pandas, statistics and dashboards in Power BI or Looker Studio, ending in an end-to-end analysis project you present.",
    points: ["SQL, Python & Pandas", "Statistics for analysts", "Power BI / Looker Studio dashboards", "Project: end-to-end business analysis"],
    skills: ["Excel or Google Sheets", "SQL", "Python and Pandas", "Basic statistics", "Charts and dashboards", "Clear communication"],
    responsibilities: [
      "Clean and organise data from spreadsheets, databases and files",
      "Write SQL queries to pull and summarise data",
      "Explore data and find trends with Python and Pandas",
      "Use statistics to check whether a trend is real",
      "Build interactive dashboards in Power BI or Looker Studio",
      "Plan and present a capstone analysis project",
    ],
    outcomes: [
      "Run an analysis from raw data to recommendation",
      "Use averages, spread and correlation correctly",
      "Build a dashboard managers can use on their own",
      "Explain findings to non-technical people",
    ],
    audience: [
      "Students aiming for data analyst or business analyst roles",
      "Commerce, science and arts students who like working with numbers",
      "Final-year students who want a complete analytics project",
    ],
    prerequisites: ["No experience needed", "Basic school maths", "A laptop or desktop with internet"],
    faqs: [
      { q: "Which dashboard tool will I learn?", a: "Power BI or Looker Studio. Both are widely used and free to start with." },
      { q: "What is the difference between the 3 and 6 month tracks?", a: "Three months make you a complete data analyst. Six months add forecasting, A/B testing and machine learning basics for analysts, with a larger business case capstone." },
      END_FAQ("an end-to-end analysis project"),
    ],
  },
  "data-science-analytics-6-months": {
    desc: "The complete six-month data science programme: everything in the 3-month analyst track, then A/B testing, forecasting and machine learning for analysts, ending in a business case capstone presented like a real client report.",
    points: ["SQL, Python, statistics & dashboards", "A/B testing & forecasting", "Machine learning for analysts", "Capstone: business case report"],
    skills: ["SQL", "Python and Pandas", "Statistics", "Power BI or Looker Studio", "Forecasting", "scikit-learn basics"],
    responsibilities: [
      "Master SQL, Pandas and dashboarding",
      "Design and read A/B tests",
      "Forecast sales or demand from past data",
      "Build simple prediction models with scikit-learn",
      "Turn analysis into clear recommendations",
      "Plan, build and present a business case capstone",
    ],
    outcomes: [
      "Answer business questions with tests, not guesses",
      "Forecast future numbers from historical data",
      "Use basic machine learning where it helps",
      "Present a capstone like a real consulting report",
    ],
    audience: [
      "Students aiming for data analyst or junior data scientist roles",
      "Beginners who want one long, structured programme into data",
      "Commerce, science and arts students who want a strong portfolio",
    ],
    prerequisites: ["No experience needed: the programme starts from spreadsheets", "Basic school maths", "A laptop or desktop with internet"],
    faqs: [
      { q: "Why choose 6 months over 3?", a: "Six months add A/B testing, forecasting and machine learning for analysts, plus a bigger capstone — skills that move you toward data science roles." },
      { q: "Is this data science or data analytics?", a: "Both. The first half builds a complete analyst skill set; the second half adds the statistics and machine learning used in data science." },
      END_FAQ("a business case capstone"),
    ],
  },
  "data-science-analytics-6-months-2": paidInternship({
    track: "Data Science / Analytics",
    trainingSummary: "data analytics training (SQL, Python, statistics and dashboards)",
    skills: ["SQL", "Python and Pandas", "Statistics", "Dashboards", "Reporting", "Working in a team"],
    project: "an end-to-end business analysis",
    internshipWork: ["Months 4–6: analyse data and build reports for live projects with our team"],
  }),

  // ------------------------------------------------------------ Python Developer
  "python-developer-1-month": {
    desc: "A one-month Python foundation: variables, loops, functions, lists and dictionaries, and working with files, ending in a command-line expense tracker you build yourself with mentor feedback.",
    points: ["Python syntax, loops & functions", "Lists, dictionaries & files", "Problem-solving practice", "Project: command-line expense tracker"],
    skills: ["Python", "Problem solving", "Functions and loops", "Lists and dictionaries", "Working with files"],
    responsibilities: [
      "Learn Python syntax, variables and data types",
      "Solve problems with loops, conditions and functions",
      "Store data in lists and dictionaries",
      "Read and write text and CSV files",
      "Build a command-line expense tracker",
    ],
    outcomes: [
      "Write small Python programs on your own",
      "Break a problem into steps and code it",
      "Save and load data from files",
      "Read error messages and fix your code",
    ],
    audience: [
      "Complete beginners to programming",
      "Students who want Python for college or placements",
      "Anyone deciding whether to take a longer Python track",
    ],
    prerequisites: ["No coding experience needed", "A laptop or desktop with internet", "About 2–3 hours a day for the month"],
    faqs: [
      { q: "Is Python a good first language?", a: "Yes. Its syntax is clear and readable, and it's used in web development, automation, data and AI." },
      { q: "Will I build websites in one month?", a: "No. The first month builds core Python skills. Web frameworks and databases come in the 3 and 6 month tracks." },
      END_FAQ("a working Python project"),
    ],
  },
  "python-developer-2-months": {
    desc: "Two months of practical Python: the core language, then object-oriented programming, error handling, CSV and JSON data, and calling web APIs, ending in an automation script that pulls live data into a spreadsheet.",
    points: ["Core Python & OOP", "Error handling & modules", "CSV, JSON & web APIs", "Project: API-to-spreadsheet automation"],
    skills: ["Python", "Object-oriented programming", "Error handling", "CSV and JSON", "REST APIs (requests)", "Git basics"],
    responsibilities: [
      "Write clean Python with functions, modules and classes",
      "Handle errors so scripts don't crash on bad data",
      "Read and write CSV and JSON files",
      "Call web APIs with the requests library",
      "Automate a repetitive task: pull API data into a spreadsheet",
    ],
    outcomes: [
      "Structure a program with classes and modules",
      "Work with real data formats such as CSV and JSON",
      "Fetch data from web APIs",
      "Automate everyday tasks with Python scripts",
    ],
    audience: [
      "Beginners who want to go past Python basics",
      "Students who want to automate tasks with code",
      "Anyone preparing for Python developer internships",
    ],
    prerequisites: ["No experience needed; basic Python helps", "A laptop or desktop with internet", "About 2–3 hours a day for two months"],
    faqs: [
      { q: "What will I automate?", a: "A script that fetches live data from a web API and saves it into a spreadsheet — the kind of task companies automate every day." },
      { q: "Does the 2-month track include Django or Flask?", a: "No. Web frameworks, databases and testing start in the 3-month track." },
      END_FAQ("an automation project"),
    ],
  },
  "python-developer-3-months": {
    desc: "Three months to become a Python developer: clean code, files and data, a web framework (Flask or Django), SQL databases and testing with pytest, ending in a web app or API reviewed by a mentor.",
    points: ["Clean, structured Python", "Flask / Django web basics", "SQL databases & pytest", "Project: web app or REST API"],
    skills: ["Python", "Flask or Django", "SQL databases", "pytest", "REST APIs", "Git basics"],
    responsibilities: [
      "Learn Python from the basics to clean, well-structured code",
      "Work with files, spreadsheets and simple APIs",
      "Build a web app or REST API with Flask or Django",
      "Store data in a SQL database",
      "Write tests with pytest to check your code works",
      "Use Git and act on code-review feedback",
    ],
    outcomes: [
      "Build a working back-end app with a database",
      "Write tests that catch bugs early",
      "Design simple REST APIs",
      "Work with Git like a professional developer",
    ],
    audience: [
      "Students aiming for Python or back-end developer roles",
      "Learners who know Python basics and want to build real apps",
      "Final-year students preparing for interviews",
    ],
    prerequisites: ["No experience required; basic Python makes the pace easier", "A laptop or desktop with internet", "About 2–3 hours a day for three months"],
    faqs: [
      { q: "Flask or Django — which will I learn?", a: "The track uses a Python web framework such as Flask or Django; your mentor guides you based on your project." },
      { q: "What is the difference between the 3 and 6 month Python tracks?", a: "Three months cover web basics, databases and testing. Six months add FastAPI or Django REST, authentication, background jobs and deployment, with a bigger capstone." },
      END_FAQ("a back-end project"),
    ],
  },
  "python-developer-6-months": {
    desc: "The complete six-month Python developer programme: everything in the 3-month track, then REST APIs with FastAPI or Django REST Framework, authentication, background jobs and deployment, ending in a production-style back-end capstone.",
    points: ["Python, web frameworks & SQL", "FastAPI / Django REST Framework", "Auth, background jobs & deployment", "Capstone: production-style back end"],
    skills: ["Python", "FastAPI or Django REST", "SQL and ORMs", "Authentication", "pytest", "Deployment"],
    responsibilities: [
      "Master core Python, OOP and testing",
      "Build REST APIs with FastAPI or Django REST Framework",
      "Model data with an ORM and SQL database",
      "Add login, roles and secure API keys",
      "Run background jobs and scheduled tasks",
      "Deploy and present a production-style back-end capstone",
    ],
    outcomes: [
      "Design and build complete back-end services",
      "Secure APIs with authentication and roles",
      "Deploy a Python app to the cloud",
      "Present a capstone that shows real back-end skills",
    ],
    audience: [
      "Students aiming for Python back-end developer jobs",
      "Beginners who want one long, structured programme from zero",
      "Graduates who want a strong back-end portfolio project",
    ],
    prerequisites: ["No experience needed: the programme starts from the basics", "A laptop or desktop with internet", "About 2–3 hours a day for six months"],
    faqs: [
      { q: "Why choose 6 months over 3?", a: "Six months add API design, authentication, background jobs and deployment — the skills used in real back-end jobs — plus a larger capstone." },
      { q: "Is FastAPI or Django REST better?", a: "Both are widely used. FastAPI is quick and modern; Django REST is batteries-included. You'll learn the ideas that carry across both." },
      END_FAQ("a deployed back-end capstone"),
    ],
  },
  "python-developer-6-months-2": paidInternship({
    track: "Python Developer",
    trainingSummary: "Python developer training (web frameworks, SQL databases and testing)",
    skills: ["Python", "Flask or Django", "SQL databases", "pytest", "Git and code review", "Working in a dev team"],
    project: "a web app or REST API",
    internshipWork: ["Months 4–6: build and test back-end features for live projects with our team"],
  }),

  // ------------------------------------------------------------ Frontend Developer (React.js)
  "frontend-developer-react-js-1-month": {
    desc: "A one-month fast track to React: the JavaScript you need, then components, props and state, ending in your first React app — an interactive to-do list — built with mentor feedback.",
    points: ["JavaScript essentials for React", "Components, props & state", "Handling events & forms", "Project: interactive to-do app"],
    skills: ["JavaScript", "React", "JSX", "Components and props", "useState"],
    responsibilities: [
      "Learn the JavaScript React relies on: arrays, objects, arrow functions",
      "Build UIs from reusable React components",
      "Manage data with props and state",
      "Handle clicks and form input",
      "Build an interactive to-do app in React",
    ],
    outcomes: [
      "Read and write React code with confidence",
      "Break a screen into reusable components",
      "Build interactive UIs with state",
      "Run and share a React project",
    ],
    audience: [
      "Learners who know some HTML and CSS and want to start React",
      "Students who want a quick, focused introduction to React",
      "Anyone deciding whether to take a longer React track",
    ],
    prerequisites: ["Basic HTML and CSS help", "A laptop or desktop with internet", "About 2–3 hours a day for the month"],
    faqs: [
      { q: "Do I need to know JavaScript first?", a: "Not deeply. The month starts with the JavaScript React needs, then moves into React itself." },
      { q: "What comes after the 1-month track?", a: "Routing, APIs and styling come in the 2-month track; state management, testing and deployment in the 3 and 6 month tracks." },
      END_FAQ("your first React app"),
    ],
  },
  "frontend-developer-react-js-2-months": {
    desc: "Two months of React for real apps: hooks, routing, forms, calling APIs and styling with Tailwind CSS, ending in a responsive e-commerce product catalogue that loads live data.",
    points: ["React hooks & React Router", "Forms & API calls", "Tailwind CSS & responsive design", "Project: e-commerce product catalogue"],
    skills: ["JavaScript", "React", "React Router", "Tailwind CSS", "REST APIs", "Responsive design"],
    responsibilities: [
      "Use hooks such as useState, useEffect and custom hooks",
      "Add multi-page navigation with React Router",
      "Build and validate forms",
      "Load data from APIs, with loading and error states",
      "Style responsive pages with Tailwind CSS",
      "Build an e-commerce product catalogue with search and filters",
    ],
    outcomes: [
      "Build multi-page React apps that use live data",
      "Make every page look right on phones and laptops",
      "Handle forms and user input properly",
      "Show a polished front-end project in your portfolio",
    ],
    audience: [
      "Learners who know React basics and want to build real apps",
      "Students aiming for front-end internships",
      "Designers who want to turn designs into working pages",
    ],
    prerequisites: ["No experience needed; basic HTML, CSS and JavaScript help", "A laptop or desktop with internet", "About 2–3 hours a day for two months"],
    faqs: [
      { q: "What will I build?", a: "A responsive product catalogue with search, filters and product pages, loading live data from an API." },
      { q: "What is the difference between the 2 and 3 month React tracks?", a: "Two months cover hooks, routing, APIs and styling. Three months add state management, testing basics, performance and deployment." },
      END_FAQ("a responsive React project"),
    ],
  },
  "frontend-developer-react-js-3-months": {
    desc: "The complete React developer track in three months: JavaScript and React from components to routing and forms, state management with Redux Toolkit, testing basics and deployment, ending in a deployed dashboard app.",
    points: ["React from basics to routing & forms", "State management with Redux Toolkit", "Testing basics & performance", "Project: deployed dashboard app"],
    skills: ["HTML", "CSS", "JavaScript", "React", "Redux Toolkit", "Git basics"],
    responsibilities: [
      "Learn React from components and state to routing and forms",
      "Build responsive pages that work on phones, tablets and laptops",
      "Connect screens to real APIs and handle loading and errors",
      "Manage app-wide state with Context and Redux Toolkit",
      "Use Git and pull requests, and act on code-review feedback",
      "Plan, build and deploy a dashboard app as your project",
    ],
    outcomes: [
      "Build a complete React app from design to deployment",
      "Manage complex state across many screens",
      "Write basic tests for components",
      "Work with Git and pull requests like a team developer",
    ],
    audience: [
      "Students aiming for front-end developer roles",
      "Learners who want one complete React track",
      "Final-year students preparing for interviews",
    ],
    prerequisites: ["No experience required; basic HTML and CSS make the pace easier", "A laptop or desktop with internet", "About 2–3 hours a day for three months"],
    faqs: [
      { q: "Will I learn Redux?", a: "Yes. The track covers React Context and Redux Toolkit for state shared across the app." },
      { q: "What is the difference between the 3 and 6 month React tracks?", a: "Three months make you a complete React developer. Six months add TypeScript, Next.js, advanced performance, accessibility and a larger capstone." },
      END_FAQ("a deployed React dashboard"),
    ],
  },
  "frontend-developer-react-js-6-months": {
    desc: "The complete six-month front-end programme: everything in the 3-month React track, then TypeScript, Next.js, testing with React Testing Library, performance and accessibility, ending in a production-quality capstone.",
    points: ["React, Redux Toolkit & routing", "TypeScript & Next.js", "Testing, performance & accessibility", "Capstone: production-quality web app"],
    skills: ["React", "TypeScript", "Next.js", "Redux Toolkit", "React Testing Library", "Accessibility"],
    responsibilities: [
      "Master React from the basics to advanced patterns",
      "Write type-safe components with TypeScript",
      "Build server-rendered, SEO-friendly pages with Next.js",
      "Test components with React Testing Library",
      "Measure and improve performance and accessibility",
      "Plan, build and present a production-quality capstone",
    ],
    outcomes: [
      "Build production-grade front ends with React and Next.js",
      "Use TypeScript to catch bugs before they ship",
      "Make apps fast and usable for everyone",
      "Present a capstone that stands out to employers",
    ],
    audience: [
      "Students aiming for front-end or React developer jobs",
      "Beginners who want one long, structured programme into front end",
      "Developers who want TypeScript and Next.js on their CV",
    ],
    prerequisites: ["No experience needed: the programme starts from the basics", "A laptop or desktop with internet", "About 2–3 hours a day for six months"],
    faqs: [
      { q: "Why choose 6 months over 3?", a: "Six months add TypeScript, Next.js, testing and accessibility — what companies expect from front-end developers today — plus a larger capstone." },
      { q: "Is Next.js covered?", a: "Yes, in the second half: routing, server rendering and building SEO-friendly pages." },
      END_FAQ("a production-quality capstone"),
    ],
  },
  "frontend-developer-react-js-6-months-2": paidInternship({
    track: "Frontend Developer (React.js)",
    trainingSummary: "React training (components, routing, APIs and state management)",
    skills: ["JavaScript", "React", "Redux Toolkit", "Responsive design", "Git and code review", "Working in a dev team"],
    project: "a deployed dashboard app",
    internshipWork: ["Months 4–6: build screens and features for live projects with our team"],
  }),

  // ------------------------------------------------------------ Cyber Security
  "cyber-security-1-month": {
    desc: "A one-month start in cyber security: networking, Linux and how common attacks work, in your own safe practice lab, ending in a network scan report of your lab.",
    points: ["Networking basics (TCP/IP, DNS)", "Linux command line", "How common attacks work", "Project: home lab & scan report"],
    skills: ["Networking basics", "Linux", "Nmap basics", "Security fundamentals"],
    responsibilities: [
      "Learn how networks, IP addresses and ports work",
      "Use the Linux command line with confidence",
      "Set up your own safe practice lab with virtual machines",
      "Understand phishing, malware and password attacks",
      "Scan your lab with Nmap and write a simple report",
    ],
    outcomes: [
      "Explain how data moves across a network",
      "Work comfortably in Linux",
      "Run a basic network scan and read its results",
      "Write a short, clear security report",
    ],
    audience: [
      "Complete beginners curious about cyber security",
      "Students deciding whether to take a longer security track",
      "Anyone who wants to protect themselves and their organisation online",
    ],
    prerequisites: ["No experience needed", "A laptop that can run a virtual machine (8 GB RAM recommended)", "About 2–3 hours a day for the month"],
    faqs: [
      { q: "Is ethical hacking legal?", a: "Yes, when done only on systems you own or have permission to test. All practice in this track happens in your own lab and legal practice environments." },
      { q: "Will I learn web hacking in one month?", a: "Not yet. One month builds the foundations. Web security and the OWASP Top 10 start in the 2-month track." },
      END_FAQ("a lab scan report for your portfolio"),
    ],
  },
  "cyber-security-2-months": {
    desc: "Two months of hands-on security: networking and Linux, then web security basics, the OWASP Top 10, Wireshark and Burp Suite, ending in a report of flaws you find in a practice web app.",
    points: ["Networking, Linux & Nmap", "Wireshark traffic analysis", "OWASP Top 10 & Burp Suite", "Project: practice web app security report"],
    skills: ["Networking & Linux", "Nmap", "Wireshark", "Burp Suite", "OWASP Top 10"],
    responsibilities: [
      "Build networking and Linux skills for security work",
      "Capture and read network traffic with Wireshark",
      "Learn the OWASP Top 10 web vulnerabilities",
      "Test a practice web app with Burp Suite",
      "Report the flaws you find and how to fix them",
    ],
    outcomes: [
      "Spot suspicious activity in network traffic",
      "Find common web flaws such as SQL injection and XSS",
      "Use Burp Suite to test web apps",
      "Write findings in a clear, professional format",
    ],
    audience: [
      "Beginners who want to move into web security",
      "Students preparing for security internships",
      "Developers who want to write safer code",
    ],
    prerequisites: ["No experience needed", "A laptop that can run a virtual machine (8 GB RAM recommended)", "About 2–3 hours a day for two months"],
    faqs: [
      { q: "What is the OWASP Top 10?", a: "A widely used list of the most common web application security risks, such as injection and broken access control." },
      { q: "What is the difference between the 2 and 3 month tracks?", a: "Two months cover networking, Wireshark and web security basics. Three months go further into exploiting and fixing OWASP flaws and finish with a full security assessment." },
      END_FAQ("a web security report"),
    ],
  },
  "cyber-security-3-months": {
    desc: "Learn to find and fix security weaknesses in networks and websites in three months — hands-on, in safe practice labs — with Nmap, Wireshark and Burp Suite, ending in a full security assessment with a written report.",
    points: ["Networking, Linux & Nmap", "Wireshark & Burp Suite", "OWASP Top 10: find and fix", "Project: full security assessment"],
    skills: ["Networking & Linux", "Web security (OWASP Top 10)", "Nmap", "Wireshark", "Burp Suite", "Security reporting"],
    responsibilities: [
      "Learn how networks, websites and common attacks work",
      "Scan and test practice systems with Nmap, Wireshark and Burp Suite",
      "Find and fix OWASP Top 10 flaws such as SQL injection and XSS",
      "Recommend fixes developers can act on",
      "Capstone: a full security assessment with a written report",
    ],
    outcomes: [
      "Carry out a security assessment from start to finish",
      "Find, prove and explain common vulnerabilities",
      "Recommend practical fixes",
      "Write a professional assessment report",
    ],
    audience: [
      "Students aiming for security analyst or VAPT roles",
      "Learners who want a complete hands-on security track",
      "Developers and IT students who want security skills",
    ],
    prerequisites: ["No experience required; basic networking helps", "A laptop that can run a virtual machine (8 GB RAM recommended)", "About 2–3 hours a day for three months"],
    faqs: [
      { q: "Is all practice legal and safe?", a: "Yes. You only test your own lab and legal practice environments, never real systems without permission." },
      { q: "What is the difference between the 3 and 6 month tracks?", a: "Three months cover a full web and network assessment. Six months add privilege escalation, log analysis with a SIEM, incident response and capture-the-flag practice." },
      END_FAQ("a full security assessment report"),
    ],
  },
  "cyber-security-6-months": {
    desc: "The complete six-month cyber security programme: everything in the 3-month track, then privilege escalation, log analysis with a SIEM, incident response and capture-the-flag practice, ending in a full penetration test of a lab network.",
    points: ["Network & web security assessment", "Privilege escalation in labs", "SIEM log analysis & incident response", "Capstone: lab network penetration test"],
    skills: ["Networking & Linux", "Burp Suite & Nmap", "Privilege escalation", "SIEM and log analysis", "Incident response", "Security reporting"],
    responsibilities: [
      "Master network and web security testing",
      "Practise Linux and Windows privilege escalation in labs",
      "Detect attacks by analysing logs in a SIEM",
      "Follow an incident response process",
      "Solve capture-the-flag (CTF) challenges",
      "Plan, run and report a penetration test of a lab network",
    ],
    outcomes: [
      "Run a full penetration test in a lab, from scan to report",
      "Think like both an attacker and a defender",
      "Investigate security alerts and respond to incidents",
      "Present a capstone report that shows real security skills",
    ],
    audience: [
      "Students aiming for SOC analyst, VAPT or security engineer roles",
      "Beginners who want one long, structured programme into security",
      "IT students who want both offensive and defensive skills",
    ],
    prerequisites: ["No experience needed: the programme starts from the basics", "A laptop that can run virtual machines (8–16 GB RAM recommended)", "About 2–3 hours a day for six months"],
    faqs: [
      { q: "Why choose 6 months over 3?", a: "Six months cover both attack and defence — privilege escalation, SIEM, incident response and CTFs — with a full penetration test as your capstone." },
      { q: "Does this help with certifications?", a: "The skills match what entry-level security certifications test, but the programme doesn't include an exam fee or certification." },
      END_FAQ("a penetration test report for your portfolio"),
    ],
  },
  "cyber-security-6-months-2": paidInternship({
    track: "Cyber Security",
    trainingSummary: "cyber security training (networking, Linux, OWASP Top 10 and security assessments)",
    skills: ["Networking & Linux", "Nmap", "Burp Suite", "OWASP Top 10", "Security reporting", "Working in a team"],
    project: "a full security assessment",
    internshipWork: ["Months 4–6: help test and report on the security of live projects with our team"],
  }),
};

// The shared descriptions every length of a domain had before this. A program
// whose description is no longer one of these was edited in Admin since, so
// it is left alone.
const OLD_DESCS = [
  "The complete web training: pages, forms and the server behind them, from HTML and CSS to a simple Node.js back end and a deployed website. Top performers are selected for a stipend-based internship.",
  "The complete AI/ML training: data preparation, model training and evaluation in Python, and building AI features with real APIs, ending in a capstone project. Top performers are selected for a stipend-based internship.",
  "The complete data training: spreadsheets, SQL, Python and Pandas, statistics and dashboards, ending in a real analysis project you present. Open to commerce, science and arts students. Top performers are selected for a stipend-based internship.",
  "The complete Python training: clean code, files and data, simple APIs and testing, ending in a real project reviewed by a mentor. Top performers are selected for a stipend-based internship.",
  "The complete React and JavaScript training: from the basics to a deployed capstone project, with code reviews from a mentor. Top performers are selected for a stipend-based internship on live projects.",
  "Learn to find and fix security weaknesses in networks and websites — hands-on, in safe practice labs, from zero to a full security assessment.",
];

// The Data Science tracks carried a "Mobile" tag copied from an old mobile-dev
// entry; their points were about Java/Kotlin too (replaced above).
const TAG_FIXES = { "Mobile": "" };

module.exports = { PROGRAM_CONTENT, OLD_DESCS, TAG_FIXES };
