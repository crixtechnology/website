# Crix Technology — website (Frontend)

The public website and student area (Create React App).

    npm install
    npm start          -> http://localhost:3000
    npm run build      -> production build in build/ (then scripts/prerender-meta.js
                          writes per-page SEO HTML + sitemap.xml)
    npm test

Frontend ko backend se connect karne ke liye, is folder mein `.env`:

    REACT_APP_API_URL=http://localhost:5000/api

## Pages
Public: `/` · `/training-internship` · `/programs/:slug` · `/services` · `/about` ·
`/careers` · `/free-internships` · `/contact` · `/privacy-policy` ·
`/terms-of-service` · `/client-terms`

Student (login needed): `/dashboard` · `/profile` · `/learn/:slug` · `/test/:applicationId`

Old addresses (`/programs`, `/paid-internships`, `/internships`, `/courses`,
`/payment`, `/ambassador`, `/bca-internships`) redirect — see `vercel.json`.

## Content edit karna
- Site text, contact numbers, legal pages: `src/data/content.js`
  (Privacy Policy / Terms change karo to `legal.updated` date bhi badlo)
- Page titles, descriptions, keywords, sitemap priority: `src/data/seo.json`
- Help chat answers: `src/data/faqData.js`
- Live courses / Training + Internship programs come from the backend (Admin panel).

## Deploy (Vercel)
Project root = `Frontend`, build command `npm run build`, output `build`.
`vercel.json` holds the redirects, the rewrites that serve each page's
prerendered HTML, and security headers. Set `REACT_APP_API_URL` (and the
optional Google / analytics variables) in the Vercel project's environment.

## Rest of the repo
- `../Backend` — Node + Express + Prisma (MySQL) + Razorpay API. Copy
  `Backend/.env.example` to `Backend/.env`, then `npx prisma migrate deploy`,
  `npm run seed:admin`, `npm run dev` (port 5000). Tests need a local MySQL
  database named `crix_test`: `npm test`.
- `../Admin` — the admin panel, a separate React app with its own Vercel
  deployment (port 3001 locally).
- `../cloudflare-worker` — the signed-URL video gateway (see `../VIDEO_SYSTEM.md`).
- `../scripts/drive-to-b2-sync` — copies lecture recordings from Google Drive to B2.

### Test → Live Razorpay
`Backend/.env` mein `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`
— pehle Razorpay **Test Mode** keys. Live keys (`rzp_live_...`) tabhi charge karenge
jab `ALLOW_LIVE_PAYMENTS=true` bhi set ho.

## Structure
    src/
      data/content.js     <- site text + legal pages
      data/seo.json       <- titles / descriptions / sitemap
      services/api.js     <- backend calls (fetch)
      components/ui.jsx   <- Navbar, Footer, cards, popups
      pages/pages.jsx     <- public pages
      pages/Careers.jsx, pages/FreeInternships.jsx, pages/student/*
      styles/             <- design system
      index.js, App.jsx   <- entry + routing
    public/               <- index.html, icons, robots.txt, fallback sitemap.xml
    scripts/prerender-meta.js
