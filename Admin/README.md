# Crix Admin Panel

The admin panel, deployed on its own — separate from the public site (`Frontend/`). It talks to the same backend (`Backend/`) and uses the same admin accounts.

## Run locally
```
cd Admin
npm install
cp .env.example .env     # REACT_APP_API_URL -> your backend's /api
npm start                # http://localhost:3001
```
The backend's `CLIENT_ORIGIN` must include `http://localhost:3001` (see `Backend/.env.example`).

## Deploy on Vercel (its own project)
1. Vercel -> Add New Project -> import this repo -> set **Root Directory** to `Admin`.
2. Framework preset: Create React App (auto-detected; `vercel.json` already sets build + SPA rewrites).
3. Environment variable: `REACT_APP_API_URL` = your backend's `/api` URL.
4. Deploy. Vercel gives you a `*.vercel.app` address — that is the admin panel's URL.
5. On the backend (Render), add that URL to `CLIENT_ORIGIN` (comma-separated, keep the public site first) and set `ADMIN_ORIGIN` to it, then redeploy the backend. Without this the browser blocks every request.

The panel is served with `noindex` headers and `robots.txt` disallows everything, but it is only as private as its URL and the admin login — don't share the link publicly.
