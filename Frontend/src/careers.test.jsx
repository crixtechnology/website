import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import Careers from "./pages/Careers.jsx";
import { ApplyTab, ApplicationsTab } from "./components/CareersDashboard.jsx";
import * as api from "./services/api.js";

// The Careers page and the careers sections of My Dashboard.
jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.resetAllMocks();
  window.sessionStorage.clear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const q = (sel) => container.querySelector(sel);
const all = (sel) => [...container.querySelectorAll(sel)];
const button = (text, within = container) => [...within.querySelectorAll("button, a")].find((b) => b.textContent.trim().startsWith(text));
const click = (el) => act(async () => { el.click(); });

const opening = (overrides = {}) => ({
  _id: "o1", slug: "web-development-intern", title: "Web Development Intern", summary: "Build pages.", status: "open",
  skills: ["HTML", "CSS"], responsibilities: ["Ship pages"], eligibility: ["Freshers welcome"],
  stipend: "Up to ₹6,000/month", experience: "0–1 year", duration: "3 months", mode: "Remote / Ahmedabad",
  createdAt: "2026-10-10T00:00:00.000Z",
  test: { durationMinutes: 45, questions: 34, marksPerQuestion: 1 },
  ...overrides,
});
const terms = { signupBonus: 300, creditExpiryMonths: 12, creditUsagePercent: 100 };

// Shows where the router ended up, so a test can see a redirect.
function Where() {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{pathname}{search}</div>;
}

