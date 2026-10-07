import { useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminToken, adminGetUsers, adminGetUser } from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import UserPicker from "../../components/UserPicker.jsx";
import WalletPanel from "../../components/WalletPanel.jsx";

// Pick a student, then add credit to (or take credit from) their wallet. The
// same panel lives on each student's page in Admin → Users.
export default function AdminWallet() {
  usePageMeta({ title: "Wallet | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const pickedId = useRef(null); // the student currently chosen, to drop a slow reply for a previous one

  useEffect(() => {
    // Admins have no wallet, so only student accounts are offered.
    adminGetUsers().then((res) => {
      setStudentsLoading(false);
      if (res.ok) setStudents((res.users || []).filter((u) => u.role !== "admin"));
      else {
        setError(res.error || "Could not load students.");
        if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
      }
    });
  }, [logout, navigate]);

  const pick = async (user) => {
    pickedId.current = user ? user._id : null;
    setPicked(user);
    setWallet(null);
    setError("");
    if (!user) return;
    setLoading(true);
    const res = await adminGetUser(user._id);
    if (pickedId.current !== user._id) return;
    setLoading(false);
    if (res.ok && res.wallet) setWallet(res.wallet);
    else setError(res.error || "Could not load this wallet.");
  };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap" style={{ maxWidth: 720 }}>
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Wallet</h1>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>
        <p style={{ color: "var(--muted)", margin: "0 0 24px", lineHeight: 1.7 }}>
          Give a student credit to spend on courses and internships, or take some back. They see every change, with your note, in their profile.
        </p>

        <div className="admin-form">
          <div className="field"><label>Student</label>
            <UserPicker users={students} loading={studentsLoading} value={picked} onChange={pick} /></div>
          {error && <p className="form-error">{error}</p>}
          {picked && loading && <p style={{ color: "var(--muted)" }}>Loading...</p>}
          {picked && wallet && (
            <WalletPanel key={picked._id} userId={picked._id} userName={picked.name} wallet={wallet} onChange={setWallet} />
          )}
        </div>
      </div>
    </section>
  );
}
