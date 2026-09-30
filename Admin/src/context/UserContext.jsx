import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import {
  getAdminToken, getStoredUser, adminLogout, logoutSession, setLastActivity, AUTH_CLEARED_EVENT,
  login as loginRequest, fetchMe,
} from "../services/api.js";
import { useIdleLogout, IDLE_TIMEOUT_MINUTES } from "../hooks/useIdleLogout.js";

export { IDLE_TIMEOUT_MINUTES };

export const UserContext = createContext({
  user: null,
  token: null,
  isLoggedIn: false,
  isAdmin: false,
  login: async () => ({ ok: false }),
  logout: () => {},
  sessionExpired: false,
});

// Session lives in sessionStorage (see services/api.js): per-tab, gone when the
// tab closes. Only admin accounts are ever kept (api.js login rejects the rest).
export function UserProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getAdminToken());
  // True after the idle timer signed the admin out, so the login screen can say why.
  const [sessionExpired, setSessionExpired] = useState(false);

  const login = useCallback(async (email, password) => {
    const res = await loginRequest(email, password);
    if (res.ok) { setUser(res.user); setToken(res.token); setSessionExpired(false); setLastActivity(); }
    return res;
  }, []);

  const logout = useCallback((opts) => {
    // Fired before adminLogout() clears the token: frees this account's
    // single-device-login slot on the server right away. Not awaited.
    logoutSession();
    adminLogout();
    setUser(null);
    setToken(null);
    if (opts && opts.expired) setSessionExpired(true);
  }, []);

  // Any 401 from the data layer drops the stored session — mirror it into state.
  useEffect(() => {
    const onCleared = () => { setUser(null); setToken(null); };
    window.addEventListener(AUTH_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(AUTH_CLEARED_EVENT, onCleared);
  }, []);

  // Re-validate a session restored from sessionStorage so a dead token is caught early.
  useEffect(() => {
    if (!getAdminToken()) return;
    fetchMe().then((res) => { if (res.ok && res.user) setUser(res.user); });
  }, []);

  useIdleLogout({
    active: !!user && !!token,
    onIdle: () => logout({ expired: true }),
    timeoutMs: IDLE_TIMEOUT_MINUTES * 60 * 1000,
  });

  const value = useMemo(
    () => ({
      user, token,
      isLoggedIn: !!user && !!token,
      isAdmin: user?.role === "admin",
      login, logout, sessionExpired,
    }),
    [user, token, login, logout, sessionExpired]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
