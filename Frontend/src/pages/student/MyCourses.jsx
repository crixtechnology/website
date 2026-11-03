import { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { UserContext } from "../../context/UserContext.jsx";
import { getMyEnrollments, getMyReceipts, getReceipt } from "../../services/api.js";
import { UpgradeModal } from "../../components/ui.jsx";
import ReferralCard from "../../components/ReferralCard.jsx";
import PaymentRequests from "../../components/PaymentRequests.jsx";
import WalletCard from "../../components/WalletCard.jsx";
import { ApplyTab, ApplicationsTab, NotificationsTab, useNotifications } from "../../components/CareersDashboard.jsx";
import SectionTabs, { SectionPanel } from "../../components/SectionTabs.jsx";
import { takeRememberedRole } from "../../data/careers.js";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { downloadReceiptPdf } from "../../utils/receiptPdfLazy.js";
import { tierLabel } from "../../utils/tiers.js";
import { startsInFuture, formatStartDate } from "../../utils/startDate.js";

// The dashboard's sections, shown one at a time. Each has its own address
// (/dashboard?tab=apply), so the Careers page, emails and notifications can
// link straight to one.
const TABS = [
  ["courses", "My Programs"],
  ["applications", "My Applications"],
  ["wallet", "My Wallet"],
  ["refer", "Refer & Earn"],
  ["notifications", "Notifications"],
];
// Inside My Applications: the list, or applying for a role (?tab=apply).
const APPLICATION_VIEWS = [
  ["applications", "My applications"],
  ["apply", "Apply / Aptitude test"],
];

export default function MyCourses() {
  usePageMeta({ title: "My Dashboard | Crix Technology" });
  const [params, setParams] = useSearchParams();
  const view = [...TABS, ...APPLICATION_VIEWS].some(([id]) => id === params.get("tab")) ? params.get("tab") : "courses";
  const tab = view === "apply" ? "applications" : view;
  const goToTab = (id) => setParams(id === "courses" ? {} : { tab: id });
  // The role picked on the Careers page: in the address, or remembered through
  // the log-in popup. Read once, when the dashboard opens.
  const [applyRole] = useState(() => params.get("role") || takeRememberedRole());
  const { isLoggedIn, isAdmin, user, logout, openAuthModal } = useContext(UserContext);
  const navigate = useNavigate();
  const notices = useNotifications(isLoggedIn && !isAdmin);
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
      <section className="section dash-page" style={{ minHeight: "60vh" }}>
        <div className="wrap" style={{ maxWidth: 480 }}>
          <span className="eyebrow">My dashboard</span>
          <h1 className="title-lg" style={{ margin: "14px 0 16px" }}>Log in to see your dashboard</h1>
          <button className="btn btn-solid" onClick={() => openAuthModal("login")}>Log in</button>
        </div>
      </section>
    );
  }

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">My dashboard</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Welcome, {user?.name}</h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link className="btn btn-ghost" to="/profile">Edit profile</Link>
            <button className="btn btn-ghost" onClick={() => { logout(); navigate("/"); }}>Log out</button>
          </div>
        </div>

        {/* Admins have no applications or wallet: they keep the single course list. */}
        {!isAdmin && (
          <SectionTabs label="Dashboard sections" idPrefix="dash" active={tab} onChange={goToTab}
            tabs={TABS.map(([id, label]) => ({ id, label, badge: id === "notifications" ? notices.unread : 0 }))} />
        )}

        <SectionPanel active={isAdmin ? null : tab} idPrefix="dash">
        {!isAdmin && tab === "applications" && (
          <div className="dash-subtabs" role="group" aria-label="My Applications">
            {APPLICATION_VIEWS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={view === id} className={view === id ? "active" : ""} onClick={() => goToTab(id)}>{label}</button>
            ))}
          </div>
        )}
        {!isAdmin && view === "apply" && (
          <ApplyTab user={user} initialRole={applyRole} onGoToApplications={() => goToTab("applications")} />
        )}
        {!isAdmin && view === "applications" && <ApplicationsTab onGoToApply={() => goToTab("apply")} />}
        {!isAdmin && tab === "wallet" && <WalletCard />}
        {!isAdmin && tab === "refer" && <ReferralCard />}
        {!isAdmin && tab === "notifications" && <NotificationsTab items={notices.items} onSeen={notices.markRead} onClear={notices.clear} />}

        {(isAdmin || tab === "courses") && (<>
        {!isAdmin && <PaymentRequests onPaid={load} />}
        <h2 style={{ margin: "0 0 16px", fontSize: "1.2rem" }}>{isAdmin ? "All programs" : "My programs"}</h2>
        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : enrollments.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            You haven't enrolled in a program yet. <Link to="/training-internship">Browse training tracks →</Link>
          </p>
        ) : (
          <div className="admin-list">
            {enrollments.map((en) => (
              <div className="admin-row" key={en._id}>
                <div className="admin-row-main">
                  <b>{en.course?.title || "Course"} {en.tier && <span className="plan-pill">{tierLabel(en.tier)}</span>} {en.expired && <span className="admin-pill expired">expired</span>}
                    {!en.adminAccess && startsInFuture(en.course) && <span className="admin-pill new">starts {formatStartDate(en.course.startsAt)}</span>}</b>
                  <span className="admin-row-meta">
                    {en.adminAccess
                      ? `${en.course?.type === "internship" ? "Training + Internship" : "Course"} · admin access, no purchase needed`
                      : `Purchased ${new Date(en.createdAt).toLocaleDateString("en-IN")}`}
                  </span>
                </div>
                <div className="admin-row-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {!en.adminAccess && startsInFuture(en.course) ? (
                    // Bought ahead of the start date: the content opens that day.
                    <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>
                      Starts on {formatStartDate(en.course.startsAt)} — you'll get access then.
                    </span>
                  ) : en.expired ? (
                    // The server 403s /learn/:slug once access has lapsed
                    // (see requireEnrollment.js) — show that up front instead
                    // of a "Go to course" link that would just dead-end.
                    <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>
                      Access has expired — contact us to renew.
                    </span>
                  ) : (
                    en.course?.slug && (
                      <Link className="btn btn-solid" to={`/learn/${en.course.slug}`}>{en.adminAccess ? "Open →" : en.course.type === "internship" ? "Go to training →" : "Go to course →"}</Link>
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
        {isAdmin && <ReferralCard />}
        </>)}
        </SectionPanel>
      </div>
      <UpgradeModal data={upgrade} onClose={() => setUpgrade(null)} onDone={load} />
    </section>
  );
}
