import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import { CourseDetail } from "./pages/pages.jsx";
import AdminCourses from "./pages/admin/AdminCourses.jsx";
import * as api from "./services/api.js";

// The richer course / internship page: key facts, "what you'll learn" / "who it's for" /
// prerequisites, FAQs, related programs, a sticky Enroll bar on phones, and the admin form
// that fills the optional content in. Anything left empty must simply not appear.
jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.resetAllMocks();
  api.getMyEnrollments.mockResolvedValue({ ok: true, enrollments: [] });
  api.getCourses.mockResolvedValue({ ok: true, courses: [] });
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

const ctx = (over = {}) => ({ isLoggedIn: false, isAdmin: false, user: null, openAuthModal: jest.fn(), ...over });
const renderPage = async (course, over) => {
  api.getCourse.mockResolvedValue({ ok: true, course });
  await act(async () => {
    root.render(
      <UserContext.Provider value={ctx(over)}>
        <MemoryRouter initialEntries={[`/programs/${course.slug}`]}>
          <Routes><Route path="/programs/:slug" element={<CourseDetail />} /></Routes>
        </MemoryRouter>
      </UserContext.Provider>
    );
  });
};

describe("a course nobody has filled in yet", () => {
  it("shows no empty sections", async () => {
    await renderPage(base);
    expect(q("h1").textContent).toContain("Web Development");
    expect(container.textContent).not.toContain("What you'll learn");
    expect(container.textContent).not.toContain("Who it's for");
    expect(container.textContent).not.toContain("Before you start");
    expect(q(".faq-list")).toBeNull();
    expect(q(".related-grid")).toBeNull(); // no other programs to suggest
  });
});

describe("key facts", () => {
  it("say what it is, that it is online, and what it costs — nothing invented", async () => {
    await renderPage(base);
    const facts = Object.fromEntries(qa(".course-facts > div").map((d) => [d.querySelector("dt").textContent, d.querySelector("dd").textContent]));
    expect(facts).toEqual({ Type: "Course", Format: "Online", Access: "Lifetime", From: "₹1,000" });
  });

  it("show the duration when there is one, and drop the price for a closed course", async () => {
    await renderPage({ ...base, durationDays: 90, status: "closed" });
    const text = q(".course-facts").textContent;
    expect(text).toContain("Duration90 days");
    expect(text).not.toContain("Lifetime");
    expect(text).not.toContain("From");
  });

  it("call an internship an internship, with no lifetime-access claim", async () => {
    await renderPage({ ...base, type: "internship", tiers: [], durationDays: 45 });
    const text = q(".course-facts").textContent;
    expect(text).toContain("TypeInternship");
    expect(text).toContain("45 days");
    expect(text).not.toContain("Lifetime");
  });
});

describe("what the admin typed in", () => {
  const rich = { ...base, outcomes: ["Build a REST API", "Deploy it"], audience: ["Final-year students"], prerequisites: ["Basic JavaScript"], faqs: [{ q: "Is there a certificate?", a: "Yes, on completion." }] };

  it("appears as its own sections, under real headings", async () => {
    await renderPage(rich);
    const headings = qa("h2").map((h) => h.textContent);
    expect(headings).toEqual(expect.arrayContaining(["What you'll learn", "Who it's for", "Before you start", "Questions"]));
    expect(qa(".check-list li").map((li) => li.textContent)).toEqual(["Build a REST API", "Deploy it"]);
    expect(qa(".dash-list li").map((li) => li.textContent)).toEqual(["Final-year students", "Basic JavaScript"]);
  });

  it("shows only the sections that have something in them", async () => {
    await renderPage({ ...base, prerequisites: ["A laptop"] });
    expect(container.textContent).toContain("Before you start");
    expect(container.textContent).not.toContain("What you'll learn");
    expect(container.textContent).not.toContain("Who it's for");
  });

  it("puts each FAQ answer behind its question, closed until opened", async () => {
    await renderPage(rich);
    const item = q("details.faq");
    expect(item.querySelector("summary").textContent).toBe("Is there a certificate?");
    expect(item.querySelector("p").textContent).toBe("Yes, on completion.");
    expect(item.open).toBe(false);
  });

  it("ignores a malformed FAQ row rather than crashing the page", async () => {
    await renderPage({ ...base, faqs: [null, { q: "No answer" }, { q: "Fine?", a: "Yes." }], outcomes: [" ", 5] });
    expect(qa("details.faq")).toHaveLength(1);
    expect(container.textContent).not.toContain("What you'll learn");
  });

  it("is shown as text, never as markup", async () => {
    await renderPage({ ...base, outcomes: ["<img src=x onerror=alert(1)>"] });
    expect(q(".check-list li").textContent).toBe("<img src=x onerror=alert(1)>");
    expect(q(".check-list img")).toBeNull();
  });
});

