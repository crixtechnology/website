# Crix Technology — React Website (Simple / Create React App style)

Classic React setup — wahi familiar workflow:
    npm install
    npm start          -> http://localhost:3000
    npm run build      -> production build in build/ folder

## Pages
/ (Home) · /internships · /services · /courses · /about · /contact

## Content edit karna
Saara text EK file mein hai: src/data/content.js
- site.phone / site.whatsapp / site.email  <- APNA ASLI NUMBER DAALO
- testimonials                             <- asli student quotes daalo
- services / courses / internships arrays  <- freely add/edit/remove

## Deploy (Vercel)
Option A (GitHub, best):
  1. Folder ko GitHub repo mein push karo
  2. vercel.com -> Add New Project -> repo import -> Deploy
     (Create React App auto-detect hota hai)
  3. Settings -> Domains -> crixtechnology.in add karo
Option B: Netlify pe bhi same — repo import, build command `npm run build`,
  publish directory `build`

vercel.json included hai taaki /internships jaise direct URLs refresh pe
bhi kaam karein (SPA routing).

## Backend (server/) — Node + Express + MongoDB + Razorpay
Poora backend `server/` folder mein hai — apna alag `package.json`, alag deploy (Render/Railway).

Local run (koi MongoDB install/account nahi chahiye — in-memory DB use karta hai):
    cd server
    npm install
    cp .env.example .env        <- fill in real values later; test Razorpay keys ke liye abhi placeholder chalega
    npm run dev:memory          <- auto-seeds the admin from ADMIN_EMAIL/ADMIN_PASSWORD, starts on :5000

Real MongoDB (Atlas) ke saath run karna ho:
    npm run seed:admin          <- one-time, creates the first admin
    npm run dev                 <- MONGODB_URI se real DB use karega

Frontend ko backend se connect karne ke liye, root mein `.env`:
    REACT_APP_API_URL=http://localhost:5000/api

### Test → Live Razorpay
`server/.env` mein `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` —
abhi apne Razorpay dashboard ke **Test Mode** keys daalo. Jab live jaana ho, sirf yeh
teen values live keys se badal do — code mein kahin kuch change nahi karna padega.

### Admin panel (Courses)
`/admin/login` pe apne `ADMIN_EMAIL` / `ADMIN_PASSWORD` se login karo, phir `/admin/courses`
pe naya course banao, price/discount set karo, aur status open/closed toggle karo — sab
turant public `/programs` page pe reflect hota hai.

## Structure
src/
  data/content.js    <- SAB CONTENT YAHAN
  services/api.js    <- backend layer (fetch)
  components/ui.jsx  <- Navbar, Footer, Hero3D, Reveal, cards, chrome
  pages/pages.jsx    <- saare 6 pages
  styles/global.css  <- design system
  index.js, App.jsx  <- entry + routing
public/
  index.html
