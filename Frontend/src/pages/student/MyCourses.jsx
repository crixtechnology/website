import { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserContext } from "../../context/UserContext.jsx";
import { getMyEnrollments, getMyReceipts, getReceipt } from "../../services/api.js";
import { UpgradeModal } from "../../components/ui.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { downloadReceiptPdf } from "../../utils/receiptPdf.js";
import { tierLabel } from "../../utils/tiers.js";

export default function MyCourses() {
  usePageMeta({ title: "My Courses | Crix Technology" });
  const { isLoggedIn, user, logout, openAuthModal } = useContext(UserContext);
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  // Per-enrollment id -> "loading" | "error", while its receipt PDF is
  // being fetched/built — lets the clicked button show its own state
  // without a single shared flag disabling every row's button at once.
  const [receiptState, setReceiptState] = useState({});

  // Every receipt of this student's — the original purchase of a course plus
  // one per plan upgrade (those carry `fromTier` and the course's id).
  const [receipts, setReceipts] = useState([]);
  const [upgrade, setUpgrade] = useState(null); // { item } | null — the plan-upgrade dialog

  const load = () => {
    getMyEnrollments().then((res) => {
      setLoading(false);
      if (res.ok) setEnrollments(res.enrollments || []);
    });
    getMyReceipts().then((res) => {
      if (res.ok) setReceipts(res.receipts || []);
    });
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    load();
  }, [isLoggedIn]);

  // An upgrade receipt is already complete in the list response, so it goes
  // straight to the PDF builder — no second fetch like the original's.
  async function handleDownloadUpgradeReceipt(receipt) {
    const key = `up-${receipt.paymentId}`;
    setReceiptState((s) => ({ ...s, [key]: "loading" }));
    try {
      await downloadReceiptPdf(receipt);
      setReceiptState((s) => { const next = { ...s }; delete next[key]; return next; });
    } catch (e) {
      setReceiptState((s) => ({ ...s, [key]: "error" }));
    }
  }

  async function handleDownloadReceipt(enrollment) {
    const id = enrollment._id;
    setReceiptState((s) => ({ ...s, [id]: "loading" }));
    const res = await getReceipt(enrollment.payment);
    if (!res.ok) {
      setReceiptState((s) => ({ ...s, [id]: "error" }));
      return;
    }
    await downloadReceiptPdf(res.receipt);
    setReceiptState((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  }

  // No dedicated /login page anymore — log in happens in the popup, right
  // here on this page, so a direct link to /dashboard while logged out
  // still lands somewhere sensible instead of a blank screen.
  if (!isLoggedIn) {
    return (
      <section className="section" style={{ paddingTop: 140, minHeight: "60vh" }}>
        <div className="wrap" style={{ maxWidth: 480 }}>
          <span className="eyebrow">My learning</span>
          <h1 className="title-lg" style={{ margin: "14px 0 16px" }}>Log in to see your courses</h1>
          <button className="btn btn-solid" onClick={() => openAuthModal("login")}>Log in</button>
        </div>
      </section>
    );
  }

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">My learning</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Welcome, {user?.name}</h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link className="btn btn-ghost" to="/profile">Edit profile</Link>
            <button className="btn btn-ghost" onClick={() => { logout(); navigate("/"); }}>Log out</button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : enrollments.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            You haven't purchased a course yet. <Link to="/programs#courses">Browse courses →</Link>
          </p>
        ) : (
          <div className="admin-list">
            {enrollments.map((en) => (
              <div className="admin-row" key={en._id}>
                <div className="admin-row-main">
                  <b>{en.course?.title || "Course"} {en.tier && <span className="plan-pill">{tierLabel(en.tier)}</span>} {en.expired && <span className="admin-pill expired">expired</span>}</b>
                  <span className="admin-row-meta">Purchased {new Date(en.createdAt).toLocaleDateString("en-IN")}</span>
                </div>
                <div className="admin-row-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {en.expired ? (
                    // The server 403s /learn/:slug once access has lapsed
                    // (see requireEnrollment.js) — show that up front instead
                    // of a "Go to course" link that would just dead-end.
                    <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>
                      Access has expired — contact us to renew.
                    </span>
                  ) : (
                    en.course?.slug && (
                      <Link className="btn btn-solid" to={`/learn/${en.course.slug}`}>Go to course →</Link>
                    )
                  )}
                  {/* Only real purchases carry a `payment` ref — an
                      admin-granted subscription has none, so no receipt
                      exists to download for it. */}
                  {en.payment && (
                    <button
                      className="btn btn-ghost"
                      disabled={receiptState[en._id] === "loading"}
                      onClick={() => handleDownloadReceipt(en)}
                    >
                      {receiptState[en._id] === "loading" ? "Preparing…" : "Download Receipt"}
                    </button>
                  )}
                  {receiptState[en._id] === "error" && (
                    <span style={{ color: "var(--danger)", fontSize: ".8rem" }}>Could not load receipt</span>
                  )}
                  {receipts
                    .filter((r) => r.fromTier && en.course && r.courseId === en.course._id)
                    .map((r) => (
                      <button
                        key={r.paymentId}
                        className="btn btn-ghost"
                        disabled={receiptState[`up-${r.paymentId}`] === "loading"}
                        onClick={() => handleDownloadUpgradeReceipt(r)}
                        title={`Receipt for the upgrade from ${tierLabel(r.fromTier)} to ${tierLabel(r.tier)}`}
                      >
                        {receiptState[`up-${r.paymentId}`] === "loading" ? "Preparing…" : `Upgrade Receipt (${tierLabel(r.tier)})`}
                      </button>
                    ))}
                  {/* Only a plan bought on the site can be upgraded, and only
                      while access is live and there's a higher plan to go to
                      — the dialog itself tells them if none is on offer. */}
                  {en.tier && en.tier !== "pro" && !en.expired && en.course && (
                    <button className="btn btn-ghost" onClick={() => setUpgrade({ item: en.course })}>Upgrade plan</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <UpgradeModal data={upgrade} onClose={() => setUpgrade(null)} onDone={load} />
    </section>
  );
}
