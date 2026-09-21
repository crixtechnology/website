import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import { Contact } from "./pages/pages.jsx";
import { AuthModal } from "./components/ui.jsx";
import ReferralCard from "./components/ReferralCard.jsx";
import * as api from "./services/api.js";

// Forms that stay on screen after a successful submit or Apply must come back
// empty, so pressing the button again can't quietly send the same thing twice
// and nothing typed (a password especially) is left sitting in a field.
// (Forms that disappear on success, and edit-your-details forms that should keep
// showing what's saved, are deliberately not covered here.)
jest.mock("./services/api.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

describe("login / sign-up popup", () => {
  const ctx = (overrides = {}) => ({
    authModal: { mode: "signup" }, closeAuthModal: jest.fn(), login: jest.fn(), signup: jest.fn(), loginWithGoogle: jest.fn(),
    sessionExpired: false, ...overrides,
  });
  const renderModal = (value) => render(<UserContext.Provider value={value}><AuthModal /></UserContext.Provider>);
  const fillSignup = async () => {
    await type("#auth-name", "Test Person");
    await type("#auth-email", "test@example.com");
    await type("#auth-phone", "9876543210");
    await type("#auth-password", "a-long-password");
  };

  it("empties every field after the 'check your email' reply to a sign-up", async () => {
    const value = ctx();
    value.signup.mockResolvedValue({ ok: true, token: null, message: "If this email already has an account, check your inbox." });
    await renderModal(value);
    await fillSignup();
    expect(q("#auth-password").value).toBe("a-long-password");

    await submit(q("#auth-password").closest("form"));
    expect(value.signup).toHaveBeenCalledTimes(1);
    expect(q("#auth-name").value).toBe("");
    expect(q("#auth-email").value).toBe("");
    expect(q("#auth-password").value).toBe("");
    expect(q("#auth-phone").value).toBe("");
  });

  it("keeps the fields when sign-up fails, so the problem can be fixed", async () => {
    const value = ctx();
    value.signup.mockResolvedValue({ ok: false, error: "Enter a valid name." });
    await renderModal(value);
    await fillSignup();
    await submit(q("#auth-password").closest("form"));
    expect(q("#auth-name").value).toBe("Test Person");
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
