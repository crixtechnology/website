// Shared by routes/auth.js and routes/password.js. A floor under how fast an
// unauthenticated auth endpoint can ever respond once past input-format
// validation — comfortably above the real cost of every branch it can take
// (bcrypt, a few DB writes), so response TIME can't reveal which branch ran
// (e.g. "this email has an account" vs "it doesn't"). Padding every branch to
// one floor closes that whole class of leak at once, instead of matching each
// branch's cost by hand.
const MIN_AUTH_RESPONSE_MS = 600;

// `startedAt` should be Date.now() from right where the real, potentially
// branch-dependent work begins — i.e. AFTER input-format validation, which
// fails identically no matter whether the target email exists.
async function respondNoEarlierThan(startedAt, send) {
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_AUTH_RESPONSE_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_AUTH_RESPONSE_MS - elapsed));
  }
  send();
}

module.exports = { respondNoEarlierThan, MIN_AUTH_RESPONSE_MS };
