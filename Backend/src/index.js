// Actual process entry point — connects to the real database and starts
// listening. Kept separate from app.js (the configured Express app itself)
// so tests can import that directly without either side effect.
const app = require("./app");
const { connectDB } = require("./db");

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    const server = app.listen(PORT, () => console.log(`Crix Technology API listening on port ${PORT}`));
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `Port ${PORT} is already in use — another backend instance is probably still running.\n` +
          `Stop it first, or start this one with a different PORT (e.g. PORT=5001 npm run dev).`
        );
        process.exit(1);
      }
      throw err;
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