async function renderCareers(ctx) {
  api.getOpenings.mockResolvedValue({ ok: true, openings: [opening(), opening({ _id: "o2", slug: "data-science-intern", title: "Data Science Intern" })], terms });
  await act(async () => {
    root.render(
      <UserContext.Provider value={ctx}>
        <MemoryRouter initialEntries={["/careers"]}>
          <Routes>
            <Route path="/careers" element={<Careers />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </UserContext.Provider>
    );
  });
}

describe("Careers page", () => {
  it("shows the sections, the live openings (every one free to apply), and job-posting markup", async () => {
    await renderCareers({ isLoggedIn: false, isAdmin: false, openAuthModal: jest.fn() });

    expect(q("h1").textContent).toBe("Build Real Products. Start Your Tech Career at Crix.");
    expect(button("View Openings").getAttribute("href")).toBe("#openings");
    for (const id of ["vision", "openings"]) expect(q(`#${id}`)).not.toBeNull();
    // Gone: the why-join, hiring-steps, fee and FAQ sections.
    for (const id of ["why-join", "hiring-process", "test-fee", "faq"]) expect(q(`#${id}`)).toBeNull();
    expect(document.getElementById("faq-jsonld")).toBeNull();

    expect(all(".job-card h3").map((h) => h.textContent)).toEqual(["Web Development Intern", "Data Science Intern"]);
    // No role has a fee: every card says so, and no amount is quoted anywhere on the page.
    expect(all(".job-card .fee-pill").map((p) => p.textContent)).toEqual(["Free to apply", "Free to apply"]);
    expect(container.textContent).not.toMatch(/₹289|registration fee|Pay ₹/i);
    const outsideCards = [...container.querySelectorAll("section")].filter((sec) => sec.id !== "openings").map((sec) => sec.textContent).join(" ");
    expect(outsideCards).not.toMatch(/₹|\bfees?\b/i);
    expect(document.title).toBe("Careers & Internships | Crix Technology");

    const jobs = JSON.parse(document.getElementById("jobs-jsonld").textContent)["@graph"];
    // Every role is free to apply for, so every one is listed for search engines.
    expect(jobs.map((j) => [j["@type"], j.title, j.employmentType])).toEqual([
      ["JobPosting", "Web Development Intern", "INTERN"],
      ["JobPosting", "Data Science Intern", "INTERN"],
    ]);
  });

  it("opens a role's full details when its card is clicked", async () => {
    await renderCareers({ isLoggedIn: false, isAdmin: false, openAuthModal: jest.fn() });
    expect(q(".modal-box")).toBeNull();
    await click(q(".job-card-body"));
    const modal = q(".modal-box");
    expect(modal.textContent).toContain("Responsibilities");
    expect(modal.textContent).toContain("Ship pages");
    expect(modal.textContent).toContain("Freshers welcome");
    expect(modal.textContent).toContain("34 multiple-choice questions in 45 minutes");
    expect(modal.textContent).toContain("Applying and the aptitude test are free");
    expect(modal.textContent).not.toMatch(/₹289|registration fee|wallet credit/);
    expect(button("Apply Now — Free", modal)).toBeTruthy();
  });

  it("applies for a role without payment once the terms are accepted, then waits for Crix to give test access", async () => {
    api.getMyJobApplications.mockResolvedValue({ ok: true, applications: [], terms });
    await renderCareers({ user: student, isLoggedIn: true, isAdmin: false, openAuthModal: jest.fn() });
    await click(button("Apply Now", all(".job-card")[1]));
    const modal = applyModal();
    expect(modal.textContent).not.toContain("₹289");
    expect(modal.querySelector(".order-summary")).toBeNull();
    const apply = button("Apply — Free", modal);
    expect(apply.disabled).toBe(true);
    await click(apply);
    expect(api.applyForRole).not.toHaveBeenCalled();

    api.applyForRole.mockResolvedValue({ ok: true, application: { _id: "a5", status: "awaiting_access", statusLabel: "Waiting for test access" } });
    await click(modal.querySelector(".terms-check input"));
    expect(apply.disabled).toBe(true); // the 18+ box too
    await click(modal.querySelector(".adult-check input"));
    expect(apply.disabled).toBe(false);
    await click(apply);
    expect(api.applyForRole).toHaveBeenCalledWith("data-science-intern");
    // No way to unlock the test from here: Crix gives access.
    expect(api.unlockFreeTest).toBeUndefined();
    expect(modal.textContent).toContain("You've applied for this role");
    expect(modal.textContent).toContain("give you access to the aptitude test");
    expect(modal.querySelector('a[href^="/test/"]')).toBeNull();
  });

  const applyModal = () => q(".apply-modal");
  const student = { name: "Asha", email: "asha@example.com", phone: "+919876543210" };

  it("sends a visitor to log in first, remembering the role, then opens the apply popup for it", async () => {
    const openAuthModal = jest.fn();
    api.getMyJobApplications.mockResolvedValue({ ok: true, applications: [], terms });
    await renderCareers({ isLoggedIn: false, isAdmin: false, openAuthModal });
    await click(button("Apply Now", all(".job-card")[1]));

    expect(openAuthModal).toHaveBeenCalledWith("login", expect.any(Function));
    expect(window.sessionStorage.getItem("crix_apply_role")).toBe("data-science-intern");
    expect(applyModal()).toBeNull();
    // What the sign-up popup does once the account exists:
    await act(async () => { openAuthModal.mock.calls[0][1](); });
    expect(applyModal().querySelector("h3").textContent).toBe("Data Science Intern");
  });

  it("shows the server's reason when applying fails", async () => {
    const openAuthModal = jest.fn();
    api.getMyJobApplications.mockResolvedValue({ ok: true, applications: [], terms });
    await renderCareers({ user: student, isLoggedIn: true, isAdmin: false, openAuthModal });
    await click(button("Apply Now", all(".job-card")[0]));
    expect(openAuthModal).not.toHaveBeenCalled();

    const modal = applyModal();
    expect(modal.querySelector("h3").textContent).toBe("Web Development Intern");
    api.applyForRole.mockResolvedValue({ ok: false, error: "This role is closed for applications right now." });
    await click(modal.querySelector(".terms-check input"));
    await click(modal.querySelector(".adult-check input"));
    await click(button("Apply — Free", modal));
    expect(modal.querySelector(".alert-error").textContent).toContain("closed for applications");
  });

  it("tells someone already waiting that Crix will give them test access", async () => {
    api.getMyJobApplications.mockResolvedValue({
      ok: true, terms,
      applications: [{ _id: "a2", status: "awaiting_access", statusLabel: "Waiting for test access", opening: { _id: "o1" }, attempt: null }],
    });
    await renderCareers({ user: student, isLoggedIn: true, isAdmin: false, openAuthModal: jest.fn() });
    await click(button("Continue application", all(".job-card")[0]));
    expect(applyModal().textContent).toContain("already applied");
    expect(applyModal().querySelector('a[href^="/test/"]')).toBeNull();
  });

  it("doesn't hold a student with an unfinished profile back from a free test", async () => {
    api.getMyJobApplications.mockResolvedValue({ ok: true, applications: [], terms });
    const fresh = { name: "Asha", email: "asha@example.com", phone: "", profilePending: true };
    await renderCareers({ user: fresh, isLoggedIn: true, isAdmin: false, openAuthModal: jest.fn() });
    await click(button("Apply Now", all(".job-card")[0]));
    const modal = applyModal();
    expect(modal.querySelector(".profile-gate")).toBeNull();
    expect(button("Apply — Free", modal)).toBeTruthy();
  });

  it("offers to start the test once Crix has given access", async () => {
    api.getMyJobApplications.mockResolvedValue({
      ok: true, terms,
      applications: [{ _id: "a1", status: "test_pending", statusLabel: "Test pending", opening: { _id: "o1" }, attempt: null }],
    });
    await renderCareers({ user: student, isLoggedIn: true, isAdmin: false, openAuthModal: jest.fn() });
    // Access given but not taken yet: continuing opens the test.
    await click(button("Continue application", all(".job-card")[0]));
    expect(button("Start test", applyModal()).getAttribute("href")).toBe("/test/a1");
    expect(applyModal().textContent).not.toMatch(/Pay ₹|paid/);
  });

  it("sends someone whose test is being reviewed to My Applications instead of applying again", async () => {
    api.getMyJobApplications.mockResolvedValue({
      ok: true, terms,
      applications: [{ _id: "a1", status: "submitted", statusLabel: "Submitted", opening: { _id: "o1" }, attempt: null }],
    });
    await renderCareers({ user: student, isLoggedIn: true, isAdmin: false, openAuthModal: jest.fn() });
    const [applied, other] = all(".job-card");
    expect(applied.textContent).toContain("Submitted");
    expect(button("View my application", applied).getAttribute("href")).toBe("/dashboard?tab=applications");
    expect(button("Apply Now", other)).toBeTruthy();
  });

  it("lets them apply again once an application ends without an offer", async () => {
    api.getMyJobApplications.mockResolvedValue({
      ok: true, terms,
      applications: [{ _id: "a1", status: "not_shortlisted", statusLabel: "Not shortlisted", opening: { _id: "o1" }, attempt: null }],
    });
    await renderCareers({ user: student, isLoggedIn: true, isAdmin: false, openAuthModal: jest.fn() });
    const card = all(".job-card")[0];
    expect(button("View my application", card)).toBeUndefined();
    expect(button("Apply Now", card).disabled).toBe(false);
  });

  const renderWithOpenings = async (result) => {
    api.getOpenings.mockResolvedValue(result);
    await act(async () => {
      root.render(
        <UserContext.Provider value={{ isLoggedIn: false, isAdmin: false, openAuthModal: jest.fn() }}>
          <MemoryRouter initialEntries={["/careers"]}><Routes><Route path="/careers" element={<Careers />} /></Routes></MemoryRouter>
        </UserContext.Provider>
      );
    });
  };

  it("shows no roles at all, and says so, when every role is closed", async () => {
    await renderWithOpenings({ ok: true, openings: [], terms });
    expect(all(".job-card")).toHaveLength(0);
    expect(q(".no-openings").textContent).toContain("No open roles right now");
    expect(document.body.textContent).not.toContain("Freshers are welcome for every role below");
    expect(document.head.querySelector("#jobs-jsonld")).toBeNull(); // nothing advertised to search engines either
  });

  it("never shows a role marked closed, even if one slips into the list", async () => {
    await renderWithOpenings({ ok: true, openings: [opening(), opening({ _id: "o2", slug: "data-science-intern", title: "Data Science Intern", status: "closed" })], terms });
    expect(all(".job-card")).toHaveLength(1);
    expect(document.body.textContent).not.toContain("Data Science Intern");
  });

  it("shows each role's open positions, and turns Apply off once they're all filled", async () => {
    await renderWithOpenings({ ok: true, terms, openings: [
      opening({ positions: { total: 5, filled: 2, left: 3 } }),
      opening({ _id: "o2", slug: "data-science-intern", title: "Data Science Intern", positions: { total: 2, filled: 2, left: 0 } }),
    ] });
    const [open, full] = all(".job-card");
    expect(open.textContent).toContain("3 of 5 positions open");
    expect(button("Apply Now", open).disabled).toBe(false);
    expect(full.textContent).toContain("Positions filled");
    expect(full.textContent).toContain("All filled");
    expect(button("Positions filled", full).disabled).toBe(true);
  });

  it("shows no roles when the server can't be reached", async () => {
    await renderWithOpenings({ ok: false, error: "Could not load openings" });
    expect(all(".job-card")).toHaveLength(0);
    expect(q(".no-openings").textContent).toContain("We couldn't load the open roles");
  });

  it("sends the role-less Apply Now to the dashboard's Apply section", async () => {
    await renderCareers({ user: student, isLoggedIn: true, isAdmin: false, openAuthModal: jest.fn() });
    await click(button("Apply Now", q(".careers-cta-actions")));
    expect(q('[data-testid="where"]').textContent).toBe("/dashboard?tab=apply");
  });
});

describe("My Dashboard: Apply / Aptitude Test", () => {
  const application = (overrides = {}) => ({
    _id: "a1", status: "awaiting_access", statusLabel: "Waiting for test access", opening: { _id: "o1", slug: "web-development-intern", title: "Web Development Intern" },
    createdAt: "2026-10-10T07:00:00.000Z", testAccessAt: null, interview: null, attempt: null, ...overrides,
  });
  const renderApply = async (applications, props = {}) => {
    api.getOpenings.mockResolvedValue({ ok: true, openings: [opening(), opening({ _id: "o2", slug: "data-science-intern", title: "Data Science Intern" })], terms });
    api.getMyJobApplications.mockResolvedValue({ ok: true, applications, terms });
    await act(async () => {
      root.render(<MemoryRouter><ApplyTab onGoToApplications={jest.fn()} {...props} /></MemoryRouter>);
    });
  };

  it("opens on the role chosen on the Careers page and offers the free test, with nothing to pay", async () => {
    await renderApply([], { initialRole: "data-science-intern" });
    expect(q(".plan-option.is-selected b").textContent).toBe("Data Science Intern");
    expect(q(".apply-panel h3").textContent).toBe("Data Science Intern");
    expect(button("Apply", q(".apply-panel"))).toBeTruthy();
    expect(q(".order-summary")).toBeNull();
    expect(container.textContent).not.toMatch(/₹289|Pay ₹|test fee|wallet credit/i);
    expect(all(".plan-option").every((o) => o.textContent.includes("· Free ·"))).toBe(true);
  });

  it("applies once the terms and 18+ boxes are ticked, and shows the server's reason when it can't", async () => {
    await renderApply([]);
    const applyBtn = () => [...q(".apply-panel").querySelectorAll("button")].find((b) => b.textContent === "Apply");
    api.applyForRole.mockResolvedValue({ ok: false, error: "This role is closed for applications right now." });
    expect(applyBtn().disabled).toBe(true);
    await click(q(".apply-panel .terms-check input"));
    await click(q(".apply-panel .adult-check input"));
    await click(applyBtn());
    expect(api.applyForRole).toHaveBeenCalledWith("web-development-intern");
    expect(q(".apply-panel .alert-error").textContent).toContain("closed for applications");

    api.applyForRole.mockResolvedValue({ ok: true, application: application() });
    api.getMyJobApplications.mockResolvedValue({ ok: true, applications: [application()], terms });
    await click(applyBtn());
    expect(q(".apply-panel .alert-success").textContent).toContain("We'll email you as soon as your aptitude test is ready");
    expect(q(".apply-panel").textContent).toContain("Our team will give you access");
    expect(q('.apply-panel a[href^="/test/"]')).toBeNull();
  });

  it("offers the test once access is given, and to resume one that is under way", async () => {
    await renderApply([application({ status: "test_pending", statusLabel: "Test pending" })]);
    expect(button("Start test", q(".apply-panel")).getAttribute("href")).toBe("/test/a1");
    expect(q(".apply-panel").textContent).not.toMatch(/Pay ₹|Payment received/);

    act(() => root.unmount());
    root = createRoot(container);
    await renderApply([application({ status: "test_pending", statusLabel: "Test pending", attempt: { _id: "t1", status: "in_progress" } })]);
    expect(button("Resume test", q(".apply-panel")).getAttribute("href")).toBe("/test/a1");
  });
});

describe("My Dashboard: My Applications", () => {
  const render = async (applications) => {
    api.getMyJobApplications.mockResolvedValue({ ok: true, applications, terms });
    await act(async () => { root.render(<MemoryRouter><ApplicationsTab onGoToApply={jest.fn()} /></MemoryRouter>); });
  };
  const base = { _id: "a1", opening: { _id: "o1", title: "Web Development Intern" }, createdAt: "2026-10-10T07:00:00.000Z", testAccessAt: "2026-10-10T07:05:00.000Z", interview: null };

  it("shows a submitted test waiting for its result, and never a score", async () => {
    await render([{ ...base, status: "submitted", statusLabel: "Submitted", attempt: { _id: "t1", status: "submitted", submittedAt: "2026-10-10T08:00:00.000Z", submitReason: "time_up", result: { score: 31, maxScore: 40, correctCount: 32, wrongCount: 4 } } }]);
    expect(q(".admin-pill").textContent).toBe("Submitted");
    expect(container.textContent).toContain("Shortlisting result within 7 days");
    expect(container.textContent).toContain("Time ran out");
    // Even if a score were somehow in the data, the page has nowhere to show it.
    expect(container.textContent).not.toMatch(/score|31|correct/i);
    expect(all(".status-track li").map((li) => li.className)).toEqual(["done", "done", "now", "", "", ""]);
    // No test fee, so no receipt for one.
    expect(button("Download Receipt")).toBeFalsy();
  });

  it("shows the interview date in Indian time with the meeting link", async () => {
    await render([{ ...base, status: "interview_scheduled", statusLabel: "Interview scheduled", attempt: null, interview: { at: "2026-10-14T10:00:00.000Z", link: "https://meet.example.com/abc" } }]);
    const box = q(".interview-box");
    expect(box.textContent).toContain("14 Oct 2026");
    expect(box.textContent).toMatch(/3:30\s?pm IST/i); // 10:00 UTC
    expect(box.querySelector("a").getAttribute("href")).toBe("https://meet.example.com/abc");
  });

  it("marks where an application stopped, and says so kindly", async () => {
    await render([{ ...base, status: "not_shortlisted", statusLabel: "Not shortlisted", attempt: null }]);
    expect(all(".status-track li").map((li) => `${li.textContent}:${li.className}`)).toContain("Not shortlisted:stop");
    expect(container.textContent).toContain("You're welcome to apply again");
  });

  it("invites a first application when there are none", async () => {
    await render([]);
    expect(container.textContent).toContain("No applications to show.");
  });
});
