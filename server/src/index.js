require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");

const authRoutes = require("./routes/auth");
const courseRoutes = require("./routes/courses");
const applicationRoutes = require("./routes/applications");
const paymentRoutes = require("./routes/payments");
const contactRoutes = require("./routes/contact");

const app = express();

// CLIENT_ORIGIN can be a comma-separated list — e.g. localhost for the PC
// plus the machine's LAN IP so phones on the same WiFi can reach the API too.
const allowedOrigins = (process.env.CLIENT_ORIGIN || "*").split(",").map((o) => o.trim());
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

app.use("/api/admin", authRoutes);
app.use("/api", courseRoutes);
app.use("/api", applicationRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api", contactRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ ok: false, error: err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Crix Technology API listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });

module.exports = app;
