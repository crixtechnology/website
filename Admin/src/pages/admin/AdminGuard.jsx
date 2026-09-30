import { useContext, useState } from "react";
import { UserContext, IDLE_TIMEOUT_MINUTES } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";

// Wraps every route: shows the admin login form until an admin is signed in.
// (Non-admin accounts are refused by services/api.js login before any session is kept.)
export default function AdminGuard({ children }) {
  const { isLoggedIn, isAdmin, login, sessionExpired } = useContext(UserContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const showLogin = !(isLoggedIn && isAdmin);
  usePageMeta(showLogin ? { title: "Admin Login | Crix Technology" } : {});

  if (!showLogin) return children;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    setLoading(true);
    setError("");
    const res = await login(email.trim(), password);
    setLoading(false);
    if (!res.ok) setError(res.error || "Login failed.");
  };

  return (
    <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
      <div className="wrap" style={{ maxWidth: 440 }}>
        <span className="eyebrow">Admin</span>
        <h1 className="title-lg" style={{ margin: "14px 0 16px" }}>Log in to continue</h1>
        {sessionExpired && (
          <p className="form-note" style={{ marginTop: 0 }}>
            You were signed out after {IDLE_TIMEOUT_MINUTES} minutes of inactivity. Please log in again.
          </p>
        )}
        <form onSubmit={onSubmit} noValidate>
          <div className="field"><label htmlFor="admin-email">Email</label>
            <input id="admin-email" type="email" autoComplete="username" value={email} disabled={loading}
              onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" autoComplete="current-password" value={password} disabled={loading}
              onChange={(e) => setPassword(e.target.value)} /></div>
          <button className="btn btn-solid" type="submit" disabled={loading}>{loading ? "Logging in..." : "Log in"}</button>
        </form>
        {error && <p className="form-note" role="alert">{error}</p>}
      </div>
    </section>
  );
}
