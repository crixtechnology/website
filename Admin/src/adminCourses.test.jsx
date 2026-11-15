import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import AdminCourses from "./pages/admin/AdminCourses.jsx";
import * as api from "./services/api.js";

// The admin form for Training + Internship tracks (courses were dropped).
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
  _id: "c1", slug: "web-dev", type: "internship", title: "Web Development", tag: "Flagship", desc: "Learn to build for the web.",
  points: ["Frontend fundamentals"], tiers: [{ tier: "basic", price: 1000, discountPercent: 0, features: [] }],
  durationDays: null, status: "open", outcomes: [], audience: [], prerequisites: [], faqs: [],
};

// What to add is chosen by the Add button pressed: shut the open form, then open that kind's.
const ADD_BUTTON = { "Training + Internship": "+ Add program card", "Free Internship": "+ Add free internship" };
const pick = async (label) => {
  const cancel = qa("form button").find((b) => b.textContent === "Cancel");
  if (cancel) await act(async () => { cancel.click(); });
  await act(async () => { qa(".list-toolbar button").find((b) => b.textContent === ADD_BUTTON[label]).click(); });
};

const ctx = (over = {}) => ({ isLoggedIn: false, isAdmin: false, user: null, ...over });

describe("admin course form", () => {
  const fill = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const submit = () => act(async () => { q("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  const renderAdmin = async (entries = [], openings = [], open = true) => {
    api.getAdminToken.mockReturnValue("token");
    api.adminGetCourses.mockResolvedValue({ ok: true, courses: entries });
    api.adminCreateCourse.mockResolvedValue({ ok: true, course: { ...base, _id: "new" } });
    api.adminUpdateCourse.mockResolvedValue({ ok: true, course: base });
    api.adminGetJobOpenings.mockResolvedValue({ ok: true, openings, bank: {} });
    api.adminGetCareerSettings.mockResolvedValue({ ok: true, settings: { freeApplyFormUrl: "https://forms.gle/eaX7kab7zPG7w6SX6" } });
    await act(async () => {
      root.render(
        <UserContext.Provider value={ctx({ isLoggedIn: true, isAdmin: true, logout: jest.fn() })}>
          <MemoryRouter><AdminCourses /></MemoryRouter>
        </UserContext.Provider>
      );
    });
    // The form is shut until asked for; most tests here are about the form, so
    // open a blank one. With only free internships to show, switch to their list.
    if (open) await act(async () => { qa(".list-toolbar button").find((b) => b.textContent === "+ Add program card").click(); });
    if (openings.length && !entries.length) await showList("Free internships");
  };
  const showList = (label) => act(async () => { qa(".list-tab").find((b) => b.textContent.startsWith(label)).click(); });

  it("opens on the lists, with the form behind an Add button, and shuts the form again on Cancel", async () => {
    await renderAdmin([base], [], false);
    expect(q("form.admin-form:not(.form-link-editor)")).toBeNull();
    expect(qa(".admin-row b").map((b) => b.textContent)).toEqual(["Web Development"]);
    await act(async () => { qa(".list-toolbar button").find((b) => b.textContent === "+ Add program card").click(); });
    expect(q("#courses-title")).not.toBeNull();
    await act(async () => { qa("form button").find((b) => b.textContent === "Cancel").click(); });
    expect(q("#courses-title")).toBeNull();
    // Edit opens it filled in.
    await act(async () => { qa(".admin-row button").find((b) => b.textContent === "Edit").click(); });
    expect(q("#courses-title").value).toBe("Web Development");
  });

  it("shows one list at a time, and filters program cards by duration and search", async () => {
    const card = (id, title, days, group = "") => ({ ...base, _id: id, title, durationDays: days, group });
    const free = { _id: "f1", slug: "free", title: "Free Web Intern", audience: "free", status: "open", applicants: 0, skills: [], duration: "3 months",
      positions: { total: 4, filled: 0, left: 4 }, test: { durationMinutes: 30, questions: 0, marksPerQuestion: 1, cutoffScore: 0, questionCounts: {} } };
    await renderAdmin([card("a", "MERN 1M", 30, "MERN"), card("b", "MERN 3M", 90, "MERN"), card("c", "Cyber Security", 90)], [free], false);
    const titles = () => qa(".admin-row b").map((b) => b.textContent);
    expect(qa(".list-tab").map((b) => b.textContent)).toEqual(["Program cards 3", "Free internships 1"]);
    expect(titles()).toEqual(["MERN 1M", "MERN 3M", "Cyber Security"]);
    const pill = (label) => act(async () => { qa(".filter-pill").find((b) => b.textContent === label).click(); });
    expect(qa(".filter-pill").map((b) => b.textContent)).toEqual(["All", "1 month", "2 months", "3 months", "6 months"]);
    await pill("3 months");
    expect(titles()).toEqual(["MERN 3M", "Cyber Security"]);
    await act(async () => { fill(q(".admin-search"), "mern"); });
    expect(titles()).toEqual(["MERN 3M"]);
    await pill("2 months");
    expect(titles()).toEqual([]);
    expect(container.textContent).toContain("No program cards match.");
    await act(async () => { fill(q(".admin-search"), ""); });
    await showList("Free internships");
    expect(titles()).toEqual(["Free Web Intern"]);
    expect(q(".filter-pills")).toBeNull();
  });

  it("gives every track an Open/Closed switch, apply-only ones too, and tidies the row text", async () => {
    const applyOnly = { ...base, _id: "c2", title: "Python Developer", tag: "", tiers: [], status: "closed" };
    await renderAdmin([base, applyOnly]);
    const row = (title) => qa(".admin-row").find((r) => r.querySelector("b").textContent === title);
    const toggle = (title) => row(title).querySelector("button.status-toggle");
    expect(toggle("Web Development").textContent).toBe("Open");
    expect(toggle("Python Developer").textContent).toBe("Closed");
    // No tag: no stray "Apply-only · · 3 months".
    expect(row("Python Developer").querySelector(".admin-row-meta").textContent).not.toContain("· ·");
    await act(async () => { toggle("Python Developer").click(); });
    expect(api.adminUpdateCourse).toHaveBeenCalledWith("c2", { status: "open" });
    await act(async () => { toggle("Web Development").click(); });
    expect(api.adminUpdateCourse).toHaveBeenCalledWith("c1", { status: "closed" });
  });

  it("copies a card into the form as a new one, so only what differs needs changing", async () => {
    const card = { ...base, durationDays: 30, group: "Web", skills: ["HTML", "CSS"], stipend: "Up to ₹3,000/month", mode: "Remote",
      tiers: [{ tier: "basic", price: 1999, discountPercent: 10, features: ["Live classes"] }] };
    await renderAdmin([card]);
    await act(async () => { qa(".admin-row button").find((b) => b.textContent === "Copy").click(); });
    expect(q("form h3").textContent).toBe("Add a copy of a program card");
    expect(q(".copy-note").textContent).toContain("Web Development");
    expect(q("#courses-title").value).toBe("Web Development");
    expect(q("#ac-duration").value).toBe("30");
    // The older "price + 10% off" loads as an original and a final price.
    expect(q("#plan-basic-original").value).toBe("1999");
    expect(q("#plan-basic-price").value).toBe("1799");
    // Change the length and the price, then Create: a new card, the original untouched.
    await act(async () => {
      const select = q("#ac-duration");
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, "90");
      select.dispatchEvent(new Event("change", { bubbles: true }));
      fill(q("#plan-basic-original"), "6999");
      fill(q("#plan-basic-price"), "4999");
    });
    await submit();
    expect(api.adminUpdateCourse).not.toHaveBeenCalled();
    expect(api.adminCreateCourse).toHaveBeenCalledTimes(1);
    const sent = api.adminCreateCourse.mock.calls[0][0];
    expect(sent).toMatchObject({ title: "Web Development", durationDays: 90, group: "Web", skills: ["HTML", "CSS"], stipend: "Up to ₹3,000/month", mode: "Remote" });
    expect(sent.tiers.find((t) => t.tier === "basic")).toMatchObject({ price: 4999, originalPrice: 6999, discountPercent: 0, features: ["Live classes"] });
    // Saved: the form shuts, back to the list.
    expect(q("#courses-title")).toBeNull();
  });

  it("has one price to set — no Plus or Pro boxes, and no extra page-details section", async () => {
    await renderAdmin();
    expect(q("#plan-basic-price")).not.toBeNull();
    expect(q("#plan-plus-price")).toBeNull();
    expect(q("#plan-pro-price")).toBeNull();
    for (const id of ["#cc-outcomes", "#cc-audience", "#cc-prereq", ".faq-editor"]) expect(q(id)).toBeNull();
    expect(qa("button").map((b) => b.textContent)).not.toContain("+ Add a question");
    await act(async () => { fill(q("#courses-title"), "Cloud Basics"); });
    await act(async () => { fill(q("#plan-basic-price"), "999"); });
    await act(async () => { fill(q("#plan-basic-features"), "Live classes\n\n  Mentor support  "); });
    await submit();
    expect(api.adminCreateCourse).toHaveBeenCalledTimes(1);
    const sent = api.adminCreateCourse.mock.calls[0][0];
    expect(sent.tiers).toEqual([{ tier: "basic", price: 999, originalPrice: null, discountPercent: 0, features: ["Live classes", "Mentor support"] }]);
    expect(sent).toMatchObject({ title: "Cloud Basics", outcomes: [], audience: [], prerequisites: [], faqs: [] });
  });

  it("keeps a card's existing page details when it is edited, though they can't be changed here", async () => {
    await renderAdmin([{ ...base, _id: "c1", outcomes: ["One", "Two"], audience: ["Students"], prerequisites: ["A laptop"], faqs: [{ q: "Q?", a: "A." }] }]);
    await act(async () => { qa("button").find((b) => b.textContent === "Edit").click(); });
    await submit();
    expect(api.adminUpdateCourse.mock.calls[0][1]).toMatchObject({
      outcomes: ["One", "Two"], audience: ["Students"], prerequisites: ["A laptop"], faqs: [{ q: "Q?", a: "A." }],
    });
  });

  it("warns that saving drops a card's older Plus or Pro plan, and sends only the one price", async () => {
    const old = { ...base, _id: "c1", tiers: [
      { tier: "basic", price: 1000, discountPercent: 0, features: [] }, { tier: "pro", price: 3000, discountPercent: 0, features: ["1:1 mentoring"] },
    ] };
    await renderAdmin([old]);
    // The list still says what it has.
    expect(qa(".admin-row-meta")[0].textContent).toContain("Basic · Pro · from ₹1,000");
    await act(async () => { qa("button").find((b) => b.textContent === "Edit").click(); });
    expect(container.textContent).toContain("Saving keeps only the one price below and removes those plans.");
    await submit();
    expect(api.adminUpdateCourse.mock.calls[0][1].tiers).toEqual([{ tier: "basic", price: 1000, originalPrice: null, discountPercent: 0, features: [] }]);
  });

  it("takes an original price and a final price, previews the crossed-out price, and checks they make sense", async () => {
    await renderAdmin();
    expect(q("#plan-basic-discount")).toBeNull(); // no % box: the final price is typed as it is
    await act(async () => { fill(q("#courses-title"), "Cyber Security"); });
    await act(async () => { fill(q("#plan-basic-original"), "1999"); });
    // An original price alone has nothing to sit beside.
    await submit();
    expect(container.textContent).toContain("Enter the final price too");
    // It must be the higher of the two.
    await act(async () => { fill(q("#plan-basic-price"), "2499"); });
    expect(q(".price-preview")).toBeNull();
    await submit();
    expect(container.textContent).toContain("The original price must be higher than the final price");
    expect(api.adminCreateCourse).not.toHaveBeenCalled();

    await act(async () => { fill(q("#plan-basic-price"), "1499"); });
    expect(q(".price-preview .price-old").textContent).toBe("₹1,999");
    expect(q(".price-preview").textContent).toContain("₹1,499");
    expect(q(".price-preview .price-off").textContent).toBe("25% off");
    await submit();
    expect(api.adminCreateCourse.mock.calls[0][0].tiers).toEqual([{ tier: "basic", price: 1499, originalPrice: 1999, discountPercent: 0, features: [] }]);
  });

  it("shows the crossed-out price in the list and loads both prices back for editing", async () => {
    await renderAdmin([{ ...base, tiers: [{ tier: "basic", price: 1499, originalPrice: 1999, discountPercent: 0, features: [] }] }]);
    expect(qa(".admin-row-meta")[0].textContent).toContain("₹1,499 (was ₹1,999)");
    await act(async () => { qa("button").find((b) => b.textContent === "Edit").click(); });
    expect(q("#plan-basic-original").value).toBe("1999");
    expect(q("#plan-basic-price").value).toBe("1499");
  });

  describe("duration", () => {
    const choose = (el, value) => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const internship = { ...base, _id: "i1", type: "internship", title: "Android Internship", tiers: [], durationDays: null };
    const edit = () => act(async () => { qa("button").find((b) => b.textContent === "Edit").click(); });

    it("offers a program exactly 1, 2, 3 and 6 months (or not set)", async () => {
      await renderAdmin([internship]);
      await edit();
      const select = q("#ac-duration");
      expect(select.tagName).toBe("SELECT");
      expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
        ["", "Not set (access never expires)"], ["30", "1 month"], ["60", "2 months"], ["90", "3 months"], ["180", "6 months"],
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


    it("keeps an older internship's other length selectable, labelled as current", async () => {
      await renderAdmin([{ ...internship, durationDays: 45 }]);
      await edit();
      const select = q("#ac-duration");
      expect(select.value).toBe("45");
      expect([...select.options].map((o) => o.textContent)).toContain("45 days (current)");
    });

    it("shows the length the way people say it in the list", async () => {
      await renderAdmin([{ ...internship, durationDays: 90 }, { ...base, _id: "c2", title: "Older track", durationDays: 45 }]);
      expect(container.textContent).toContain("3 months");
      expect(container.textContent).toContain("45 days");
    });
  });

  describe("one form for Training + Internship tracks and free internships", () => {
    const freeRole = {
      _id: "o9", slug: "free-web", title: "Free Web Intern", audience: "free", status: "open", applicants: 0,
      summary: "", techCategory: "web", skills: [], responsibilities: [], eligibility: [], stipend: "", experience: "", duration: "", mode: "",
      positions: { total: 4, filled: 1, left: 3 }, order: 1,
      test: { durationMinutes: 30, questions: 40, marksPerQuestion: 1, cutoffScore: 0, questionCounts: { quantitative: 10, logical: 10, verbal: 10, technical: 10 } },
    };
    const careersRole = { ...freeRole, _id: "o8", slug: "careers-web", title: "Careers Web Intern", audience: "general" };

    it("copies a free internship into the form as a new one", async () => {
      api.adminCreateJobOpening.mockResolvedValue({ ok: true });
      const role = { ...freeRole, summary: "Build pages.", skills: ["HTML"], duration: "3 months", group: "Web", stipend: "Unpaid", order: 4 };
      await renderAdmin([], [role]);
      await act(async () => { qa(".admin-row button").find((b) => b.textContent === "Copy").click(); });
      expect(q("form h3").textContent).toBe("Add a copy of a free internship");
      expect(q(".copy-note").textContent).toContain("Free Web Intern");
      expect(q("#jo-title").value).toBe("Free Web Intern");
      expect(q("#jo-order")).toBeNull(); // no Display order box: a copy goes last
      await act(async () => { fill(q("#jo-duration"), "6 months"); });
      await submit();
      expect(api.adminUpdateJobOpening).not.toHaveBeenCalled();
      expect(api.adminCreateJobOpening).toHaveBeenCalledTimes(1);
      expect(api.adminCreateJobOpening.mock.calls[0][0]).toMatchObject({
        title: "Free Web Intern", summary: "Build pages.", skills: ["HTML"], duration: "6 months", group: "Web", positions: 4, audience: "free",
      });
      expect(api.adminCreateJobOpening.mock.calls[0][0].order).toBeUndefined();
    });

    it("lists the two kinds apart, offers no Course, and leaves Careers roles out", async () => {
      await renderAdmin([base, { ...base, _id: "i1", type: "internship", title: "Paid Android Internship" }], [freeRole, careersRole]);
      // Each kind has its own list, one showing at a time.
      expect(qa(".list-tab").map((b) => b.textContent)).toEqual(["Program cards 2", "Free internships 1"]);
      expect(qa("h3").map((h) => h.textContent)).toContain("Training + Internship program cards");
      expect(qa("h3").map((h) => h.textContent)).not.toContain("Courses");
      expect(q(".kind-option")).toBeNull(); // the kind is chosen by the Add button, not inside the form
      expect(container.textContent).not.toContain("Free Web Intern");
      await showList("Free internships");
      expect(qa("h3").map((h) => h.textContent)).toContain("Free internships");
      expect(container.textContent).toContain("Free Web Intern");
      expect(container.textContent).toContain("4 positions"); // applications are in the Google Form, so none are counted here
      expect(container.textContent).not.toContain("Careers Web Intern");
    });

    it("saves a free internship as a free-internships-page opening", async () => {
      await renderAdmin();
      api.adminCreateJobOpening.mockResolvedValue({ ok: true, opening: freeRole });
      await pick("Free Internship");
      expect(q("#plan-basic-price")).toBeNull(); // no plans: it isn't sold
      await act(async () => { fill(q("#jo-title"), "Free Data Intern"); });
      await act(async () => { fill(q("#jo-positions"), "6"); });
      await act(async () => { fill(q("#jo-starts-on"), " 2nd week of January "); });
      await act(async () => { fill(q("#jo-group"), " Data Science / Analytics "); });
      await submit();
      expect(api.adminCreateJobOpening).toHaveBeenCalledTimes(1);
      expect(api.adminCreateJobOpening.mock.calls[0][0]).toMatchObject({ title: "Free Data Intern", audience: "free", positions: 6, startsOn: "2nd week of January", group: "Data Science / Analytics" });
      expect(api.adminCreateCourse).not.toHaveBeenCalled();
    });

    it("has no fee to set on a free internship: applying and the test are free", async () => {
      await renderAdmin([], [freeRole]);
      expect(container.textContent).toContain("free to apply");
      api.adminCreateJobOpening.mockResolvedValue({ ok: true, opening: freeRole });
      await pick("Free Internship");
      expect(q("#jo-fee")).toBeNull();
      expect(q("#jo-fee-amount")).toBeNull();
      expect(qa("button").some((b) => b.textContent === "Save fee")).toBe(false);
      await act(async () => { fill(q("#jo-title"), "No-fee Intern"); });
      await act(async () => { fill(q("#jo-positions"), "3"); });
      await submit();
      const sent = api.adminCreateJobOpening.mock.calls[0][0];
      expect(sent).toMatchObject({ audience: "free" });
      expect(sent).not.toHaveProperty("waiveFee");
      expect(sent).not.toHaveProperty("feeRequired");
    });

    it("has no aptitude-test fields on a free internship: it is applied for through the Google Form", async () => {
      await renderAdmin([], [freeRole]);
      // The list row doesn't quote a test either.
      expect(container.textContent).toContain("applies through the Google Form");
      expect(container.textContent).not.toMatch(/questions in \d+ min|cut-off/);
      api.adminCreateJobOpening.mockResolvedValue({ ok: true, opening: freeRole });
      await pick("Free Internship");
      for (const id of ["jo-tech", "jo-mins", "jo-quantitative", "jo-logical", "jo-verbal", "jo-technical", "jo-marks", "jo-cutoff"]) {
        expect(q(`#${id}`)).toBeNull();
      }
      expect(container.textContent).toContain("No test settings here");
      await act(async () => { fill(q("#jo-title"), "Form Intern"); });
      await act(async () => { fill(q("#jo-positions"), "4"); });
      await submit();
      const sent = api.adminCreateJobOpening.mock.calls[0][0];
      expect(sent).toMatchObject({ title: "Form Intern", audience: "free", positions: 4 });
      for (const key of ["techCategory", "durationMinutes", "questionCounts", "marksPerQuestion", "cutoffScore"]) expect(sent).not.toHaveProperty(key);
    });

    it("edits the free internships application form link under Free internships, saved on its own", async () => {
      await renderAdmin([], [freeRole]);
      const input = q("#free-form-link");
      expect(input.value).toBe("https://forms.gle/eaX7kab7zPG7w6SX6");
      const saveBtn = () => qa("button").find((b) => b.textContent === "Save link");
      expect(saveBtn().disabled).toBe(true); // nothing changed yet
      expect(qa("a").find((a) => a.textContent.startsWith("Open form")).getAttribute("href")).toBe("https://forms.gle/eaX7kab7zPG7w6SX6");

      // Not a full https link: refused here, nothing sent.
      await act(async () => { fill(input, "forms.gle/abc"); });
      await act(async () => { saveBtn().click(); });
      expect(api.adminUpdateCareerSettings).not.toHaveBeenCalled();
      expect(container.textContent).toContain("starting with https://");

      api.adminUpdateCareerSettings.mockResolvedValue({ ok: true, settings: { freeApplyFormUrl: "https://forms.gle/NewForm123" } });
      await act(async () => { fill(input, " https://forms.gle/NewForm123 "); });
      await act(async () => { saveBtn().click(); });
      expect(api.adminUpdateCareerSettings).toHaveBeenCalledWith({ freeApplyFormUrl: "https://forms.gle/NewForm123" });
      expect(container.textContent).toContain("Saved — Apply Now on every free internship now opens this form.");
      expect(api.adminCreateJobOpening).not.toHaveBeenCalled(); // saving the link doesn't submit the role form
    });

    it("saves a Training + Internship track as an internship entry", async () => {
      await renderAdmin();
      await pick("Training + Internship");
      await act(async () => { fill(q('input[placeholder="Full Stack (MERN) Development"]'), "Paid Cloud Internship"); });
      await submit();
      expect(api.adminCreateCourse.mock.calls[0][0]).toMatchObject({ type: "internship", title: "Paid Cloud Internship" });
    });

    it("saves an optional domain group and Starting from tag", async () => {
      await renderAdmin();
      await pick("Training + Internship");
      await act(async () => {
        fill(q('input[placeholder="Full Stack (MERN) Development"]'), "MERN Training");
        fill(q("#courses-group"), " MERN Stack ");
        fill(q("#courses-starting-from"), "15 December");
      });
      await submit();
      expect(api.adminCreateCourse.mock.calls[0][0]).toMatchObject({ group: "MERN Stack", startingFrom: "15 December" });
    });

    it("lays the training form out like the Free Internship one, with no test and Starts on as text", async () => {
      await renderAdmin();
      const labels = qa("form label").map((l) => l.textContent);
      // Same fields, same order as the Free Internship / Careers form…
      const order = ["Title", "Short description", "Skills (separate with commas)", "Responsibilities (one per line)", "Eligibility (one per line)",
        "Positions available", "Stipend (selected interns only)", "Experience", "Duration", "Mode", "Starts on (optional)"];
      expect(labels.filter((l) => order.includes(l))).toEqual(order);
      // …with no tag, points or exact date, and its fee where those have the aptitude test.
      expect(labels).not.toContain("Tag");
      expect(labels).not.toContain("Points (one per line)");
      expect(q('input[type="date"]')).toBeNull();
      expect(q("#courses-starting-from").type).toBe("text");
      const headings = qa("form h3").map((h) => h.textContent);
      expect(headings).toContain("Price for this program");
      expect(headings.join(" ")).not.toMatch(/aptitude test/i);
      expect(container.textContent).toContain("pay online (Razorpay)");
    });

    it("saves Starts on as text and clears any old exact start date", async () => {
      await renderAdmin([{ ...base, _id: "t1", startsAt: "2026-12-01T00:00:00.000Z" }]);
      await act(async () => { qa("button").find((b) => b.textContent === "Edit").click(); });
      await act(async () => { fill(q("#courses-starting-from"), "2nd week of January"); });
      await submit();
      expect(api.adminUpdateCourse.mock.calls[0][1]).toMatchObject({ startingFrom: "2nd week of January", startsAt: "" });
    });

    it("won't save a ₹0 training fee — training is paid, not free", async () => {
      await renderAdmin();
      await pick("Training + Internship");
      await act(async () => {
        fill(q('input[placeholder="Full Stack (MERN) Development"]'), "Cloud Training");
        fill(q("#plan-basic-price"), "0");
      });
      await submit();
      expect(api.adminCreateCourse).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Training is paid, not free");
    });

    it("opens a free internship's Edit in the free-internship form", async () => {
      await renderAdmin([], [freeRole]);
      await act(async () => { qa("button").find((b) => b.textContent === "Edit").click(); });
      expect(q("#jo-title").value).toBe("Free Web Intern");
      expect(q("#jo-positions").value).toBe("4");
      expect(q("#jo-title")).not.toBeNull(); // the free-internship form, not the program card one
      expect(q("#courses-title")).toBeNull();
    });

    it("saves a training track's details, and loads them back", async () => {
      await renderAdmin();
      await pick("Training + Internship");
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
      expect(container.textContent).toContain("5 of 5 positions filled — full, can't be bought");
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
