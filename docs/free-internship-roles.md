# Free internship roles: how to change them

The Free Internship page (`/free-internships`) is a **static page**. Its roles and the Google Form link are written in the website's code, in one file:

**`Frontend/src/data/freeInternships.json`**

They are **not** stored in the database or edited in Admin, and the page makes no request to the backend. To change anything, edit that file, then merge to `main`. Vercel redeploys the site, and the page shows the change once someone reloads it.

That one file also feeds:
- the search-engine job listings (schema.org `JobPosting`) on the page and in the prebuilt HTML (`Frontend/scripts/prerender-meta.js`);
- the help chat, which can answer about a role by name;
- the FAQ answer "Which free internships are open, and when do they start?".

The page text, the four steps, "Who can apply" and the Rules are in `Frontend/src/data/freeInternships.js`. The search title, description and keywords are under `"/free-internships"` in `Frontend/src/data/seo.json`.

## The file

```json
{
  "applyFormUrl": "https://forms.gle/…",
  "openings": [ { …one role… }, { …the next… } ]
}
```

- **`applyFormUrl`** is the Google Form that **Apply Now** opens, in a new tab, for every role. People who apply are in the form's responses (Google Forms or its Sheet), **not** in Admin → Applicants. Make sure the form asks which role they want.
- **`openings`** lists the roles in the order the page shows them.

## One role

| Field | What it is | Example |
|---|---|---|
| `slug` | A unique id: lowercase letters, numbers and dashes | `mern-stack-developer-intern` |
| `title` | The card's heading | `MERN Stack Developer Intern` |
| `summary` | Shown in the role's details | One or two sentences |
| `skills` | A list of short texts | `["React", "Node.js"]` |
| `responsibilities` | A list, one task each | |
| `eligibility` | A list, one rule each | |
| `stipend` | Shown as is | `No Stipend` |
| `experience` | Shown as is | `0–1 year (freshers welcome)` |
| `duration` | Shown as is | `3 months` |
| `mode` | Shown as is | `Remote / Ahmedabad` |
| `startsOn` | An estimate, shown as "Starts on" | `December-January` |
| `group` | Leave `""`. Roles with the same group become one card with a duration switch (e.g. a 3-month and a 6-month version) | `""` |
| `positions` | `{ "total": 10, "filled": 0, "left": 10 }`. The card says "10 positions open"; with `"left": 0` it says "Positions filled", Apply Now turns off and the role is left out of search listings | |
| `datePosted` | The day the role was first listed, `YYYY-MM-DD`, for search engines | `2026-11-15` |

## Common changes

- **Close a role:** delete it from `openings`, or set its `positions.left` to `0` to show it as filled.
- **Add a role:** copy an existing role, then give it a new `slug`, `title`, text and today's `datePosted`.
- **Change the start for every role:** change `startsOn` on each role.
- **Change the application form:** change `applyFormUrl`.

## Old data in the database

Free internship openings that were created in Admin before the page became static (audience `free`) are still in the database. Nothing shows them, and they're kept only so that older on-site applications (with their CVs, tests and statuses) keep working in Admin → Applicants and in each student's dashboard.
