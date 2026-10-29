import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { Contact } from "./pages/pages.jsx";
import * as api from "./services/api.js";

// Form fields say what's wrong right under themselves as the visitor types —
// once a field has been left, or after a submit attempt — and an email whose
// domain can't take mail is caught (with a one-click fix for a typo'd
// provider) before anything is sent. See hooks/useTouched.js, useEmailCheck.js.
jest.mock("./services/api.js");

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  jest.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.resetAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

const render = async (ui) => { await act(async () => { root.render(ui); }); };
function fill(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const q = (sel) => container.querySelector(sel);
const type = async (sel, value) => { await act(async () => { fill(q(sel), value); }); };
// React listens for focusout, which is what a real blur dispatches too.
const leave = async (sel) => { await act(async () => { q(sel).dispatchEvent(new FocusEvent("focusout", { bubbles: true })); }); };
const pause = async () => { await act(async () => { jest.advanceTimersByTime(600); }); };
const submit = async () => { await act(async () => { q("#c-name").closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); };

describe("live field errors", () => {
  it("stays quiet on an untouched form, then shows a field's error once it's left", async () => {
    await render(<MemoryRouter><Contact /></MemoryRouter>);
    expect(q("#c-name-err")).toBeNull();

    await type("#c-name", "R2D2");
    expect(q("#c-name-err")).toBeNull(); // still typing — not judged yet
    await leave("#c-name");
    expect(q("#c-name-err").textContent).toMatch(/letters only/);
    expect(q("#c-name").getAttribute("aria-invalid")).toBe("true");

    // Fixing it clears the error live, without another blur.
    await type("#c-name", "Riya Shah");
    expect(q("#c-name-err")).toBeNull();
  });

  it("marks every bad field on a submit attempt and sends nothing", async () => {
    await render(<MemoryRouter><Contact /></MemoryRouter>);
    await submit();
    expect(q("#c-name-err").textContent).toMatch(/Enter your name/);
    expect(q("#c-email-err").textContent).toMatch(/Enter your email/);
    expect(q("#c-message-err").textContent).toMatch(/message/);
    expect(api.submitContact).not.toHaveBeenCalled();
  });

  it("flags an email whose domain is a typo and fills in the fix in one click", async () => {
    api.checkEmailDomain.mockResolvedValue({ valid: false, error: 'Did you mean riya@gmail.com? "gmial.com" looks like a typo.', suggestion: "riya@gmail.com" });
    await render(<MemoryRouter><Contact /></MemoryRouter>);

    await type("#c-email", "riya@gmial.com");
    await pause();
    expect(api.checkEmailDomain).toHaveBeenCalledWith("riya@gmial.com");
    expect(q("#c-email-err").textContent).toMatch(/Did you mean riya@gmail.com/);

    await act(async () => { q("#c-email-err button").click(); });
    expect(q("#c-email").value).toBe("riya@gmail.com");
  });

  it("won't send a message to a domain that can't take mail", async () => {
    api.checkEmailDomain.mockResolvedValue({ valid: false, error: '"nowhere.invalid" can\'t receive email. Please check the spelling.', suggestion: "" });
    await render(<MemoryRouter><Contact /></MemoryRouter>);
    await type("#c-name", "Riya Shah");
    await type("#c-email", "riya@nowhere.invalid");
    await type("#c-message", "Hello there");
    await submit();
    expect(api.submitContact).not.toHaveBeenCalled();
    expect(document.body.textContent).toMatch(/can't receive email/);
  });

  it("still sends when the check can't answer (no backend, network down)", async () => {
    api.checkEmailDomain.mockResolvedValue(null);
    api.submitContact.mockResolvedValue({ ok: true });
    await render(<MemoryRouter><Contact /></MemoryRouter>);
    await type("#c-name", "Riya Shah");
    await type("#c-email", "riya@somewhere-else.in");
    await type("#c-message", "Hello there");
    await submit();
    expect(api.submitContact).toHaveBeenCalledTimes(1);
  });
});
