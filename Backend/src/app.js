// The configured Express app, with no side effects of its own (no DB
// connect, no .listen()) — split out of index.js specifically so tests can
// `require("./app")` and hand it straight to supertest without also
// connecting to whatever MONGODB_URI happens to be in the environment or
// binding a real port. index.js (the actual process entry point) is now
// just: require this, connectDB(), then app.listen().
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { allowedOrigins: getAllowedOrigins } = require("./utils/clientOrigin");

const authRoutes = require("./routes/auth");
const courseRoutes = require("./routes/courses");
const applicationRoutes = require("./routes/applications");
const paymentRoutes = require("./routes/payments");
const contactRoutes = require("./routes/contact");
const lectureRoutes = require("./routes/lectures");
const enrollmentRoutes = require("./routes/enrollments");
const videoRoutes = require("./routes/videos");
const adminUserRoutes = require("./routes/adminUsers");
const serviceRoutes = require("./routes/services");
const referralRoutes = require("./routes/referrals");
const ambassadorRoutes = require("./routes/ambassadors");
const receiptRoutes = require("./routes/receipts");
const adminPaymentRoutes = require("./routes/adminPayments");

const app = express();

// Baseline security headers (HSTS, X-Content-Type-Options, X-Frame-Options,
// etc.) for every response. CSP is off — this app serves only JSON, never
// HTML, so a content policy has nothing to constrain. CORP is relaxed to
// "cross-origin" — the actual origin allowlist is enforced by the CORS
// middleware below; helmet's default same-origin CORP would otherwise block
// the Frontend (a different origin) from reading these JSON responses.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Render (and most PaaS hosts) put the app behind one reverse-proxy hop, so
// req.ip / X-Forwarded-For only reflects the real client IP once Express is
// told to trust that hop. Without this, two things silently break in
// production: every IP-keyed rate limiter (routes/auth.js) sees the proxy's
// own IP for every request (one shared bucket for all visitors) — and worse,
// express-rate-limit v7 actively refuses to run at all when it detects an
// X-Forwarded-For header arriving while trust proxy is still at its default
// `false`, throwing on every request through a limited route. `1` trusts
// exactly the nearest hop, not an attacker-supplied chain of proxies.
app.set("trust proxy", 1);

const allowedOrigins = getAllowedOrigins();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS: " + origin));
    }
  },
}));

// Razorpay webhook needs the raw body to verify the signature, so it gets
// its own raw-body parser BEFORE the global json() middleware below.
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api", courseRoutes);
app.use("/api", applicationRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api", contactRoutes);
app.use("/api", lectureRoutes);
app.use("/api", enrollmentRoutes);
app.use("/api", videoRoutes);
app.use("/api", adminUserRoutes);
app.use("/api", serviceRoutes);
app.use("/api", receiptRoutes);
app.use("/api", adminPaymentRoutes);
app.use("/api", referralRoutes);
app.use("/api", ambassadorRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  // Routes handle their own known error cases directly (res.status(400)...)
  // — anything reaching this generic handler is an unexpected failure, so
  // its raw message (which can carry library/DB internals, file paths, even
  // a connection string in some driver errors) only goes to the client in
  // dev, where it's a debugging aid. Production gets a message that reveals
  // nothing; the real detail is still in the server log above.
  const exposeDetail = process.env.NODE_ENV !== "production";
  res.status(err.status || 500).json({ ok: false, error: exposeDetail ? (err.message || "Server error") : "Server error" });
});

module.exports = app;
