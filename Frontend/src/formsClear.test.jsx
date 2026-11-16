import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import { Contact } from "./pages/pages.jsx";
import { AuthModal, InquiryModal } from "./components/ui.jsx";
import * as api from "./services/api.js";
import { IDLE_TIMEOUT_MINUTES } from "./hooks/useIdleLogout.js";

// Forms that stay on screen after a successful submit or Apply must come back
// empty, so pressing the button again can't quietly send the same thing twice
// and nothing typed (a password especially) is left sitting in a field.
// (Forms that disappear on success, and edit-your-details forms that should keep
// showing what's saved, are deliberately not covered here.)
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
});

const render = async (ui) => { await act(async () => { root.render(ui); }); };

// React tracks the value it last set, so a plain `el.value = x` isn't noticed —
// go through the native setter, then fire the event a real keystroke would.
function fill(el, value) {
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
}
const q = (sel) => container.querySelector(sel);
const type = async (sel, value) => { await act(async () => { fill(q(sel), value); }); };
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };
const submit = async (form) => { await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); };

describe("Contact form", () => {
  it("empties every field, and the dropdown goes back to its default, after the message is sent", async () => {
    api.submitContact.mockResolvedValue({ ok: true });
    await render(<MemoryRouter><Contact /></MemoryRouter>);

    await type("#c-name", "Test Person");
    await type("#c-email", "test@example.com");
    await type("#c-interest", "IT Services");
    await type("#c-message", "Hello, I would like to know more.");
    expect(q("#c-name").value).toBe("Test Person");
    expect(q("#c-interest").value).toBe("IT Services");

    await submit(q("#c-name").closest("form"));
    expect(api.submitContact).toHaveBeenCalledTimes(1);
    expect(api.submitContact).toHaveBeenCalledWith(expect.objectContaining({ name: "Test Person", email: "test@example.com", interest: "IT Services" }));

    expect(q("#c-name").value).toBe("");
    expect(q("#c-email").value).toBe("");
    expect(q("#c-message").value).toBe("");
    expect(q("#c-interest").value).toBe("Training + Internship");
  });

  it("keeps what was typed when sending fails, so it can be corrected and retried", async () => {
    api.submitContact.mockResolvedValue({ ok: false, error: "Could not send" });
    await render(<MemoryRouter><Contact /></MemoryRouter>);
    await type("#c-name", "Test Person");
    await type("#c-email", "test@example.com");
    await type("#c-message", "Hello there friend");
    await submit(q("#c-name").closest("form"));
    expect(api.submitContact).toHaveBeenCalledTimes(1);
    expect(q("#c-name").value).toBe("Test Person");
    expect(q("#c-message").value).toBe("Hello there friend");
  });

  it("starts a logged-in student with their saved details, and keeps them after sending", async () => {
    api.submitContact.mockResolvedValue({ ok: true });
    const user = { name: "Asha Patel", email: "asha@example.com", phone: "9876543210" };
    await render(<MemoryRouter><UserContext.Provider value={{ user }}><Contact /></UserContext.Provider></MemoryRouter>);
    expect(q("#c-name").value).toBe("Asha Patel");
    expect(q("#c-email").value).toBe("asha@example.com");

    await type("#c-message", "Hello, I would like to know more.");
    await submit(q("#c-name").closest("form"));
    expect(api.submitContact).toHaveBeenCalledWith(expect.objectContaining({ name: "Asha Patel", email: "asha@example.com" }));
    expect(q("#c-name").value).toBe("Asha Patel");
    expect(q("#c-message").value).toBe("");
  });

  it("leaves the name empty for a new account that still has its placeholder name", async () => {
    const user = { name: "asha", email: "asha@example.com", phone: "", profilePending: true };
    await render(<MemoryRouter><UserContext.Provider value={{ user }}><Contact /></UserContext.Provider></MemoryRouter>);
    expect(q("#c-name").value).toBe("");
    expect(q("#c-email").value).toBe("asha@example.com");
  });
});

describe("Request to apply form", () => {
  it("starts a logged-in student with their saved details", async () => {
    const user = { name: "Asha Patel", email: "asha@example.com", phone: "9876543210", education: { college: "GU" } };
    const item = { title: "Web Intern", slug: "web-intern" };
    await render(<MemoryRouter><UserContext.Provider value={{ user }}><InquiryModal item={item} kind="internship" onClose={() => {}} /></UserContext.Provider></MemoryRouter>);
    expect(q("#inquiry-name").value).toBe("Asha Patel");
    expect(q("#inquiry-email").value).toBe("asha@example.com");
    expect(q("#inquiry-college").value).toBe("GU");
  });

  // A course request; Training + Internship asks a visitor to log in first (trainingApplyLogin.test.jsx).
  it("starts empty for a visitor who isn't logged in", async () => {
    const item = { title: "Web Course", slug: "web-course" };
    await render(<MemoryRouter><InquiryModal item={item} kind="course" onClose={() => {}} /></MemoryRouter>);
    expect(q("#inquiry-name").value).toBe("");
    expect(q("#inquiry-email").value).toBe("");
  });
});

