// Single-device-login policy shared by routes/auth.js (blocks a new login
// while another device's session is still live) and middleware/
// requireAuth.js (expires a session server-side once it's been idle this
// long, and throttles how often activeSessionLastSeenAt gets bumped).
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000; // at most once a minute

// True if `user` (a student, with activeSessionId/activeSessionLastSeenAt
// selected) currently has a session that's still within the idle window —
// i.e. a second login attempt should be blocked / this token is still good.
function hasLiveSession(user) {
  if (!user || user.role !== "student" || !user.activeSessionId || !user.activeSessionLastSeenAt) return false;
  return Date.now() - user.activeSessionLastSeenAt.getTime() < IDLE_TIMEOUT_MS;
}

module.exports = { IDLE_TIMEOUT_MS, ACTIVITY_WRITE_THROTTLE_MS, hasLiveSession };
