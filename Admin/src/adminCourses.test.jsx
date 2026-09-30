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

const ctx = (over = {}) => ({ isLoggedIn: false, isAdmin: false, user: null, ...over });

describe("admin course form", () => {
  const fill = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const submit = () => act(async () => { q("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  const renderAdmin = async (entries = []) => {
    api.getAdminToken.mockReturnValue("token");
    api.adminGetCourses.mockResolvedValue({ ok: true, courses: entries });
    api.adminCreateCourse.mockResolvedValue({ ok: true, course: { ...base, _id: "new" } });
    api.adminUpdateCourse.mockResolvedValue({ ok: true, course: base });
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
});
