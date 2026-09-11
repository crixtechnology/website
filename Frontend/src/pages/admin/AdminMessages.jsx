import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminToken, adminGetContacts, adminUpdateContact, adminDeleteContact } from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { useDebouncedLoad } from "../../hooks/useDebouncedLoad.js";

// Every /contact form submission, persisted server-side (routes/contact.js)
// so it's readable here instead of only ever existing as an outgoing email.
export default function AdminMessages() {
  usePageMeta({ title: "Contact Messages | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const load = async (query) => {
    setLoading(true);
    const res = await adminGetContacts(query);
    setLoading(false);
    if (res.ok) { setContacts(res.contacts || []); setError(""); }
    else {
      setError(res.error || "Could not load messages.");
      if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
    }
  };

  // Fetches once on mount, then debounced as the search box changes.
  useDebouncedLoad(load, q);

  const toggleRead = async (c) => {
    const res = await adminUpdateContact(c._id, { status: c.status === "new" ? "read" : "new" });
    if (res.ok) load(q); else setError(res.error || "Could not update message.");
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete the message from "${c.name}"? This cannot be undone.`)) return;
    const res = await adminDeleteContact(c._id);
    if (res.ok) load(q); else setError(res.error || "Could not delete.");
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h2 style={{ margin: "14px 0 0" }}>Contact messages</h2>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <input
          className="admin-search"
          type="search"
          placeholder="Search by name, email or message..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : contacts.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>{q ? "No messages match that search." : "No messages yet."}</p>
        ) : (
          <div className="admin-list">
            {contacts.map((c) => (
              <div className="admin-row" key={c._id}>
                <div className="admin-row-main">
                  <b>{c.name} <span className={`admin-pill ${c.status}`}>{c.status}</span></b>
                  <span className="admin-row-meta">{c.email} {c.interest ? `· ${c.interest}` : ""} · {new Date(c.createdAt).toLocaleString("en-IN")}</span>
                </div>
                <div className="admin-row-main admin-row-message">
                  <p>{c.message}</p>
                </div>
                <div className="admin-row-actions">
                  <button className="btn btn-ghost" onClick={() => toggleRead(c)}>
                    Mark {c.status === "new" ? "read" : "unread"}
                  </button>
                  <button className="btn btn-ghost admin-danger" onClick={() => remove(c)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