describe("login popup — one form that logs in or creates the account", () => {
  const ctx = (overrides = {}) => ({
    authModal: { mode: "login" }, closeAuthModal: jest.fn(), login: jest.fn(), loginWithGoogle: jest.fn(),
    sessionExpired: false, ...overrides,
  });
  const renderModal = (value) => render(
    <MemoryRouter><UserContext.Provider value={value}><AuthModal /></UserContext.Provider></MemoryRouter>
  );
  const fillLogin = async () => {
    await type("#auth-email", "new@example.com");
    await type("#auth-password", "a-long-password");
  };

  it("has no separate sign-up form: just email, password and Continue", async () => {
    await renderModal(ctx());
    expect(q("#auth-name")).toBeNull();
    expect(q("#auth-phone")).toBeNull();
    expect(container.querySelector("input[type=checkbox]")).toBeNull();
    expect(container.textContent).toContain("Log in or create an account");
    expect(container.textContent).not.toMatch(/sign up/i);
  });

  it("logs an existing account straight in", async () => {
    const value = ctx();
    value.login.mockResolvedValue({ ok: true, token: "t", user: { name: "Asha" } });
    await renderModal(value);
    await fillLogin();
    await submit(q("#auth-password").closest("form"));
    expect(value.login).toHaveBeenCalledWith("new@example.com", "a-long-password");
    expect(value.closeAuthModal).toHaveBeenCalled();
  });

  // A new email goes straight to one "I agree" popup — no extra form, no
  // checkbox to find — and agreeing creates the account and logs in.
  const agreeButton = () => [...container.querySelectorAll("button")].find((b) => /I agree/.test(b.textContent));

  // The "I agree" popup is only for an email the server says has no account.
  it("never shows the 'I agree' popup to an existing account, even with a wrong password", async () => {
    const value = ctx();
    value.login.mockResolvedValueOnce({ ok: false, error: "Invalid credentials" });
    await renderModal(value);
    await fillLogin();
    await submit(q("#auth-password").closest("form"));
    expect(q(".agree-box")).toBeNull();
    expect(container.textContent).toContain("Invalid credentials");
    expect(container.textContent).toContain("Log in or create an account");
  });

  it("asks a new email for one 'I agree', then creates the account and logs in", async () => {
    const value = ctx();
    value.login.mockResolvedValueOnce({ ok: false, code: "NEW_ACCOUNT", error: "There's no account with this email yet." });
    await renderModal(value);
    await fillLogin();
    await submit(q("#auth-password").closest("form"));
    expect(container.textContent).toContain("Create your account");
    expect(q(".agree-box").textContent).toMatch(/18 or older/);
    expect(q(".agree-box").textContent).toMatch(/Terms of Service/);
    expect(q(".agree-box").textContent).toMatch(/Privacy Policy/);
    expect(container.querySelector("input[type=checkbox]")).toBeNull();
    expect(container.textContent).toContain("new@example.com");
    expect(value.login).toHaveBeenCalledTimes(1);

    value.login.mockResolvedValueOnce({ ok: true, created: true, token: "t", user: { name: "New", profilePending: true } });
    await act(async () => { agreeButton().click(); });
    expect(value.login).toHaveBeenLastCalledWith("new@example.com", "a-long-password", { createAccount: true, ageConfirmed: true });
    expect(value.closeAuthModal).toHaveBeenCalled();
  });

  it("asks for a longer password before offering to create the account", async () => {
    const value = ctx();
    value.login.mockResolvedValueOnce({ ok: false, code: "NEW_ACCOUNT", error: "There's no account with this email yet." });
    await renderModal(value);
    await type("#auth-email", "new@example.com");
    await type("#auth-password", "short");
    await submit(q("#auth-password").closest("form"));
    expect(q(".agree-box")).toBeNull();
    expect(container.textContent).toMatch(/at least 8 characters/);
  });

  it("goes back to the form, password cleared, with 'Use a different email'", async () => {
    const value = ctx();
    value.login.mockResolvedValueOnce({ ok: false, code: "NEW_ACCOUNT", error: "There's no account with this email yet." });
    await renderModal(value);
    await fillLogin();
    await submit(q("#auth-password").closest("form"));
    await act(async () => { [...container.querySelectorAll("button")].find((b) => b.textContent === "Use a different email").click(); });
    expect(q(".agree-box")).toBeNull();
    expect(q("#auth-email").value).toBe("new@example.com");
    expect(q("#auth-password").value).toBe("");
    expect(value.login).toHaveBeenCalledTimes(1);
  });

  it("keeps the fields when login fails, so the problem can be fixed", async () => {
    const value = ctx();
    value.login.mockResolvedValue({ ok: false, error: "Invalid credentials" });
    await renderModal(value);
    await fillLogin();
    await submit(q("#auth-password").closest("form"));
    expect(container.textContent).toContain("Invalid credentials");
    expect(q("#auth-password").value).toBe("a-long-password");
  });
});

describe("idle sign-out notice", () => {
  it("states the real idle limit (30 minutes), not a stale number", async () => {
    // The limit is defined once and used both by the timer and by this message.
    expect(IDLE_TIMEOUT_MINUTES).toBe(30);
    const value = { authModal: { mode: "login" }, closeAuthModal: jest.fn(), login: jest.fn(), loginWithGoogle: jest.fn(), sessionExpired: true };
    await render(<MemoryRouter><UserContext.Provider value={value}><AuthModal /></UserContext.Provider></MemoryRouter>);
    // The notice is portaled to <body>, outside the test container.
    expect(document.body.textContent).toContain("signed out after 30 minutes of inactivity");
    expect(document.body.textContent).not.toContain("15 minutes");
  });
});
