# Free internship roles: what to type in Admin

Five roles for the free internships page (`/free-internships`). Go to **Admin → Job openings → Add a new opening**, fill in one role, press **Create**, then do the next one.

Each section below lists the fields **in the same order as the admin form**. Copy the text to the right of each field label.

> **Marked ✏️ = your decision.** These are suggestions. Nothing in the site says yet what the stipend, duration or mode is, so change them to whatever you have decided before you press Create.

---

## Before you start

1. **The new question banks need the code PR merged and deployed first.** The "Technical questions from" choices *Frontend (React & JavaScript)*, *Python Programming*, *Web Fundamentals (HTML, CSS, JS, HTTP)* and *AI / Machine Learning* show up in the dropdown only after that. When the server starts on the new code it adds the questions by itself, once. You don't need to do anything else.
   If you add the roles **before** the deploy, use the fallback given for each role, then use **Edit** to change it after the deploy.
2. **The Stipend box starts filled in** with "Up to ₹6,000/month (performance based)". That's the default for the paid careers roles. For a free internship you will probably want to **clear it**: an empty stipend is simply not shown on the page. ✏️
3. **Fee:** once you pick *Listed on → Free internships page only*, the form shows no fee box. These roles always charge the **test processing fee** from Admin → Careers settings (₹94 now), which comes back in full as wallet credit. You don't type a fee per role.
4. **Status:** a new role is **Open** as soon as you create it, so it appears on `/free-internships` straight away. Use the Open/Closed button in the list to hide one.
5. **Shared sections:** free-internship roles automatically draw their quantitative, logical and verbal questions from the new, gentler **foundation** banks, which are meant for students of any field. There is nothing to set.

### Form limits (checked when you press Create)

| Field | Limit |
|---|---|
| Title | up to 150 characters, required |
| Short description | up to 2,000 characters |
| Skills / Responsibilities / Eligibility | up to 30 items, each up to 300 characters |
| Stipend, Experience, Duration, Mode | up to 190 characters each |
| Duration (minutes) | 5 to 300 |
| Questions per section | whole numbers 0 to 60; at least 1 in total |
| Marks per question | 0.25 to 100 |
| Cut-off score | 0 or more |

### Suggested test settings (the same for all five roles) ✏️

| Field | Value | Why |
|---|---|---|
| Duration (minutes) | `45` | 40 questions. The form's default of 30 minutes is tight for first-year and non-CS students. |
| Quantitative questions | `8` | |
| Logical reasoning questions | `8` | |
| Verbal ability questions | `8` | |
| Technical questions | `16` | The technical part carries the most weight. Every new bank has 42 or more questions, plus generated ones, so papers vary. |
| Marks per question | `1` | Test is out of 40. |
| Cut-off score | `16` | 40% of 40. Shown only to admins. Raise it if you get too many applicants. |

---

## 1. Frontend Developer (React.js)

**Top of the form**

| Field | Value |
|---|---|
| Title | `Frontend Developer Intern (React.js)` |
| Technical questions from | **Frontend (React & JavaScript)**. Before the deploy: *Web Development* |
| Display order | `1` |

**Short description**
```
Build real screens for live projects with React and JavaScript, guided by a mentor from our team. No experience needed — just curiosity and the basics of HTML, CSS and JavaScript (or the willingness to learn them before you start).
```

**Skills (separate with commas)**
```
HTML, CSS, JavaScript, React basics, Git basics, Responsive design
```

**Responsibilities (one per line)**
```
Turn page designs into React components with HTML, CSS and JavaScript
Make pages work well on phones, tablets and laptops
Connect screens to APIs and show the data clearly
Fix small bugs and polish the look of existing pages
Use Git for your work and act on code-review feedback
Share a short progress update with your mentor every day
```

**Eligibility (one per line)**
```
Students of any field or stream, in any year, at a recognised school, college or university in India, or recent graduates
18 years of age or older on the day of the test
Basic HTML, CSS and JavaScript; some React is a plus, not a must
A laptop or desktop with a working webcam and a stable internet connection
Able to give about 2–3 hours a day for the length of the internship
```

**Stipend, experience, duration, mode**

| Field | Value |
|---|---|
| Stipend | *(leave empty)* ✏️ |
| Experience | `Freshers welcome — no experience needed` |
| Duration | `3 months` ✏️ |
| Mode | `Remote` ✏️ |

**Aptitude test for this role**

| Field | Value |
|---|---|
| Listed on | **Free internships page only (/free-internships, CV required)** |
| Duration (minutes) | `45` ✏️ |
| Quantitative questions | `8` |
| Logical reasoning questions | `8` |
| Verbal ability questions | `8` |
| Technical questions | `16` |
| Marks per question | `1` |
| Cut-off score | `16` ✏️ |

