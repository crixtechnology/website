import { useContext, useEffect, useState } from "react";
import { Reveal, Aurora, BenefitIcon, Alert } from "../components/ui.jsx";
import AmbassadorDashboard from "../components/AmbassadorDashboard.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { usePageMeta } from "../hooks/usePageMeta.js";
import { getAmbassadorProgram, getMyAmbassador, applyAmbassador } from "../services/api.js";

const PERK_ICONS = ["award", "gift", "briefcase", "star", "document", "home"];
const EMPTY_FORM = { college: "", city: "", yearOfStudy: "", branch: "", socialHandle: "", motivation: "" };

const STEPS = [
  { n: "01", title: "Apply", desc: "Tell us about your college and why you'd be a great ambassador." },
  { n: "02", title: "Get approved", desc: "We review every application and get back to you — approved ambassadors get a code, a dashboard and a welcome kit." },
  { n: "03", title: "Share your code", desc: "Friends who use it get a discount on their first course or internship." },
  { n: "04", title: "Earn", desc: "You earn a commission on everything they pay, paid out to your UPI / bank account." },
];

// The Campus Ambassador programme: what it is, an application form, and — once
// approved — the ambassador's own dashboard (AmbassadorDashboard).
export default function Ambassador() {
  usePageMeta({
    title: "Campus Ambassador Program | Crix Technology",
    description: "Represent Crix Technology on your campus: get a certificate and welcome kit, share your code with fellow students, and earn a commission on every student who joins.",
  });
  const { isLoggedIn, openAuthModal } = useContext(UserContext);
  const [program, setProgram] = useState(null);
  const [mine, setMine] = useState(undefined); // undefined = loading, null = couldn't load, else /me/ambassador
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState({ kind: "", text: "" });
  const [sending, setSending] = useState(false);

  const loadMine = () => getMyAmbassador().then((res) => setMine(res.ok ? res : null));

  useEffect(() => {
    let alive = true;
    getAmbassadorProgram().then((res) => { if (alive && res.ok) setProgram(res.program); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) { setMine(undefined); return; }
    loadMine();
  }, [isLoggedIn]);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setStatus({ kind: "", text: "" }); };

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    if (!form.college.trim() || !form.city.trim()) { setStatus({ kind: "error", text: "Please add your college and its city." }); return; }
    if (form.motivation.trim().length < 20) { setStatus({ kind: "error", text: "Tell us a little more about why you'd be a great ambassador (a couple of sentences)." }); return; }
    setSending(true);
    const res = await applyAmbassador(form);
    setSending(false);
    if (res.ok) { setShowForm(false); setForm(EMPTY_FORM); loadMine(); }
    else setStatus({ kind: "error", text: res.error });
  };

  const approved = mine && mine.status === "approved";
  const canApply = !mine || mine.status === null || (mine.status === "rejected" && showForm);

  return (
    <>
      <header className="page-head" style={{ position: "relative", overflow: "hidden" }}>
        <Aurora />
        <Reveal variant="reveal-top" style={{ position: "relative", zIndex: 2 }} className="wrap">
          <span className="eyebrow">Campus Ambassador</span>
          <h1 style={{ fontSize: "clamp(1.9rem,4vw,3rem)", margin: "14px 0 18px" }}>Represent Crix on your campus.</h1>
          <p>
            Bring fellow students to Crix's internships and courses — get recognised with a certificate and a welcome kit,
            and earn a commission on every student who joins through you.
          </p>
        </Reveal>
      </header>

      {!approved && (
        <>
          <section className="section" style={{ paddingTop: 20 }}>
            <div className="wrap">
              <Reveal as="span" variant="reveal-l" className="eyebrow">What you get</Reveal>
              <div className="grid4 stagger">
                {program && (
                  <Reveal variant="reveal" className="benefit" style={{ "--i": 0 }}>
                    <span className="benefit-icon"><BenefitIcon name="briefcase" /></span>
                    <h3>{program.commissionPercent}% commission</h3>
                    <p>Earn {program.commissionPercent}% of what every student you bring in pays — paid to your UPI or bank account.</p>
                  </Reveal>
                )}
                {(program ? program.perks : []).map((perk, i) => (
                  <Reveal key={perk} variant="reveal" className="benefit" style={{ "--i": i + 1 }}>
                    <span className="benefit-icon"><BenefitIcon name={PERK_ICONS[i % PERK_ICONS.length]} /></span>
                    <h3>{perk}</h3>
                  </Reveal>
                ))}
                {program && (
                  <Reveal variant="reveal" className="benefit" style={{ "--i": 9 }}>
                    <span className="benefit-icon"><BenefitIcon name="gift" /></span>
                    <h3>{program.friendDiscountPercent}% off for your friends</h3>
                    <p>Students who use your code get {program.friendDiscountPercent}% off their first purchase.</p>
                  </Reveal>
                )}
              </div>
            </div>
          </section>

          <section className="section" style={{ paddingTop: 20 }}>
            <div className="wrap">
              <Reveal as="span" variant="reveal-l" className="eyebrow">How it works</Reveal>
              <div className="process stagger">
                {STEPS.map((p, i) => (
                  <Reveal key={p.n} variant="reveal" className="step" style={{ "--i": i }}>
                    <span className="step-num">{p.n}</span>
                    <h3>{p.title}</h3>
                    <p>{p.desc}</p>
                  </Reveal>
                ))}
              </div>
              {program && (
                <p className="amb-hint" style={{ marginTop: 24, textAlign: "center" }}>
                  Commission is held for {program.holdDays} days after a student pays, then becomes payable. Payouts start at ₹{program.minPayoutRupees}.
                </p>
              )}
            </div>
          </section>
        </>
      )}

      <section className="section" style={{ paddingTop: 20 }} id="apply">
        <div className="wrap" style={{ maxWidth: approved ? 1040 : 640 }}>
          {!isLoggedIn ? (
            <div className="ref-card" style={{ marginTop: 0 }}>
              <span className="eyebrow">Apply</span>
              <h2 className="ref-title">Ready to be an ambassador?</h2>
              <p className="ref-lede">Log in (or create a free account) to apply.</p>
              <button className="btn btn-solid" style={{ marginTop: 18 }} onClick={() => openAuthModal("login")}>Log in to apply</button>
            </div>
          ) : mine === undefined ? (
            <p style={{ color: "var(--muted)" }}>Loading…</p>
          ) : mine === null ? (
            <p className="form-error">Couldn't load your ambassador details right now. Please try again in a moment.</p>
          ) : approved ? (
            <AmbassadorDashboard data={mine} reload={loadMine} />
          ) : mine.status === "applied" ? (
            <div className="ref-card" style={{ marginTop: 0 }}>
              <span className="eyebrow">Application received</span>
              <h2 className="ref-title">Thanks — we're reviewing your application.</h2>
              <p className="ref-lede">
                You applied from <b>{mine.application.college}</b>, {mine.application.city}. We'll review it and your status will
                update on this page. Nothing else to do for now.
              </p>
            </div>
          ) : mine.status === "suspended" ? (
            <div className="ref-card" style={{ marginTop: 0 }}>
              <span className="eyebrow">Ambassador account paused</span>
              <h2 className="ref-title">Your ambassador account is paused.</h2>
              <p className="ref-lede">Please get in touch with us on the Contact page and we'll sort it out.</p>
            </div>
          ) : program && !program.enabled && !mine.status ? (
            <div className="ref-card" style={{ marginTop: 0 }}>
              <span className="eyebrow">Applications closed</span>
              <h2 className="ref-title">We're not taking applications right now.</h2>
              <p className="ref-lede">Check back soon.</p>
            </div>
          ) : (
            <>
              {mine.status === "rejected" && !showForm && (
                <div className="ref-card" style={{ marginTop: 0 }}>
                  <span className="eyebrow">Application update</span>
                  <h2 className="ref-title">We couldn't take you on this time.</h2>
                  <p className="ref-lede">You're welcome to apply again whenever you're ready.</p>
                  <button className="btn btn-solid" style={{ marginTop: 18 }} onClick={() => setShowForm(true)}>Apply again</button>
                </div>
              )}
              {canApply && (
                <form className="admin-form" onSubmit={submit} noValidate>
                  <h2 style={{ margin: "0 0 6px", fontSize: "1.3rem" }}>Apply to be a Campus Ambassador</h2>
                  <p className="form-note" style={{ margin: "0 0 18px" }}>It takes two minutes. We review every application.</p>
                  <div className="amb-form-grid">
                    <div className="field"><label htmlFor="amb-college">College / university</label>
                      <input id="amb-college" value={form.college} onChange={set("college")} placeholder="Your college" autoComplete="organization" /></div>
                    <div className="field"><label htmlFor="amb-city">City</label>
                      <input id="amb-city" value={form.city} onChange={set("city")} placeholder="Where it's located" /></div>
                    <div className="field"><label htmlFor="amb-year">Year of study</label>
                      <input id="amb-year" value={form.yearOfStudy} onChange={set("yearOfStudy")} placeholder="e.g. 3rd year" /></div>
                    <div className="field"><label htmlFor="amb-branch">Course / branch</label>
                      <input id="amb-branch" value={form.branch} onChange={set("branch")} placeholder="e.g. B.Tech Computer Engineering" /></div>
                  </div>
                  <div className="field"><label htmlFor="amb-social">Instagram / LinkedIn (optional)</label>
                    <input id="amb-social" value={form.socialHandle} onChange={set("socialHandle")} placeholder="@yourhandle or profile link" /></div>
                  <div className="field"><label htmlFor="amb-why">Why would you be a great ambassador?</label>
                    <textarea id="amb-why" rows="5" value={form.motivation} onChange={set("motivation")}
                      placeholder="Clubs you run or are part of, how many students you can reach, how you'd promote Crix…" /></div>
                  <Alert kind={status.kind || "info"}>{status.text}</Alert>
                  <button className="btn btn-solid" type="submit" disabled={sending}>{sending ? "Sending…" : "Submit application"}</button>
                </form>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
