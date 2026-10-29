import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import AdminCourses from "./pages/admin/AdminCourses.jsx";
import * as api from "./services/api.js";

// The admin course form (its optional rich-content fields).
jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.resetAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.className = "";
});

const q = (sel) => container.querySelector(sel);
const qa = (sel) => [...container.querySelectorAll(sel)];

const base = {
  _id: "c1", slug: "web-dev", type: "course", title: "Web Development", tag: "Course", desc: "Learn to build for the web.",
  points: ["Frontend fundamentals"], tiers: [{ tier: "basic", price: 1000, discountPercent: 0, features: [] }],
  durationDays: null, status: "open", outcomes: [], audience: [], prerequisites: [], faqs: [],
};

// The "what are you adding?" choice above the form.
const pick = (label) => act(async () => { qa(".kind-option").find((b) => b.querySelector("b").textContent === label).click(); });

const ctx = (over = {}) => ({ isLoggedIn: false, isAdmin: false, user: null, ...over });

describe("admin course form", () => {
  const fill = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const submit = () => act(async () => { q("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  const renderAdmin = async (entries = [], openings = []) => {
    api.getAdminToken.mockReturnValue("token");
    api.adminGetCourses.mockResolvedValue({ ok: true, courses: entries });
    api.adminCreateCourse.mockResolvedValue({ ok: true, course: { ...base, _id: "new" } });
    api.adminUpdateCourse.mockResolvedValue({ ok: true, course: base });
    api.adminGetJobOpenings.mockResolvedValue({ ok: true, openings, bank: {} });
    await act(async () => {
      root.render(
        <UserContext.Provider value={ctx({ isLoggedIn: true, isAdmin: true, logout: jest.fn() })}>
          <MemoryRouter><AdminCourses /></MemoryRouter>
        </UserContext.Provider>
      );
    });
  };

  it("sends the new lists, one item per line, with blank lines dropped", async () => {
    await renderAdmin();
    await act(async () => { fill(q('input[placeholder="Full Stack (MERN) Development"]'), "Cloud Basics"); });
    await act(async () => { fill(q("#cc-outcomes"), "Build a REST API\n\n  Deploy it  \n"); });
    await act(async () => { fill(q("#cc-audience"), "Final-year students"); });
    await act(async () => { fill(q("#cc-prereq"), "Basic JavaScript\nA laptop"); });
    await act(async () => { fill(q("#plan-basic-price"), "999"); });
    await submit();
    expect(api.adminCreateCourse).toHaveBeenCalledTimes(1);
    expect(api.adminCreateCourse.mock.calls[0][0]).toMatchObject({
      title: "Cloud Basics",
      outcomes: ["Build a REST API", "Deploy it"],
      audience: ["Final-year students"],
      prerequisites: ["Basic JavaScript", "A laptop"],
      faqs: [],
    });
  });

  it("adds, edits and removes questions, and sends the complete ones", async () => {
    await renderAdmin([{ ...base, _id: "c1", type: "internship", tiers: [] }]);
    await act(async () => { qa("button").find((b) => b.textContent === "Edit").click(); });
    const add = () => qa("button").find((b) => b.textContent === "+ Add a question");
    await act(async () => { add().click(); });
    await act(async () => { add().click(); });
    await act(async () => { add().click(); });
    expect(qa(".faq-editor-row")).toHaveLength(3);
    await act(async () => { fill(q('[aria-label="Question 1"]'), "  Is there a certificate?  "); });
    await act(async () => { fill(q('[aria-label="Answer 1"]'), "Yes."); });
    await act(async () => { fill(q('[aria-label="Question 3"]'), "Will this go away?"); });
    await act(async () => { fill(q('[aria-label="Answer 3"]'), "Yes."); });
    // remove the still-empty second row: the third row moves up into its place
    await act(async () => { q('[aria-label="Remove question 2"]').click(); });
    expect(qa(".faq-editor-row")).toHaveLength(2);
    expect(q('[aria-label="Question 2"]').value).toBe("Will this go away?");
    await submit();
    expect(api.adminUpdateCourse).toHaveBeenCalledTimes(1);
    expect(api.adminUpdateCourse.mock.calls[0][1].faqs).toEqual([
      { q: "Is there a certificate?", a: "Yes." },
      { q: "Will this go away?", a: "Yes." },
    ]);
  });

  it("won't save a question without an answer, and says which one", async () => {
    await renderAdmin([{ ...base, _id: "c1", type: "internship", tiers: [] }]);
    await act(async () => { qa("button").find((b) => b.textContent === "Edit").click(); });
    await act(async () => { qa("button").find((b) => b.textContent === "+ Add a question").click(); });
    await act(async () => { fill(q('[aria-label="Question 1"]'), "A question with no answer"); });
    await submit();
    expect(api.adminUpdateCourse).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Question 1 needs both a question and an answer");
  });

  it("stops at 15 questions", async () => {
    await renderAdmin();
    for (let i = 0; i < 20; i += 1) {
      const btn = qa("button").find((b) => b.textContent === "+ Add a question");
      if (btn.disabled) break;
      await act(async () => { btn.click(); });
    }
    expect(qa(".faq-editor-row")).toHaveLength(15);
    expect(qa("button").find((b) => b.textContent === "+ Add a question").disabled).toBe(true);
  });

  it("loads what is already saved into the form when editing", async () => {
    await renderAdmin([{ ...base, _id: "c1", outcomes: ["One", "Two"], audience: ["Students"], prerequisites: ["A laptop"], faqs: [{ q: "Q?", a: "A." }] }]);
    await act(async () => { qa("button").find((b) => b.textContent === "Edit").click(); });
    expect(q("#cc-outcomes").value).toBe("One\nTwo");
    expect(q("#cc-audience").value).toBe("Students");
    expect(q("#cc-prereq").value).toBe("A laptop");
    expect(q('[aria-label="Question 1"]').value).toBe("Q?");
    expect(q('[aria-label="Answer 1"]').value).toBe("A.");
  });

  describe("duration", () => {
    const choose = (el, value) => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const internship = { ...base, _id: "i1", type: "internship", title: "Android Internship", tiers: [], durationDays: null };
    const edit = () => act(async () => { qa("button").find((b) => b.textContent === "Edit").click(); });

    it("offers an internship exactly 15 days, 1 month, 3 months and 6 months (or not set)", async () => {
      await renderAdmin([internship]);
      await edit();
      const select = q("#ac-duration");
      expect(select.tagName).toBe("SELECT");
      expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
        ["", "Not set (access never expires)"], ["15", "15 days"], ["30", "1 month"], ["90", "3 months"], ["180", "6 months"],
      ]);
    });

    it("saves the chosen length as a number of days", async () => {
      await renderAdmin([internship]);
      await edit();
      await act(async () => { choose(q("#ac-duration"), "90"); });
      await submit();
      expect(api.adminUpdateCourse).toHaveBeenCalledTimes(1);
      expect(api.adminUpdateCourse.mock.calls[0][1].durationDays).toBe(90);
    });

    it("keeps a course's duration a free number of days", async () => {
      await renderAdmin();
      expect(q("#ac-duration").tagName).toBe("INPUT");
      await act(async () => { fill(q("#ac-duration"), "45"); });
      expect(q("#ac-duration").value).toBe("45");
    });

    it("drops an odd length when a course is switched to an internship, so it has to be re-picked", async () => {
      await renderAdmin();
      await act(async () => { fill(q("#ac-duration"), "45"); });
      await pick("Paid Internship");
      expect(q("#ac-duration").tagName).toBe("SELECT");
      expect(q("#ac-duration").value).toBe("");
      // ...but a valid one survives the switch.
      await pick("Course");
      await act(async () => { fill(q("#ac-duration"), "30"); });
      await pick("Paid Internship");
      expect(q("#ac-duration").value).toBe("30");
    });

    it("keeps an older internship's other length selectable, labelled as current", async () => {
      await renderAdmin([{ ...internship, durationDays: 45 }]);
      await edit();
      const select = q("#ac-duration");
      expect(select.value).toBe("45");
      expect([...select.options].map((o) => o.textContent)).toContain("45 days (current)");
    });

    it("shows the length the way people say it in the list", async () => {
      await renderAdmin([{ ...internship, durationDays: 90 }, { ...base, _id: "c2", title: "Other course", durationDays: 45 }]);
      expect(container.textContent).toContain("3 months");
      expect(container.textContent).toContain("45 days");
    });
  });

  describe("one form for free internships, paid internships and courses", () => {
    const freeRole = {
      _id: "o9", slug: "free-web", title: "Free Web Intern", audience: "free", status: "open", feeRequired: true, applicants: 0,
      summary: "", techCategory: "web", skills: [], responsibilities: [], eligibility: [], stipend: "", experience: "", duration: "", mode: "",
      positions: { total: 4, filled: 1, left: 3 }, order: 1,
      test: { durationMinutes: 30, questions: 40, marksPerQuestion: 1, negativeMarks: 0.25, cutoffScore: 0, questionCounts: { quantitative: 10, logical: 10, verbal: 10, technical: 10 } },
    };
    const careersRole = { ...freeRole, _id: "o8", slug: "careers-web", title: "Careers Web Intern", audience: "general" };

    it("lists the three kinds apart, and leaves Careers roles out", async () => {
      await renderAdmin([base, { ...base, _id: "i1", type: "internship", title: "Paid Android Internship" }], [freeRole, careersRole]);
      const headings = qa("h3").map((h) => h.textContent);
      expect(headings).toEqual(expect.arrayContaining(["Free internships", "Paid internships", "Courses"]));
      expect(container.textContent).toContain("Free Web Intern");
      expect(container.textContent).toContain("1 of 4 positions filled");
      expect(container.textContent).not.toContain("Careers Web Intern");
    });

    it("saves a free internship as a free-internships-page opening", async () => {
      await renderAdmin();
      api.adminCreateJobOpening.mockResolvedValue({ ok: true, opening: freeRole });
      await pick("Free Internship");
      expect(q("#plan-basic-price")).toBeNull(); // no plans: it isn't sold
      await act(async () => { fill(q("#jo-title"), "Free Data Intern"); });
      await act(async () => { fill(q("#jo-positions"), "6"); });
      await submit();
      expect(api.adminCreateJobOpening).toHaveBeenCalledTimes(1);
      expect(api.adminCreateJobOpening.mock.calls[0][0]).toMatchObject({ title: "Free Data Intern", audience: "free", positions: 6 });
      expect(api.adminCreateCourse).not.toHaveBeenCalled();
    });

    it("saves a paid internship as an internship entry", async () => {
      await renderAdmin();
      await pick("Paid Internship");
      await act(async () => { fill(q('input[placeholder="Full Stack (MERN) Development"]'), "Paid Cloud Internship"); });
      await submit();
      expect(api.adminCreateCourse.mock.calls[0][0]).toMatchObject({ type: "internship", title: "Paid Cloud Internship" });
    });

    it("opens a free internship's Edit in the free-internship form", async () => {
      await renderAdmin([], [freeRole]);
      await act(async () => { qa("button").find((b) => b.textContent === "Edit").click(); });
      expect(q("#jo-title").value).toBe("Free Web Intern");
      expect(q("#jo-positions").value).toBe("4");
      expect(qa(".kind-option").find((b) => b.textContent.startsWith("Course")).disabled).toBe(true);
    });

    it("gives paid internships and courses the same details, and loads them back", async () => {
      await renderAdmin();
      await pick("Paid Internship");
      await act(async () => { fill(q('input[placeholder="Full Stack (MERN) Development"]'), "Paid Cloud Internship"); });
      await act(async () => { fill(q("#cd-positions"), "12"); });
      await act(async () => { fill(q("#cd-stipend"), "Up to ₹5,000/month"); });
      await act(async () => { fill(q("#cd-mode"), "Remote"); });
      await act(async () => { fill(q("#cd-skills"), "React, Node"); });
      await act(async () => { fill(q("#cd-elig"), "Final-year students\n\nA laptop"); });
      await submit();
      expect(api.adminCreateCourse.mock.calls[0][0]).toMatchObject({
        type: "internship", positions: 12, stipend: "Up to ₹5,000/month", mode: "Remote",
        skills: ["React", "Node"], eligibility: ["Final-year students", "A laptop"], responsibilities: [],
      });

      act(() => root.unmount());
      root = createRoot(container);
      await renderAdmin([{ ...base, skills: ["SQL"], stipend: "", experience: "Freshers", mode: "", responsibilities: [], eligibility: [], positions: { total: 5, filled: 5, left: 0 } }]);
      expect(container.textContent).toContain("5 of 5 seats filled — full, can't be bought");
      await act(async () => { qa("button").find((b) => b.textContent === "Edit").click(); });
      expect(q("#cd-positions").value).toBe("5");
      expect(q("#cd-skills").value).toBe("SQL");
      expect(q("#cd-exp").value).toBe("Freshers");
    });

    it("leaves positions blank for no limit, and refuses a bad number", async () => {
      await renderAdmin();
      await act(async () => { fill(q('input[placeholder="Full Stack (MERN) Development"]'), "Cloud Basics"); });
      await act(async () => { fill(q("#plan-basic-price"), "999"); });
      await act(async () => { fill(q("#cd-positions"), "0"); });
      await submit();
      expect(api.adminCreateCourse).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Positions must be a whole number from 1 to 1000");
      await act(async () => { fill(q("#cd-positions"), ""); });
      await submit();
      expect(api.adminCreateCourse.mock.calls[0][0].positions).toBeNull();
    });
  });
});
