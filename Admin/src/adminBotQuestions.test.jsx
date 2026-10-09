import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import AdminBotQuestions from "./pages/admin/AdminBotQuestions.jsx";
import * as api from "./services/api.js";

jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.resetAllMocks();
  jest.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); });

const tick = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const button = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent.startsWith(text));
const weekend = { _id: "q1", question: "is there a weekend batch?", timesAsked: 9, handled: false, lastAskedAt: "2026-10-09T10:00:00.000Z" };
const rust = { _id: "q2", question: "do you teach <b>rust</b>?", timesAsked: 1, handled: false, lastAskedAt: "2026-10-08T10:00:00.000Z" };

async function render() {
  api.getAdminToken.mockReturnValue("token");
  await act(async () => {
    root.render(<UserContext.Provider value={{ logout: jest.fn() }}><MemoryRouter><AdminBotQuestions /></MemoryRouter></UserContext.Provider>);
  });
  await tick();
}

describe("admin help bot questions page", () => {
  it("lists what visitors asked, with counts, as plain text", async () => {
    api.adminGetBotQuestions.mockResolvedValue({ ok: true, questions: [weekend, rust], summary: { open: 2, handled: 5 } });
    await render();

    expect(api.adminGetBotQuestions).toHaveBeenCalledWith({ status: "open", q: "" });
    expect(container.textContent).toContain("is there a weekend batch?");
    expect(container.textContent).toContain("Asked 9 times");
    expect(container.textContent).toContain("Asked 1 time ·");
    // Visitor text must never be rendered as HTML.
    expect(container.textContent).toContain("do you teach <b>rust</b>?");
    expect(container.querySelector("b > b, .admin-row b b")).toBeNull();
    expect(button("To review").textContent).toBe("To review (2)");
    expect(button("Handled").textContent).toBe("Handled (5)");
  });

  it("marks a question handled, then reloads the list", async () => {
    api.adminGetBotQuestions.mockResolvedValueOnce({ ok: true, questions: [weekend], summary: { open: 1, handled: 0 } })
      .mockResolvedValue({ ok: true, questions: [], summary: { open: 0, handled: 1 } });
    api.adminUpdateBotQuestion.mockResolvedValue({ ok: true });
    await render();

    await act(async () => { button("Mark handled").click(); });
    await tick();
    expect(api.adminUpdateBotQuestion).toHaveBeenCalledWith("q1", true);
    expect(container.textContent).toContain("Nothing to review");
  });

  it("switches to the handled list and offers to reopen", async () => {
    api.adminGetBotQuestions.mockImplementation(async ({ status }) => (status === "handled"
      ? { ok: true, questions: [{ ...weekend, handled: true }], summary: { open: 0, handled: 1 } }
      : { ok: true, questions: [], summary: { open: 0, handled: 1 } }));
    api.adminUpdateBotQuestion.mockResolvedValue({ ok: true });
    await render();

    await act(async () => { button("Handled").click(); });
    await tick();
    expect(api.adminGetBotQuestions).toHaveBeenLastCalledWith({ status: "handled", q: "" });
    expect(container.textContent).toContain("is there a weekend batch?");
    await act(async () => { button("Reopen").click(); });
    expect(api.adminUpdateBotQuestion).toHaveBeenCalledWith("q1", false);
  });

  it("deletes only after confirming", async () => {
    api.adminGetBotQuestions.mockResolvedValue({ ok: true, questions: [weekend], summary: { open: 1, handled: 0 } });
    api.adminDeleteBotQuestion.mockResolvedValue({ ok: true });
    await render();

    window.confirm.mockReturnValueOnce(false);
    await act(async () => { button("Delete").click(); });
    expect(api.adminDeleteBotQuestion).not.toHaveBeenCalled();
    await act(async () => { button("Delete").click(); });
    expect(api.adminDeleteBotQuestion).toHaveBeenCalledWith("q1");
  });

  it("searches the questions (debounced)", async () => {
    api.adminGetBotQuestions.mockResolvedValue({ ok: true, questions: [], summary: { open: 0, handled: 0 } });
    await render();

    const input = container.querySelector('input[type="search"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "batch");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await tick(450);
    expect(api.adminGetBotQuestions).toHaveBeenLastCalledWith({ status: "open", q: "batch" });
    expect(container.textContent).toContain("No questions match that search.");
  });

  it("shows an error if the list can't be loaded", async () => {
    api.adminGetBotQuestions.mockResolvedValue({ ok: false, error: "Could not load the questions" });
    await render();
    expect(container.textContent).toContain("Could not load the questions");
  });
});
