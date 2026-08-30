// ============================================================
// BACKEND-READY API LAYER
// REACT_APP_API_URL .env mein set karo (root .env.example dekho) taaki
// ye sab real backend (server/) ko hit kare. Jab tak set nahi hai,
// contact form WhatsApp pe fallback karta hai aur courses/admin calls
// gracefully "backend not configured" bolte hain.
// ============================================================
import { site } from "../data/content.js";

const API = process.env.REACT_APP_API_URL || "";
const ADMIN_TOKEN_KEY = "crix_admin_token";

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}
export function setAdminToken(token) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}
export function adminLogout() {
  setAdminToken(null);
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
      if (!res.ok) throw new Error("Server error");
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

// ---------- Courses (public) ----------
export async function getCourses() {
  if (!API) return { ok: false, courses: [] };
  try {
    const res = await fetch(`${API}/courses`);
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
export async function submitApplication(payload) {
  if (!API) return { ok: false, error: "Backend not configured yet." };
  try {
    const res = await fetch(`${API}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Could not submit" };
    return data;
  } catch (e) {
    return { ok: false, error: "Could not submit right now." };
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

// ---------- Admin auth ----------
export async function adminLogin(email, password) {
  if (!API) return { ok: false, error: "Backend not configured yet." };
  try {
    const res = await fetch(`${API}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.ok && data.token) setAdminToken(data.token);
    return data;
  } catch (e) {
    return { ok: false, error: "Could not log in right now." };
  }
}

// ---------- Admin: courses CRUD ----------
export async function adminGetCourses() {
  try {
    const res = await authFetch("/admin/courses");
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
