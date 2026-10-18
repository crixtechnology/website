// Settings that must never reach a real server with their example values.
// JWT_SECRET signs every login token (admin ones included): if it is short or
// still the placeholder from .env.example, anyone who guesses it can mint an
// admin token. In production the server refuses to start; in development it
// only warns, so a fresh checkout still runs.
const PLACEHOLDER = /change_this|changeme|placeholder|your_|example|^secret$|^password$/i;
const MIN_SECRET_LENGTH = 32;

// Returns the list of problems (empty when all is well).
function secretProblems(env = process.env) {
  const problems = [];
  const jwt = env.JWT_SECRET || "";
  if (!jwt) problems.push("JWT_SECRET is not set.");
  else if (jwt.length < MIN_SECRET_LENGTH) problems.push(`JWT_SECRET is shorter than ${MIN_SECRET_LENGTH} characters.`);
  else if (PLACEHOLDER.test(jwt)) problems.push("JWT_SECRET is still the example value from .env.example.");
  if (env.NODE_ENV === "production" && /^(1|true|yes)$/i.test(env.MAIL_DEV_LOG || "")) {
    problems.push("MAIL_DEV_LOG is on — it prints one-time login codes to the server log.");
  }
  return problems;
}

// Exits the process in production when anything is wrong; warns otherwise.
function checkSecretsOrExit(env = process.env) {
  const problems = secretProblems(env);
  if (problems.length === 0) return;
  const help = "Generate a secret with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"";
  if (env.NODE_ENV === "production") {
    console.error(`Refusing to start:\n  - ${problems.join("\n  - ")}\n${help}`);
    process.exit(1);
  }
  console.warn(`[security] ${problems.join(" ")} Fine for local development only. ${help}`);
}

module.exports = { secretProblems, checkSecretsOrExit };
