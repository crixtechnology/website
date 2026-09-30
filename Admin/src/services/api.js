// ============================================================
// ADMIN API LAYER
// The admin panel is deployed on its own (separate from the public site), so
// this only carries the calls the panel makes. Set REACT_APP_API_URL to the
// backend's /api URL (see .env.example). The backend's CLIENT_ORIGIN must list
// this panel's own address, or the browser blocks every request.
// ============================================================

const API = process.env.REACT_APP_API_URL || "";
// Lets pages show a loading state only when there is actually a backend to wait for.
export const hasBackend = !!API;

// One unified login for everyone (student or admin — role comes back in the
// user object / JWT payload). Same token key is used for every authFetch
// call below, admin or student.
const TOKEN_KEY = "crix_token";
const USER_KEY = "crix_user";
// Timestamp (ms) of the user's last interaction — read by useIdleLogout to
// auto-sign-out after a period of inactivity. Kept in the same per-tab
// storage as the session so it can't outlive it.
const LAST_ACTIVITY_KEY = "crix_last_activity";

// The login session lives in sessionStorage, not localStorage: it is
// per-tab and cleared automatically when the tab/window closes, so a shared
// or public computer doesn't keep someone signed in. `store` degrades to an
// in-memory shim if sessionStorage is unavailable (private mode, disabled
// storage) so nothing here ever throws.
const store = (() => {
  try {
    const s = window.sessionStorage;
    const probe = "__crix_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch (e) {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
  }
})();

