// Actual process entry point — connects to the real database and starts
// listening. Kept separate from app.js (the configured Express app itself)
// so tests can import that directly without either side effect.
const app = require("./app");
const { connectDB } = require("./db");

const PORT = process.env.PORT || 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A few quick tries, so a database that is a moment late (waking up, mid-restart)
// doesn't stop the server from starting.
async function connectWithRetry(attempts = 4, delayMs = 3000) {
  for (let i = 1; ; i++) {
    try {
      await connectDB();
      return true;
    } catch (err) {
      console.error(`MySQL not reachable (attempt ${i}/${attempts}): ${err.message.split("\n").filter(Boolean).pop()}`);
      if (i >= attempts) return false;
      await sleep(delayMs);
    }
  }
}

function listen() {
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
}

// The server starts even if the database can't be reached. It used to exit, so
// while the database was down the whole API vanished (the host answered every
// request with a slow gateway timeout). Started anyway, each request that needs
// the database gets a fast, clear 503 (see app.js) and starts working again by
// itself the moment the database returns — Prisma reconnects on the next query.
connectWithRetry().then((connected) => {
  if (!connected) console.error("Starting anyway: requests that need the database will answer 503 until it is back.");
  listen();
});
