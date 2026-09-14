// ============================================================
// BACKEND-READY API LAYER
// REACT_APP_API_URL .env mein set karo (root .env.example dekho) taaki
// ye sab real backend (server/) ko hit kare. Jab tak set nahi hai,
// contact form WhatsApp pe fallback karta hai aur courses/admin calls
// gracefully "backend not configured" bolte hain.
// ============================================================
import { site } from "../data/content.js";

const API = process.env.REACT_APP_API_URL || "";

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

export async function submitContact(form) {
  try {
    if (API) {
      const res = await fetch(`${API}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || "Could not send right now." };
      return { ok: true };
    }
    const text = encodeURIComponent(
      `Hi Crix Technology!\nName: ${form.name}\nEmail: ${form.email}\nInterest: ${form.interest}\nMessage: ${form.message}`
    );
    window.open(`https://wa.me/${site.whatsapp}?text=${text}`, "_blank");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Could not send right now. Email us at " + site.email };
  }
}

// ---------- Courses & Internships (public) ----------
// type: "course" | "internship" | omit for both.
export async function getCourses(type) {
  if (!API) return { ok: false, courses: [] };
  try {
    const res = await fetch(`${API}/courses${type ? `?type=${type}` : ""}`);
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load courses", courses: [] };
  }
}

export async function getCourse(slug) {
  if (!API) return { ok: false, error: "Backend not configured yet." };
  try {
    const res = await fetch(`${API}/courses/${slug}`);
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load this course." };
  }
}

// ---------- Applications (internship or course) ----------
// courseSlug is only used for type "course" — lets the backend resolve and
// stamp the course onto the Application so a later payment can grant access.
// Sent through authFetch so a logged-in student's account gets attached too.
export async function submitApplication(payload) {
  if (!API) return { ok: false, error: "Backend not configured yet." };
  try {
    const res = await authFetch("/applications", { method: "POST", body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Could not submit" };
    return data;
  } catch (e) {
    return { ok: false, error: "Could not submit right now." };
  }
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

// ---------- Razorpay ----------
export async function createRazorpayOrder(applicationId, courseSlug) {
  if (!API) return { ok: false, error: "Backend not configured yet." };
  try {
    const res = await fetch(`${API}/payments/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, courseSlug }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Could not start payment" };
    return data;
  } catch (e) {
    return { ok: false, error: "Could not start payment right now." };
  }
}

// Called from Razorpay Checkout's success `handler` with the fields it hands
// back. The backend re-computes the signature and, if valid, marks the
// payment paid + grants the course enrolment — this is what unlocks the
// course on localhost (where the webhook can't reach us).
export async function verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!API) return { ok: false, error: "Backend not configured yet." };
  try {
    const res = await fetch(`${API}/payments/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ razorpay_order_id, razorpay_payment_id, razorpay_signature }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Could not confirm payment" };
    return data;
  } catch (e) {
    return { ok: false, error: "Could not confirm your payment right now." };
  }
}

// ---------- Auth (unified — students and admins both use these) ----------
export async function signup({ name, email, phone, password }) {
  if (!API) return { ok: false, error: "Backend not configured yet." };
  try {
    const res = await fetch(`${API}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, password }),
    });
    const data = await res.json();
    if (data.ok && data.token) { setAdminToken(data.token); setStoredUser(data.user); }
    return data;
  } catch (e) {
    return { ok: false, error: "Could not sign up right now." };
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

// credential is the ID token Google's Identity Services button hands back
// (see AuthModal in components/ui.jsx) — verified server-side.
export async function googleAuth(credential) {
  if (!API) return { ok: false, error: "Backend not configured yet." };
  try {
    const res = await fetch(`${API}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    const data = await res.json();
    if (data.ok && data.token) { setAdminToken(data.token); setStoredUser(data.user); }
    return data;
  } catch (e) {
    return { ok: false, error: "Could not sign in with Google right now." };
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

// Update your own profile (name + phone). On success the stored user is
// refreshed so the rest of the app sees the new details immediately.
export async function updateMe(partial) {
  try {
    const res = await authFetch("/auth/me", { method: "PATCH", body: JSON.stringify(partial) });
    if (res.status === 401) { adminLogout(); return { ok: false, error: "Your session expired. Please log in again." }; }
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Could not save your profile." };
    if (data.ok && data.user) setStoredUser(data.user);
    return data;
  } catch (e) {
    return { ok: false, error: "Could not save your profile right now." };
  }
}

// ---------- Student: my courses + learn page ----------
export async function getMyEnrollments() {
  try {
    const res = await authFetch("/me/enrollments");
    if (res.status === 401) adminLogout();
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load your courses" };
  }
}

export async function getLearnData(slug) {
  try {
    const res = await authFetch(`/learn/${slug}`);
    const data = await res.json();
    if (!res.ok) return { ok: false, status: res.status, error: data.error || "Could not load this course." };
    return data;
  } catch (e) {
    return { ok: false, error: "Could not load this course." };
  }
}

// ---------- Student: drip recorded videos ----------
// courseId is the Course _id (Learn.jsx has it from getLearnData().course._id).
export async function getCourseVideos(courseId) {
  try {
    const res = await authFetch(`/courses/${courseId}/videos`);
    if (res.status === 401) adminLogout();
    const data = await res.json();
    if (!res.ok) return { ok: false, status: res.status, error: data.error || "Could not load videos." };
    return data;
  } catch (e) {
    return { ok: false, error: "Could not load videos." };
  }
}

// Fetched fresh right before playback (and again if the token expires
// mid-lecture). Returns { url, expiresAt, durationSeconds }.
export async function getVideoPlayUrl(courseId, videoId) {
  try {
    const res = await authFetch(`/courses/${courseId}/videos/${videoId}/play-url`);
    if (res.status === 401) adminLogout();
    const data = await res.json();
    if (!res.ok) return { ok: false, status: res.status, error: data.error || "Could not start this video." };
    return data;
  } catch (e) {
    return { ok: false, error: "Could not start this video." };
  }
}

// ---------- Admin: drip video schedule ----------
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

export async function adminDeleteVideo(id) {
  try {
    const res = await authFetch(`/admin/videos/${id}`, { method: "DELETE" });
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

// ---------- Services (public + admin CRUD) ----------
export async function getServices() {
  if (!API) return { ok: false, services: [] };
  try {
    const res = await fetch(`${API}/services`);
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Could not load services", services: [] };
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