---

## 2. Python Developer

**Top of the form**

| Field | Value |
|---|---|
| Title | `Python Developer Intern` |
| Technical questions from | **Python Programming**. Before the deploy: *Data Science* |
| Display order | `2` |

**Short description**
```
Write Python for real tasks: small tools, scripts that save time, and simple back-end features. You'll learn to write clean, tested code with a mentor reviewing your work. Ideal if you know the basics of Python and want real practice.
```

**Skills (separate with commas)**
```
Python basics, Problem solving, Functions and loops, Lists and dictionaries, Working with files, Git basics
```

**Responsibilities (one per line)**
```
Write Python scripts and small tools for real project tasks
Read and write data from files, spreadsheets and simple APIs
Fix bugs in existing Python code and explain the fix
Write simple tests to check that your code works
Use Git for your work and act on code-review feedback
Share a short progress update with your mentor every day
```

**Eligibility (one per line)**
```
Students of any field or stream, in any year, at a recognised school, college or university in India, or recent graduates
18 years of age or older on the day of the test
Basic Python: variables, loops, functions, lists and dictionaries
A laptop or desktop with a working webcam and a stable internet connection
Able to give about 2–3 hours a day for the length of the internship
```

**Stipend, experience, duration, mode**

| Field | Value |
|---|---|
| Stipend | *(leave empty)* ✏️ |
| Experience | `Freshers welcome — no experience needed` |
| Duration | `3 months` ✏️ |
| Mode | `Remote` ✏️ |

**Aptitude test for this role**: same as role 1. *Listed on* is **Free internships page only**, then `45` minutes, `8` / `8` / `8` / `16` questions, `1` mark each, cut-off `16`.

---

## 3. Web Developer

**Top of the form**

| Field | Value |
|---|---|
| Title | `Web Developer Intern` |
| Technical questions from | **Web Fundamentals (HTML, CSS, JS, HTTP)**. Before the deploy: *Web Development* |
| Display order | `3` |

**Short description**
```
Learn how websites really work, from the page in the browser to the server behind it. You'll build and fix pages with HTML, CSS and JavaScript and help with simple server and form features on real projects.
```

**Skills (separate with commas)**
```
HTML, CSS, JavaScript, How the web works (HTTP), Basic Node.js or any back end, Git basics
```

**Responsibilities (one per line)**
```
Build and update web pages with HTML, CSS and JavaScript
Make pages fast, accessible and mobile-friendly
Help build simple forms and the server code that receives them
Test pages in different browsers and fix what breaks
Use Git for your work and act on code-review feedback
Share a short progress update with your mentor every day
```

**Eligibility (one per line)**
```
Students of any field or stream, in any year, at a recognised school, college or university in India, or recent graduates
18 years of age or older on the day of the test
Basic HTML, CSS and JavaScript; any back-end knowledge is a plus
A laptop or desktop with a working webcam and a stable internet connection
Able to give about 2–3 hours a day for the length of the internship
```

**Stipend, experience, duration, mode**

| Field | Value |
|---|---|
| Stipend | *(leave empty)* ✏️ |
| Experience | `Freshers welcome — no experience needed` |
| Duration | `3 months` ✏️ |
| Mode | `Remote` ✏️ |

**Aptitude test for this role**: same as role 1. *Listed on* is **Free internships page only**, then `45` minutes, `8` / `8` / `8` / `16` questions, `1` mark each, cut-off `16`.

---

## 4. AI/ML Developer

**Top of the form**

| Field | Value |
|---|---|
| Title | `AI/ML Developer Intern` |
| Technical questions from | **AI / Machine Learning**. Before the deploy: *Data Science* |
| Display order | `4` |

**Short description**
```
Get hands-on with machine learning: prepare data, train and test simple models in Python, and see how AI features are built into real products. Good for students who know some Python and want to understand how AI actually works.
```

**Skills (separate with commas)**
```
Python basics, NumPy and Pandas basics, Machine learning concepts, scikit-learn basics, Basic statistics, Curiosity about AI
```

**Responsibilities (one per line)**
```
Collect, clean and prepare data for machine-learning models
Train and test simple models with Python and scikit-learn
Measure how well a model works and explain the results simply
Try out AI tools and APIs on small project tasks
Write down your experiments so others can repeat them
Share a short progress update with your mentor every day
```

