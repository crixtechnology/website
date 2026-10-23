import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import { Contact } from "./pages/pages.jsx";
import { AuthModal } from "./components/ui.jsx";
import ReferralCard from "./components/ReferralCard.jsx";
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
    expect(q("#c-interest").value).toBe("Internship");
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
    expect(q(".age-check")).toBeNull();
    expect(container.textContent).toContain("Log in or create an account");
    expect(container.textContent).not.toMatch(/sign up/i);
  });

  it("logs an existing account straight in", async () => {
    const value = ctx();
    value.login.mockResolvedValue({ ok: true, token: "t", user: { name: "Asha" } });
    await renderModal(value);
    await fillLogin();
    await submit(q("#auth-password").closest("form"));
    expect(value.login).toHaveBeenCalledWith("new@example.com", "a-long-password", undefined);
    expect(value.closeAuthModal).toHaveBeenCalled();
  });

  it("asks to confirm a new email, needs the age box, then creates the account with that password", async () => {
    const value = ctx();
    value.login.mockResolvedValueOnce({ ok: false, code: "NEW_ACCOUNT", error: "There's no account with this email yet." });
    await renderModal(value);
    await fillLogin();
    await submit(q("#auth-password").closest("form"));
    expect(container.textContent).toContain("Create your account");
    expect(q(".age-check").textContent).toContain("18 or older");
    // The typed details stay for the second step.
    expect(q("#auth-email").value).toBe("new@example.com");
    expect(q("#auth-password").value).toBe("a-long-password");

    await submit(q("#auth-password").closest("form"));
    expect(value.login).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Please confirm your age");

    value.login.mockResolvedValueOnce({ ok: true, created: true, token: "t", user: { name: "New", profilePending: true } });
    await act(async () => { q(".age-check input").click(); });
    await submit(q("#auth-password").closest("form"));
    expect(value.login).toHaveBeenLastCalledWith("new@example.com", "a-long-password", { createAccount: true, ageConfirmed: true });
    expect(value.closeAuthModal).toHaveBeenCalled();
  });

  it("goes back to a plain login when the email is changed after the 'new email' step", async () => {
    const value = ctx();
    value.login.mockResolvedValueOnce({ ok: false, code: "NEW_ACCOUNT", error: "There's no account with this email yet." });
    await renderModal(value);
    await fillLogin();
    await submit(q("#auth-password").closest("form"));
    expect(q(".age-check")).not.toBeNull();
    await type("#auth-email", "asha@example.com");
    expect(q(".age-check")).toBeNull();
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

describe("referral 'friend's code' box", () => {
  const referral = () => ({
    ok: true, code: "ABC123", displayCode: "CRIX-ABC123", canApplyCode: true, creditBalance: 0, referrals: [], referredBy: null,
    stats: { total: 0, rewarded: 0, earned: 0 }, settings: { enabled: true, refereeDiscountPercent: 10, referrerCreditRupees: 500 },
  });

  it("empties the box once the code has been applied", async () => {
    api.getMyReferral.mockResolvedValue(referral());
    api.applyReferral.mockResolvedValue({ ok: true, discountPercent: 10 });
    await render(<ReferralCard />);

    await type("#ref-friend-code", "CRIX-XYZ789");
    expect(q("#ref-friend-code").value).toBe("CRIX-XYZ789");
    const apply = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Apply"));
    await click(apply);

    expect(api.applyReferral).toHaveBeenCalledWith("CRIX-XYZ789");
    // The card reloads its data (still offering the box in this mock), so the box is still there — and empty.
    expect(q("#ref-friend-code").value).toBe("");
  });

  it("keeps the code when it is rejected, so a typo can be fixed", async () => {
    api.getMyReferral.mockResolvedValue(referral());
    api.applyReferral.mockResolvedValue({ ok: false, error: "That referral code isn't valid." });
    await render(<ReferralCard />);
    await type("#ref-friend-code", "CRIX-BAD000");
    const apply = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Apply"));
    await click(apply);
    expect(q("#ref-friend-code").value).toBe("CRIX-BAD000");
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