describe("related programs", () => {
  const others = [
    { _id: "a", slug: "web-dev", type: "course", title: "Web Development", desc: "self", status: "open" },
    { _id: "b", slug: "closed-course", type: "course", title: "Closed Course", desc: "d", status: "closed" },
    { _id: "c", slug: "an-internship", type: "internship", title: "An Internship", desc: "d", status: "open" },
    { _id: "d", slug: "open-course", type: "course", title: "Open Course", desc: "d", status: "open" },
    { _id: "e", slug: "another-course", type: "course", title: "Another Course", desc: "d", status: "open" },
    { _id: "f", slug: "third-course", type: "course", title: "Third Course", desc: "d", status: "open" },
  ];

  it("suggest three others: never this one, the same kind first, open before closed", async () => {
    api.getCourses.mockResolvedValue({ ok: true, courses: others });
    await renderPage(base);
    const links = qa("a.related-card").map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/programs/open-course", "/programs/another-course", "/programs/third-course"]);
    expect(qa(".related-card h3")).toHaveLength(3);
  });

  it("stay out of the way when the request fails", async () => {
    api.getCourses.mockResolvedValue({ ok: false });
    await renderPage(base);
    expect(q(".related-grid")).toBeNull();
    expect(q("h1").textContent).toContain("Web Development");
  });
});

describe("search-engine markup", () => {
  const ld = () => document.head.querySelector("script#course-jsonld");

  it("describes the course, and leaves when the page does", async () => {
    await renderPage({ ...base, durationDays: 30, outcomes: ["Build a REST API"] });
    const data = JSON.parse(ld().textContent);
    expect(data).toMatchObject({ "@type": "Course", name: "Web Development", provider: { name: "Crix Technology" }, teaches: ["Build a REST API"] });
    expect(data.hasCourseInstance).toMatchObject({ courseMode: "online", courseWorkload: "P30D" });
    act(() => root.unmount());
    expect(ld()).toBeNull();
    root = createRoot(container);
  });

  it("can't be closed early by admin-entered text", async () => {
    await renderPage({ ...base, outcomes: ["</script><script>alert(1)</script>"] });
    expect(ld().textContent).not.toContain("</script>");
    expect(JSON.parse(ld().textContent).teaches).toEqual(["</script><script>alert(1)</script>"]);
  });
});

describe("the sticky enroll bar", () => {
  let observers;
  beforeEach(() => {
    observers = [];
    window.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; observers.push(this); this.target = null; }
      observe(el) { this.target = el; }
      unobserve() {}
      disconnect() { this.gone = true; }
    };
  });
  // The page's own button ("#course-cta") and the footer are what the bar watches.
  const setSeen = async (selectorMatch, isIntersecting) => {
    await act(async () => {
      observers.filter((o) => !o.gone && o.target && o.target.matches && o.target.matches(selectorMatch)).forEach((o) => o.cb([{ isIntersecting }]));
    });
  };
  const bar = () => q(".enroll-bar");

  it("stays hidden while the page's own button is on screen, and appears once it scrolls away", async () => {
    await renderPage(base);
    expect(bar().classList.contains("show")).toBe(false);
    expect(bar().getAttribute("aria-hidden")).toBe("true");
    expect(bar().querySelector("button").tabIndex).toBe(-1);

    await setSeen("#course-cta", false);
    expect(bar().classList.contains("show")).toBe(true);
    expect(bar().hasAttribute("aria-hidden")).toBe(false);
    expect(bar().querySelector("button").tabIndex).toBe(0);
    expect(document.body.classList.contains("has-enroll-bar")).toBe(true);

    await setSeen("#course-cta", true);
    expect(bar().classList.contains("show")).toBe(false);
    expect(document.body.classList.contains("has-enroll-bar")).toBe(false);
  });

  it("steps aside for the footer too", async () => {
    document.body.appendChild(Object.assign(document.createElement("footer"), { id: "test-footer" }));
    try {
      await renderPage(base);
      await setSeen("#course-cta", false);
      expect(bar().classList.contains("show")).toBe(true);
      await setSeen("footer", true);
      expect(bar().classList.contains("show")).toBe(false);
    } finally {
      document.getElementById("test-footer").remove();
    }
  });

  it("offers 'Choose a plan' on a course that is on sale, with its starting price", async () => {
    await renderPage(base);
    expect(bar().textContent).toContain("Web Development");
    expect(bar().textContent).toContain("From ₹1,000");
    expect(bar().querySelector("button").textContent).toBe("Choose a plan");
    expect(q("#plans")).not.toBeNull();
  });

  it("offers a request form on an internship, and opens it", async () => {
    await renderPage({ ...base, type: "internship", tiers: [], slug: "intern" });
    const btn = bar().querySelector("button");
    expect(btn.textContent).toBe("Request to apply");
    await setSeen("#course-cta", false);
    await act(async () => { btn.click(); });
    expect(document.body.textContent).toMatch(/apply|request/i);
    expect(q(".modal-box, [role='dialog']")).not.toBeNull();
  });

  it("is not shown to an admin, who has no plan to buy", async () => {
    await renderPage(base, { isLoggedIn: true, isAdmin: true, user: { name: "Admin", role: "admin" } });
    expect(bar()).toBeNull();
  });

  it("removes its body flag when the page goes", async () => {
    await renderPage(base);
    await setSeen("#course-cta", false);
    expect(document.body.classList.contains("has-enroll-bar")).toBe(true);
    act(() => root.unmount());
    expect(document.body.classList.contains("has-enroll-bar")).toBe(false);
    root = createRoot(container);
  });
});

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
