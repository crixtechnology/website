import { useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminToken, adminGetUsers, adminGetUser, adminUpdateUser, adminDeleteUser,
  adminGetCourses, adminGrantSubscription, adminUpdateSubscription, adminRemoveSubscription,
} from "../../services/api.js";
import { UserContext } from "../../context/UserContext.jsx";
import { usePageMeta } from "../../hooks/usePageMeta.js";
import { useDebouncedLoad } from "../../hooks/useDebouncedLoad.js";
import { tierLabel } from "../../utils/tiers.js";
import { phoneError } from "../../utils/phone.js";
import PhoneInput from "../../components/PhoneInput.jsx";

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString("en-IN") : "—";
}
// <input type="date"> needs yyyy-mm-dd, not an ISO timestamp.
function toDateInput(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

// Account directory (search across name/email/phone) with a detail panel
// per user that doubles as their subscription manager — grant, edit the
// validity dates of, or revoke any course's access right from here, same
// underlying Enrollment CRUD as the dedicated Subscriptions page.
export default function AdminUsers() {
  usePageMeta({ title: "Users | Crix Technology" });
  const navigate = useNavigate();
  const { user: me, logout } = useContext(UserContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null); // { user, enrollments, applications }
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [editForm, setEditForm] = useState({ name: "", phone: "", role: "student" });
  const [savingUser, setSavingUser] = useState(false);

  const [courses, setCourses] = useState([]);
  const [grantForm, setGrantForm] = useState({ courseId: "", endDate: "" });
  const [granting, setGranting] = useState(false);

  const loadList = async (query) => {
    setLoading(true);
    const res = await adminGetUsers(query);
    setLoading(false);
    if (res.ok) { setUsers(res.users || []); setError(""); }
    else {
      setError(res.error || "Could not load users.");
      if (!getAdminToken()) { logout(); navigate("/admin", { replace: true }); }
    }
  };

  // Both types now — an internship can carry a real price and get a real
  // Enrollment the same way a course does, so it needs to be grantable here too.
  useEffect(() => { adminGetCourses().then((res) => { if (res.ok) setCourses(res.courses || []); }); }, []);
  useDebouncedLoad(loadList, q);

  // On narrow screens the detail panel stacks under the list — bring it into view.
  const detailRef = useRef(null);
  const scrollToDetail = () => {
    if (window.matchMedia && window.matchMedia("(max-width: 900px)").matches) {
      setTimeout(() => { if (detailRef.current) detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
    }
  };

  const openDetail = async (id) => {
    setSelectedId(id);
    scrollToDetail();
    setDetailLoading(true);
    setDetailError("");
    // Clear immediately, not just on failure: while this fetch is in flight
    // (or if it fails) `detail`/`editForm` must never keep showing the
    // PREVIOUSLY selected user's data next to the NEW selectedId — otherwise
    // Save/Delete below would act on the new id with the old user's data.
    setDetail(null);
    const res = await adminGetUser(id);
    setDetailLoading(false);
    if (res.ok) {
      setDetail(res);
      setEditForm({ name: res.user.name || "", phone: res.user.phone || "", role: res.user.role });
    } else {
      setDetailError(res.error || "Could not load this user.");
    }
  };

  const closeDetail = () => { setSelectedId(null); setDetail(null); setGrantForm({ courseId: "", endDate: "" }); };

  const saveUser = async (e) => {
    e.preventDefault();
    // A disabled submit button doesn't stop the browser's native form
    // submit on Enter inside a text field — without this guard, pressing
    // Enter twice quickly fires two concurrent saves.
    if (savingUser) return;
    // A blank phone is allowed (it clears it); anything typed has to be a real number.
    const phoneProblem = editForm.phone.trim() && phoneError(editForm.phone);
    if (phoneProblem) { setDetailError(`Please enter ${phoneProblem}.`); return; }
    setSavingUser(true);
    const res = await adminUpdateUser(selectedId, editForm);
    setSavingUser(false);
    if (res.ok) { openDetail(selectedId); loadList(q); }
    else setDetailError(res.error || "Could not save.");
  };

  const removeUser = async () => {
    if (!window.confirm(`Delete "${detail.user.name}"'s account? This cannot be undone and removes their subscriptions too.`)) return;
    const res = await adminDeleteUser(selectedId);
    if (res.ok) { closeDetail(); loadList(q); }
    else setDetailError(res.error || "Could not delete.");
  };

  const grantAccess = async (e) => {
    e.preventDefault();
    // A disabled submit button doesn't stop the browser's native form
    // submit on Enter inside a text field — without this guard, pressing
    // Enter twice quickly fires two concurrent grant requests.
    if (granting) return;
    if (!grantForm.courseId) { setDetailError("Pick a course first."); return; }
    setGranting(true);
    const res = await adminGrantSubscription({
      userId: selectedId, courseId: grantForm.courseId,
      endDate: grantForm.endDate || null,
    });
    setGranting(false);
    if (res.ok) { setGrantForm({ courseId: "", endDate: "" }); openDetail(selectedId); }
    else setDetailError(res.error || "Could not grant access.");
  };

  const editSubEndDate = async (enr, endDate) => {
    const res = await adminUpdateSubscription(enr._id, { endDate: endDate || null });
    if (res.ok) openDetail(selectedId); else setDetailError(res.error || "Could not update.");
  };

  const revokeSub = async (enr) => {
    if (!window.confirm(`Revoke access to "${enr.course?.title}"?`)) return;
    const res = await adminRemoveSubscription(enr._id);
    if (res.ok) openDetail(selectedId); else setDetailError(res.error || "Could not revoke.");
  };

  const isSelf = detail && me && String(detail.user._id) === String(me.id);

  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="wrap">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1 className="title-lg" style={{ margin: "14px 0 0" }}>Users</h1>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/admin")}>← Dashboard</button>
        </div>

        <input
          className="admin-search"
          type="search"
          placeholder="Search by name, email or phone..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {error && <p className="form-error">{error}</p>}

        <div className={`admin-split${selectedId ? " has-detail" : ""}`}>
          {loading ? (
            <p style={{ color: "var(--muted)" }}>Loading...</p>
          ) : users.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>{q ? "No users match that search." : "No users yet."}</p>
          ) : (
            <div className="admin-list">
              {users.map((u) => (
                <div
                  className="admin-row"
                  key={u._id}
                  style={{ cursor: "pointer", borderColor: selectedId === u._id ? "var(--cyan)" : undefined }}
                  onClick={() => openDetail(u._id)}
                >
                  <div className="admin-row-main">
                    <b>{u.name} {u.role === "admin" && <span className="admin-pill admin-role">admin</span>}</b>
                    <span className="admin-row-meta">{u.email} {u.phone ? `· ${u.phone}` : ""} · joined {fmtDate(u.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedId && (
            <div className="admin-form admin-detail-panel" ref={detailRef}>
              {detailLoading ? (
                <p style={{ color: "var(--muted)" }}>Loading...</p>
              ) : !detail ? (
                <p className="form-error">{detailError || "Could not load."}</p>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                    <h3 style={{ margin: 0, minWidth: 0 }}>{detail.user.name}</h3>
                    <button className="btn btn-ghost" onClick={closeDetail}>✕ Close</button>
                  </div>

                  <form onSubmit={saveUser}>
                    <div className="field"><label>Name</label>
                      <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
                    <div className="field"><label htmlFor="au-phone">Phone</label>
                      <PhoneInput id="au-phone" value={editForm.phone} onChange={(phone) => setEditForm((f) => ({ ...f, phone }))} /></div>
                    <div className="field"><label>Role</label>
                      <select value={editForm.role} disabled={isSelf} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                        <option value="student">Student</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <p className="form-note" style={{ margin: "-8px 0 16px" }}>Email: {detail.user.email} (not editable — it's the login identifier)</p>
                    {detailError && <p className="form-error">{detailError}</p>}
                    <div className="admin-actions" style={{ marginBottom: 28 }}>
                      <button className="btn btn-solid" type="submit" disabled={savingUser}>{savingUser ? "Saving..." : "Save changes"}</button>
                      {!isSelf && <button type="button" className="btn btn-ghost admin-danger" onClick={removeUser}>Delete account</button>}
                    </div>
                  </form>

                  <h3 style={{ margin: "0 0 16px" }}>Subscriptions</h3>
                  {detail.enrollments.length === 0 ? (
                    <p style={{ color: "var(--muted)", marginBottom: 20 }}>No course access granted yet.</p>
                  ) : (
                    <div className="admin-list" style={{ marginBottom: 24 }}>
                      {detail.enrollments.map((en) => (
                        <div className="admin-row" key={en._id}>
                          <div className="admin-row-main">
                            <b>{en.course?.title}</b>{en.tier && <> <span className="plan-pill">{tierLabel(en.tier)}</span></>}
                            <span className="admin-row-meta">
                              Since {fmtDate(en.startDate)} ·{" "}
                              {en.endDate ? (
                                <span className={`admin-pill ${en.expired ? "expired" : "new"}`}>
                                  {en.expired ? "expired" : "valid until"} {fmtDate(en.endDate)}
                                </span>
                              ) : (
                                <span className="admin-pill lifetime">lifetime</span>
                              )}
                            </span>
                          </div>
                          <div className="admin-row-actions">
                            <input
                              type="date"
                              defaultValue={toDateInput(en.endDate)}
                              onBlur={(e) => { if (e.target.value !== toDateInput(en.endDate)) editSubEndDate(en, e.target.value); }}
                              title="Change the validity end date — clear it for lifetime access"
                            />
                            <button className="btn btn-ghost admin-danger" onClick={() => revokeSub(en)}>Revoke</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={grantAccess} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div className="field" style={{ margin: 0, flex: "1 1 200px" }}>
                      <label>Grant access to</label>
                      <select value={grantForm.courseId} onChange={(e) => setGrantForm({ ...grantForm, courseId: e.target.value })}>
                        <option value="">Choose a course or internship...</option>
                        {courses.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Expires (optional)</label>
                      <input type="date" value={grantForm.endDate} onChange={(e) => setGrantForm({ ...grantForm, endDate: e.target.value })} />
                    </div>
                    <button className="btn btn-solid" type="submit" disabled={granting}>{granting ? "Granting..." : "Grant"}</button>
                  </form>

                  {detail.applications.length > 0 && (
                    <>
                      <h3 style={{ margin: "28px 0 16px" }}>Applications</h3>
                      <div className="admin-list">
                        {detail.applications.map((a) => (
                          <div className="admin-row" key={a._id}>
                            <div className="admin-row-main">
                              <b>{a.refTitle}</b>
                              <span className="admin-row-meta">{a.type} · applied {fmtDate(a.createdAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
