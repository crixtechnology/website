import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminToken, adminGetRevenueSummary, adminGetPayments } from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { useDebouncedLoad } from "../../hooks/useDebouncedLoad.js";
import { tierLabel } from "../../utils/tiers.js";

const PAGE_SIZE = 20;

function fmtRupees(n) {
  return `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Every real sale (Payment + receipt) rolled up into one place — total
// revenue, this month's revenue, a per-course/internship breakdown, and a
// searchable, paginated transaction list. Didn't exist before this: the
// receipt system stored the data but nothing in the admin panel surfaced
// it as revenue.
export default function AdminRevenue() {
  usePageMeta({ title: "Revenue | Crix Technology" });
  const navigate = useNavigate();
  const { logout } = useContext(UserContext);

  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState("");

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ payments: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminGetRevenueSummary().then((res) => {
      if (res.ok) setSummary(res.summary);
      else {
        setSummaryError(res.error || "Could not load revenue summary.");
        if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
      }
    });
  }, []);

  const load = async (searchQ, pageNum) => {
    setLoading(true);
    const res = await adminGetPayments(searchQ, pageNum, PAGE_SIZE);
    setLoading(false);
    if (res.ok) { setList(res); setError(""); }
    else {
      setError(res.error || "Could not load transactions.");
      if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
    }
  };

  // A new search always starts back at page 1 — debounced as you type, same
  // pattern as every other admin list page.
  useDebouncedLoad((val) => { setPage(1); load(val, 1); }, q);

  // Prev/Next are deliberate clicks, not typing — fire immediately rather
  // than through the debounced hook, so the page doesn't feel laggy.
  const goToPage = (p) => { setPage(p); load(q, p); };

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h2 style={{ margin: "14px 0 0" }}>Revenue</h2>
            <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>
              Every completed course/internship purchase, rolled up from the receipts issued on payment.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        {summaryError ? (
          <p className="form-error">{summaryError}</p>
        ) : !summary ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : (
          <>
            <div className="grid4" style={{ marginTop: 0, marginBottom: 40 }}>
              <div className="card">
                <span className="tag">Total revenue</span>
                <h3 style={{ margin: "14px 0 4px", fontSize: "1.7rem" }}>{fmtRupees(summary.totalRevenue)}</h3>
                <p className="card-benefit">{summary.totalTransactions} paid transaction{summary.totalTransactions === 1 ? "" : "s"}</p>
              </div>
              <div className="card">
                <span className="tag">This month</span>
                <h3 style={{ margin: "14px 0 4px", fontSize: "1.7rem" }}>{fmtRupees(summary.thisMonthRevenue)}</h3>
                <p className="card-benefit">{summary.thisMonthTransactions} transaction{summary.thisMonthTransactions === 1 ? "" : "s"}</p>
              </div>
              <div className="card">
                <span className="tag">Courses sold</span>
                <h3 style={{ margin: "14px 0 4px", fontSize: "1.7rem" }}>
                  {summary.byCourse.filter((c) => c.type === "course").reduce((n, c) => n + c.count, 0)}
                </h3>
                <p className="card-benefit">across {summary.byCourse.filter((c) => c.type === "course").length} course{summary.byCourse.filter((c) => c.type === "course").length === 1 ? "" : "s"}</p>
              </div>
              <div className="card">
                <span className="tag">Internships sold</span>
                <h3 style={{ margin: "14px 0 4px", fontSize: "1.7rem" }}>
                  {summary.byCourse.filter((c) => c.type === "internship").reduce((n, c) => n + c.count, 0)}
                </h3>
                <p className="card-benefit">across {summary.byCourse.filter((c) => c.type === "internship").length} internship{summary.byCourse.filter((c) => c.type === "internship").length === 1 ? "" : "s"}</p>
              </div>
            </div>

            {summary.byCourse.length > 0 && (
              <>
                <h3 style={{ fontSize: "1.1rem", margin: "0 0 14px" }}>Revenue by course &amp; internship</h3>
                <div className="admin-list" style={{ marginBottom: 40 }}>
                  {summary.byCourse.map((c) => (
                    <div className="admin-row" key={c.courseId || c.title}>
                      <div className="admin-row-main">
                        <b>
                          {c.title} <span className={`type-pill type-pill--${c.type}`}>{c.type === "internship" ? "Internship" : "Course"}</span>
                        </b>
                        <span className="admin-row-meta">{c.count} purchase{c.count === 1 ? "" : "s"}</span>
                      </div>
                      <div className="admin-row-actions">
                        <b>{fmtRupees(c.revenue)}</b>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <h3 style={{ fontSize: "1.1rem", margin: "0 0 14px" }}>Transactions</h3>
        <input
          className="admin-search"
          type="search"
          placeholder="Search by buyer name, email, receipt number, or course..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : list.payments.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>{q ? "No transactions match that search." : "No paid transactions yet."}</p>
        ) : (
          <>
            <div className="admin-list">
              {list.payments.map((p) => (
                <div className="admin-row" key={p.paymentId}>
                  <div className="admin-row-main">
                    <b>{p.buyerName || "—"}</b>
                    <span className="admin-row-meta">
                      {p.buyerEmail} · {p.receiptNumber} · {new Date(p.createdAt).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="admin-row-main">
                    <span>
                      {p.itemTitle} <span className={`type-pill type-pill--${p.itemType}`}>{p.itemType === "internship" ? "Internship" : "Course"}</span>
                      {p.tier && <> <span className="plan-pill">{tierLabel(p.tier)}</span></>}
                    </span>
                  </div>
                  <div className="admin-row-actions">
                    <b>{fmtRupees(p.totalPaid)}</b>
                  </div>
                </div>
              ))}
            </div>

            {list.totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20, flexWrap: "wrap" }}>
                <button className="btn btn-ghost" disabled={page <= 1} onClick={() => goToPage(page - 1)}>← Prev</button>
                <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>
                  Page {list.page} of {list.totalPages} · {list.total} total
                </span>
                <button className="btn btn-ghost" disabled={page >= list.totalPages} onClick={() => goToPage(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
