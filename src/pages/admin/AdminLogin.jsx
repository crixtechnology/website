import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin, getAdminToken } from "../../services/api.js";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  if (getAdminToken()) {
    navigate("/admin/courses", { replace: true });
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setStatus("Enter email and password.");
      return;
    }
    setLoading(true);
    setStatus("");
    const res = await adminLogin(email.trim(), password);
    setLoading(false);
    if (res.ok) {
      navigate("/admin/courses", { replace: true });
    } else {
      setStatus(res.error || "Login failed.");
    }
  };

  return (
    <section className="section" style={{ paddingTop: 160, minHeight: "70vh" }}>
      <div className="wrap" style={{ maxWidth: 420 }}>
        <span className="eyebrow">Admin</span>
        <h2 style={{ margin: "14px 0 24px" }}>Course admin login</h2>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@crixtechnology.com" autoComplete="username" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </div>
          <button className="btn btn-solid" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Logging in..." : "Log in"}
          </button>
          {status && <p className="form-note">{status}</p>}
        </form>
      </div>
    </section>
  );
}