// One-time move of any pre-existing session out of localStorage (where it
// used to live) into sessionStorage, so this change doesn't sign everyone
// out on deploy. Safe to leave in place; it no-ops once localStorage is clear.
(function migrateLegacyLocalStorageSession() {
  try {
    const legacyToken = window.localStorage.getItem(TOKEN_KEY);
    const legacyUser = window.localStorage.getItem(USER_KEY);
    if (legacyToken && !store.getItem(TOKEN_KEY)) store.setItem(TOKEN_KEY, legacyToken);
    if (legacyUser && !store.getItem(USER_KEY)) store.setItem(USER_KEY, legacyUser);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch (e) {
    /* localStorage blocked — nothing to migrate */
  }
})();

export function getAdminToken() {
  return store.getItem(TOKEN_KEY);
}
export function setAdminToken(token) {
  if (token) store.setItem(TOKEN_KEY, token);
  else store.removeItem(TOKEN_KEY);
}
export function getStoredUser() {
  try {
    const raw = store.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
export function setStoredUser(user) {
  if (user) store.setItem(USER_KEY, JSON.stringify(user));
  else store.removeItem(USER_KEY);
}

// ---- Inactivity tracking (see hooks/useIdleLogout.js) ----
export function getLastActivity() {
  const raw = store.getItem(LAST_ACTIVITY_KEY);
  const ts = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(ts) ? ts : null;
}
export function setLastActivity(ts = Date.now()) {
  store.setItem(LAST_ACTIVITY_KEY, String(ts));
}

// Event name the auth-data layer fires whenever the stored session is
// dropped (explicit logout, or a 401 from any authFetch below).
// UserContext listens for it so React state can't stay "logged in" after
// the token is already gone from storage.
export const AUTH_CLEARED_EVENT = "crix:auth-cleared";

export function adminLogout() {
  setAdminToken(null);
  setStoredUser(null);
  store.removeItem(LAST_ACTIVITY_KEY);
  try {
    window.dispatchEvent(new Event(AUTH_CLEARED_EVENT));
  } catch (e) {
    /* non-browser env — nothing listening anyway */
  }
}

async function authFetch(path, options = {}) {
  const token = getAdminToken();
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

// ---------- admin: the Apply / Inquire-to-enroll inbox ----------
export async function adminGetApplications(q, type) {
  try {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    const qs = params.toString();
    const res = await authFetch(`/admin/applications${qs ? `?${qs}` : ""}`);
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load applications" };
  }
}

export async function adminUpdateApplication(id, patch) {
  try {
    const res = await authFetch(`/admin/applications/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not update application" };
  }
}

export async function adminDeleteApplication(id) {
  try {
    const res = await authFetch(`/admin/applications/${id}`, { method: "DELETE" });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not delete application" };
  }
}

export async function login(email, password) {
  if (!API) return { ok: false, error: "Backend not configured yet." };
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.ok && data.token) { setAdminToken(data.token); setStoredUser(data.user); }
    return data;
  } catch (e) {
    return { ok: false, error: "Could not log in right now." };
  }
}

// Tells the server to free up this account's single-device-login slot
// immediately, instead of leaving it to expire on its own after 30 minutes
// idle (Backend/src/utils/sessionPolicy.js). Best-effort: called right
// before the local session is torn down either way (see UserContext's
// logout), so a network hiccup here never blocks logging out on this
// device — it just means the slot takes the usual idle timeout to free up
// instead of freeing immediately.
export async function logoutSession() {
  try {
    await authFetch("/auth/logout", { method: "POST" });
  } catch (e) {
    /* best-effort — local logout proceeds regardless */
  }
}

export async function fetchMe() {
  try {
    const res = await authFetch("/auth/me");
    if (res.status === 401) { adminLogout(); return { ok: false }; }
    const data = await res.json();
    if (data.ok && data.user) setStoredUser(data.user);
    return data;
  } catch (e) {
    return { ok: false };
  }
}

// ---------- Admin: course videos ----------
export async function adminGetVideos(courseId) {
  try {
    const qs = courseId ? `?courseId=${courseId}` : "";
    const res = await authFetch(`/admin/videos${qs}`);
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load videos" };
  }
}

export async function adminUpdateVideo(id, patch) {
  try {
    const res = await authFetch(`/admin/videos/${id}`, { method: "PUT", body: JSON.stringify(patch) });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not update video" };
  }
}

// Default: take the video off the site only (the file stays in Backblaze).
// { deleteFile: true } also permanently deletes the file from Backblaze.
export async function adminDeleteVideo(id, { deleteFile = false } = {}) {
  try {
    const res = await authFetch(`/admin/videos/${id}${deleteFile ? "?deleteFile=true" : ""}`, { method: "DELETE" });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not delete video" };
  }
}

// ---------- Admin: courses & internships CRUD ----------
export async function adminGetCourses(type) {
  try {
    const res = await authFetch(`/admin/courses${type ? `?type=${type}` : ""}`);
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load courses" };
  }
}

export async function adminCreateCourse(course) {
  try {
    const res = await authFetch("/admin/courses", { method: "POST", body: JSON.stringify(course) });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not create course" };
  }
}

export async function adminUpdateCourse(id, course) {
  try {
    const res = await authFetch(`/admin/courses/${id}`, { method: "PUT", body: JSON.stringify(course) });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not update course" };
  }
}

export async function adminDeleteCourse(id) {
  try {
    const res = await authFetch(`/admin/courses/${id}`, { method: "DELETE" });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not delete course" };
  }
}

// ---------- Admin: lectures (schedule + recording links) CRUD ----------
export async function adminGetLectures(courseId) {
  try {
    const qs = courseId ? `?courseId=${courseId}` : "";
    const res = await authFetch(`/admin/lectures${qs}`);
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load lectures" };
  }
}

export async function adminCreateLecture(lecture) {
  try {
    const res = await authFetch("/admin/lectures", { method: "POST", body: JSON.stringify(lecture) });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not create lecture" };
  }
}

export async function adminUpdateLecture(id, lecture) {
  try {
    const res = await authFetch(`/admin/lectures/${id}`, { method: "PUT", body: JSON.stringify(lecture) });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not update lecture" };
  }
}

export async function adminDeleteLecture(id) {
  try {
    const res = await authFetch(`/admin/lectures/${id}`, { method: "DELETE" });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not delete lecture" };
  }
}

export async function adminGetReferrals(q, status) {
  try {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const res = await authFetch(`/admin/referrals${params.toString() ? `?${params}` : ""}`);
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load referrals" };
  }
}

export async function adminGetReferralSettings() {
  try {
    const res = await authFetch("/admin/referral-settings");
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load the referral rules" };
  }
}

export async function adminUpdateReferralSettings(settings) {
  try {
    const res = await authFetch("/admin/referral-settings", { method: "PUT", body: JSON.stringify(settings) });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not save the referral rules" };
  }
}

// ---------- Admin: offer / discount codes ----------
export const adminGetCoupons = () => ambassadorCall("/admin/coupons", {}, "Could not load the offer codes");
export const adminCreateCoupon = (payload) => ambassadorCall("/admin/coupons", { method: "POST", body: JSON.stringify(payload) }, "Could not create the offer code");
export const adminUpdateCoupon = (id, patch) => ambassadorCall(`/admin/coupons/${id}`, { method: "PUT", body: JSON.stringify(patch) }, "Could not save the offer code");
export const adminDeleteCoupon = (id) => ambassadorCall(`/admin/coupons/${id}`, { method: "DELETE" }, "Could not delete the offer code");

// ---------- Campus ambassador programme ----------
// Small helper: every call below is "authFetch, drop the session on a 401, read
// the JSON, turn a failure into { ok:false, error }".
async function ambassadorCall(path, options, fallbackError) {
  try {
    const res = await authFetch(path, options);
    if (res.status === 401) adminLogout();
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || fallbackError };
    return data;
  } catch (e) {
    return { ok: false, error: fallbackError };
  }
}

export function adminGetAmbassadors(q, status) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  return ambassadorCall(`/admin/ambassadors${params.toString() ? `?${params}` : ""}`, {}, "Could not load ambassadors");
}
export const adminGetAmbassador = (id) => ambassadorCall(`/admin/ambassadors/${id}`, {}, "Could not load this ambassador");
export const adminUpdateAmbassador = (id, fields) => ambassadorCall(`/admin/ambassadors/${id}`, { method: "PATCH", body: JSON.stringify(fields) }, "Could not update this ambassador");
export const adminVoidEarning = (id, voidIt) => ambassadorCall(`/admin/ambassador-earnings/${id}`, { method: "PATCH", body: JSON.stringify({ void: voidIt }) }, "Could not update this commission");
export const adminGetAmbassadorPayouts = (status) => ambassadorCall(`/admin/ambassador-payouts${status ? `?status=${status}` : ""}`, {}, "Could not load payouts");
export const adminUpdateAmbassadorPayout = (id, body) => ambassadorCall(`/admin/ambassador-payouts/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "Could not update this payout");
export const adminGetAmbassadorSettings = () => ambassadorCall("/admin/ambassador-settings", {}, "Could not load the programme rules");
export const adminUpdateAmbassadorSettings = (settings) => ambassadorCall("/admin/ambassador-settings", { method: "PUT", body: JSON.stringify(settings) }, "Could not save the programme rules");

// ---------- Admin: students/subscriptions (full CRUD) ----------
// A "subscription" is an Enrollment — grant gives a user access to a course
// with no payment involved (same record a real purchase creates), edit
// changes its start/end (validity) dates, remove revokes access immediately.
export async function adminGetEnrollments(q) {
  try {
    const res = await authFetch(`/admin/enrollments${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load subscriptions" };
  }
}

export async function adminGrantSubscription(payload) {
  try {
    const res = await authFetch("/admin/enrollments", { method: "POST", body: JSON.stringify(payload) });
    if (res.status === 401) adminLogout();
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Could not grant subscription" };
    return data;
  } catch (e) {
    return { ok: false, error: "Could not grant subscription" };
  }
}

export async function adminUpdateSubscription(id, patch) {
  try {
    const res = await authFetch(`/admin/enrollments/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (res.status === 401) adminLogout();
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Could not update subscription" };
    return data;
  } catch (e) {
    return { ok: false, error: "Could not update subscription" };
  }
}

export async function adminRemoveSubscription(id) {
  try {
    const res = await authFetch(`/admin/enrollments/${id}`, { method: "DELETE" });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not remove subscription" };
  }
}

// ---------- Admin: users (search + full CRUD) ----------
export async function adminGetUsers(q) {
  try {
    const res = await authFetch(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load users" };
  }
}

export async function adminGetUser(id) {
  try {
    const res = await authFetch(`/admin/users/${id}`);
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load user" };
  }
}

export async function adminUpdateUser(id, patch) {
  try {
    const res = await authFetch(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (res.status === 401) adminLogout();
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Could not update user" };
    return data;
  } catch (e) {
    return { ok: false, error: "Could not update user" };
  }
}

// Gives a student a new temporary password (returned once) and asks them to
// choose their own at the next login — for when the reset email can't arrive.
export async function adminResetUserPassword(id) {
  try {
    const res = await authFetch(`/admin/users/${id}/reset-password`, { method: "POST" });
    if (res.status === 401) adminLogout();
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Could not reset the password" };
    return data;
  } catch (e) {
    return { ok: false, error: "Could not reset the password" };
  }
}

export async function adminDeleteUser(id) {
  try {
    const res = await authFetch(`/admin/users/${id}`, { method: "DELETE" });
    if (res.status === 401) adminLogout();
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Could not delete user" };
    return data;
  } catch (e) {
    return { ok: false, error: "Could not delete user" };
  }
}

// ---------- Admin: contact form inbox ----------
export async function adminGetContacts(q) {
  try {
    const res = await authFetch(`/admin/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load messages" };
  }
}

export async function adminUpdateContact(id, patch) {
  try {
    const res = await authFetch(`/admin/contacts/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not update message" };
  }
}

export async function adminDeleteContact(id) {
  try {
    const res = await authFetch(`/admin/contacts/${id}`, { method: "DELETE" });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not delete message" };
  }
}

export async function adminGetServices(q) {
  try {
    const res = await authFetch(`/admin/services${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load services" };
  }
}

export async function adminCreateService(service) {
  try {
    const res = await authFetch("/admin/services", { method: "POST", body: JSON.stringify(service) });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not create service" };
  }
}

export async function adminUpdateService(id, service) {
  try {
    const res = await authFetch(`/admin/services/${id}`, { method: "PUT", body: JSON.stringify(service) });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not update service" };
  }
}

export async function adminDeleteService(id) {
  try {
    const res = await authFetch(`/admin/services/${id}`, { method: "DELETE" });
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not delete service" };
  }
}

// ---------- Payment requests (admin asks a student to pay for a course/internship) ----------
// Separate from the normal checkout above: its own order + verify endpoints.
async function jsonOr(res, fallback) {
  if (res.status === 401) adminLogout();
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error || fallback };
  return data;
}

export async function adminGetPaymentRequests({ q, status } = {}) {
  try {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const qs = params.toString();
    return await jsonOr(await authFetch(`/admin/payment-requests${qs ? `?${qs}` : ""}`), "Could not load payment requests");
  } catch (e) {
    return { ok: false, error: "Could not load payment requests" };
  }
}

export async function adminCreatePaymentRequest(payload) {
  try {
    return await jsonOr(await authFetch("/admin/payment-requests", { method: "POST", body: JSON.stringify(payload) }), "Could not send the request");
  } catch (e) {
    return { ok: false, error: "Could not send the request" };
  }
}

export async function adminCancelPaymentRequest(id) {
  try {
    return await jsonOr(await authFetch(`/admin/payment-requests/${id}/cancel`, { method: "POST" }), "Could not cancel the request");
  } catch (e) {
    return { ok: false, error: "Could not cancel the request" };
  }
}