**Eligibility (one per line)**
```
Students of any field or stream, in any year, at a recognised school, college or university in India, or recent graduates
18 years of age or older on the day of the test
Basic Python; school-level maths is enough to start
A laptop or desktop with a working webcam and a stable internet connection
Able to give about 2–3 hours a day for the length of the internship
```

**Stipend, experience, duration, mode**

| Field | Value |
|---|---|
| Stipend | *(leave empty)* ✏️ |
| Experience | `Freshers welcome — no experience needed` |
| Duration | `3 months` ✏️ |
| Mode | `Remote` ✏️ |

**Aptitude test for this role**: same as role 1. *Listed on* is **Free internships page only**, then `45` minutes, `8` / `8` / `8` / `16` questions, `1` mark each, cut-off `16`.

---

## 5. Data Scientist / Data Analyst

**Top of the form**

| Field | Value |
|---|---|
| Title | `Data Scientist / Data Analyst Intern` |
| Technical questions from | **Data Science** (same choice before and after the deploy; after it, the bank has 25 more SQL, statistics and data-cleaning questions) |
| Display order | `5` |

**Short description**
```
Turn raw data into answers. You'll clean and explore real datasets, write SQL queries, build charts and simple reports, and explain what the numbers mean. Open to students of any field — commerce, science and arts students are welcome.
```

**Skills (separate with commas)**
```
Excel or Google Sheets, SQL basics, Python or Pandas basics, Basic statistics, Charts and dashboards, Clear communication
```

**Responsibilities (one per line)**
```
Clean and organise data from spreadsheets, databases and files
Write SQL queries to pull and summarise data
Explore data and find trends with Python, Pandas or spreadsheets
Build clear charts and simple dashboards
Explain what the data shows in plain language
Share a short progress update with your mentor every day
```

**Eligibility (one per line)**
```
Students of any field or stream, in any year, at a recognised school, college or university in India, or recent graduates
18 years of age or older on the day of the test
Comfortable with numbers and spreadsheets; SQL or Python basics are a plus
A laptop or desktop with a working webcam and a stable internet connection
Able to give about 2–3 hours a day for the length of the internship
```

**Stipend, experience, duration, mode**

| Field | Value |
|---|---|
| Stipend | *(leave empty)* ✏️ |
| Experience | `Freshers welcome — no experience needed` |
| Duration | `3 months` ✏️ |
| Mode | `Remote` ✏️ |

**Aptitude test for this role**: same as role 1. *Listed on* is **Free internships page only**, then `45` minutes, `8` / `8` / `8` / `16` questions, `1` mark each, cut-off `16`.

---

## What each role's test asks

| Role | Technical bank | What's in it |
|---|---|---|
| Frontend Developer (React.js) | Frontend (React & JavaScript): 42 questions | JSX, props, state, hooks (useState, useEffect, useRef, useContext), lists and keys, events, React Router, modern JavaScript (destructuring, spread, map/filter, async/await, fetch) |
| Python Developer | Python Programming: 42 questions | Types, strings, lists, dicts, sets, loops, functions, default arguments, scope, exceptions, files, classes, list comprehensions, pip |
| Web Developer | Web Fundamentals: 42 questions | HTML tags and forms, CSS selectors, box model, flexbox, media queries, DOM and events, JSON, HTTP methods and status codes, DNS, URLs, Express basics, cookies, passwords, server-side validation, SQL and Git basics |
| AI/ML Developer | AI / Machine Learning: 42 questions | Supervised and unsupervised learning, regression and classification, overfitting, train/validation/test, common algorithms, neural-network basics, loss and gradient descent, NLP and LLM basics, evaluation metrics, scikit-learn, fairness |
| Data Scientist / Data Analyst | Data Science: 75 questions (50 + 25 new) | Python, NumPy and Pandas, statistics, SQL (counts, filters, NULLs, joins, GROUP BY), spreadsheets, charts, data cleaning, plus some ML |

All five roles also get **foundation** quantitative, logical and verbal sections, 32 questions each. They cover percentages, ratios, averages, simple interest, number and letter series, directions, simple codes and relations, everyday vocabulary, grammar, idioms and short reading questions. They're kept fair for students of any field. Part of every section is also generated fresh for each candidate (Admin → Careers settings → generated questions share).

You can see, edit or switch off any of these questions in **Admin → Question bank**. The new categories appear in its filter.

In the applicants Excel download (Admin → Applicants), each candidate's scores sit in four columns: Quantitative, Logical Reasoning, Verbal Ability and Technical. Foundation scores go in the same columns as the standard ones. A "Technical questions from" column shows which bank the role used.

The role pop-up on `/free-internships` now tells candidates what the test covers. It has quantitative, logical and verbal questions pitched for students of any field, and technical questions for the role.
