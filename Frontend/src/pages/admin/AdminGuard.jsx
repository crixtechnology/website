import { useContext, useState } from "react";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";

// Wraps every /admin/* route — there's no dedicated /admin/login page
// anymore, admin logs in through the same popup (AuthModal) students use.
// A non-admin account that logs in here gets logged straight back out
// with an error, rather than silently landing in a logged-in-but-blocked
// state.
export default function AdminGuard({ children }) {
  const { isLoggedIn, isAdmin, logout, openAuthModal } = useContext(UserContext);
  const [error, setError] = useState("");
  const showPrompt = !(isLoggedIn && isAdmin);
  // No-op (via the hook's own guard) once logged in — the wrapped page sets
  // its own title then, this shouldn't clobber it.
  usePageMeta(showPrompt ? { title: "Admin Login | Crix Technology" } : {});

  if (!showPrompt) return children;

  const onLoginClick = () => {
    setError("");
    openAuthModal("login", (loggedInUser) => {
      if (loggedInUser?.role !== "admin") {
        logout();
        setError("That account doesn't have admin access. Log in with an admin account instead.");
      }
    });
  };

  return (
    <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
      <div className="wrap" style={{ maxWidth: 480 }}>
        <span className="eyebrow">Admin</span>
        <h1 className="title-lg" style={{ margin: "14px 0 16px" }}>Log in to continue</h1>
        <button className="btn btn-solid" onClick={onLoginClick}>Log in</button>
        {error && <p className="form-note">{error}</p>}
      </div>
    </section>
  );
}
