import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import {
  getAdminToken, getStoredUser, adminLogout, logoutSession, setLastActivity, AUTH_CLEARED_EVENT,
  login as loginRequest, signup as signupRequest, googleAuth as googleAuthRequest,
  fetchMe, updateMe,
} from "../services/api.js";
import { useIdleLogout } from "../hooks/useIdleLogout.js";

// The details a course purchase needs on file (see BuyModal). Missing any of
// these sends the user to /profile to fill them in first.
export function isProfileComplete(user) {
  if (!user) return false;
  const has = (v) => !!(v && String(v).trim());
  return has(user.name) && has(user.email) && has(user.phone);
}

export const UserContext = createContext({
  user: null,
  token: null,
  isLoggedIn: false,
  isAdmin: false,
  profileComplete: false,
  login: async () => ({ ok: false }),
  signup: async () => ({ ok: false }),
  loginWithGoogle: async () => ({ ok: false }),
  updateProfile: async () => ({ ok: false }),
  logout: () => {},
  sessionExpired: false,
  clearSessionExpired: () => {},
  authModal: null,
  openAuthModal: () => {},
  closeAuthModal: () => {},
});

// Session is backed by sessionStorage (see services/api.js) — one token,
// one user object, shared by both roles, and cleared when the tab closes.
export function UserProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getAdminToken());
  // Set true when the idle watcher signs the user out, so the login popup
  // can explain why they need to log in again. Cleared on the next auth
  // attempt / when the popup closes.
  const [sessionExpired, setSessionExpired] = useState(false);
  // Login/signup happen in a popup (AuthModal, rendered once in App.jsx),
  // not dedicated pages — this is the shared open/close state for it.
  // { mode: "login" | "signup", onSuccess?: (user) => void } | null
  const [authModal, setAuthModal] = useState(null);

  const login = useCallback(async (email, password) => {
    const res = await loginRequest(email, password);
    if (res.ok) { setUser(res.user); setToken(res.token); setSessionExpired(false); setLastActivity(); }
    return res;
  }, []);

  const signup = useCallback(async (form) => {
    const res = await signupRequest(form);
    if (res.ok) { setUser(res.user); setToken(res.token); setSessionExpired(false); setLastActivity(); }
    return res;
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    const res = await googleAuthRequest(credential);
    if (res.ok) { setUser(res.user); setToken(res.token); setSessionExpired(false); setLastActivity(); }
    return res;
  }, []);

  const logout = useCallback((opts) => {
    // Best-effort, and deliberately fired before adminLogout() clears the
    // token below — frees this account's single-device-login slot
    // immediately (see Backend's sessionPolicy) instead of leaving it to
    // expire on its own after 30 minutes idle. Not awaited: logging out
    // locally must never wait on the network.
    logoutSession();
    adminLogout();
    setUser(null);
    setToken(null);
    if (opts && opts.expired) setSessionExpired(true);
  }, []);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const updateProfile = useCallback(async (partial) => {
    const res = await updateMe(partial);
    if (res.ok && res.user) setUser(res.user);
    return res;
  }, []);

  // The data layer clears the stored session on any 401 (see authFetch in
  // services/api.js). Mirror that into React state so the UI can't keep
  // showing a logged-in shell after the token is already gone.
  useEffect(() => {
    const onCleared = () => { setUser(null); setToken(null); };
    window.addEventListener(AUTH_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(AUTH_CLEARED_EVENT, onCleared);
  }, []);

  // On load, re-fetch the profile from the server so a session restored from
  // sessionStorage picks up changes made elsewhere (e.g. a phone number
  // added on another device) — and so an invalid token is caught early.
  useEffect(() => {
    if (!getAdminToken()) return;
    fetchMe().then((res) => { if (res.ok && res.user) setUser(res.user); });
  }, []);

  // Sign out after 30 minutes with no interaction anywhere on the site —
  // matches Backend's sessionPolicy.IDLE_TIMEOUT_MS, which is what actually
  // frees this account's single-device-login slot server-side; keeping
  // both at the same duration means this client-side timer is normally what
  // the user sees kick in, with the server-side one purely a backstop for
  // when this device's own JS never got the chance to run.
  useIdleLogout({
    active: !!user && !!token,
    onIdle: () => logout({ expired: true }),
    timeoutMs: 30 * 60 * 1000,
  });

  const openAuthModal = useCallback((mode = "login", onSuccess) => {
    setAuthModal({ mode, onSuccess });
  }, []);
  const closeAuthModal = useCallback(() => {
    setAuthModal(null);
    setSessionExpired(false);
  }, []);

  const value = useMemo(
    () => ({
      user, token,
      isLoggedIn: !!user && !!token,
      isAdmin: user?.role === "admin",
      profileComplete: isProfileComplete(user),
      login, signup, loginWithGoogle, updateProfile, logout,
      sessionExpired, clearSessionExpired,
      authModal, openAuthModal, closeAuthModal,
    }),
    [user, token, login, signup, loginWithGoogle, updateProfile, logout, sessionExpired, clearSessionExpired, authModal, openAuthModal, closeAuthModal]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
