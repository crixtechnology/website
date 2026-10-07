import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import WalletCard from "./components/WalletCard.jsx";
import { BuyModal } from "./components/ui.jsx";
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
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const q = (sel) => container.querySelector(sel);
const render = async (ui) => { await act(async () => { root.render(<MemoryRouter>{ui}</MemoryRouter>); }); };

const wallet = (overrides = {}) => ({
  balance: 1500, reserved: 0, available: 1500, earned: 2000, spent: 500,
  entries: [
    { id: "e1", amount: 1000, kind: "adjustment", label: "Welcome credit", createdAt: "2026-10-01T10:00:00Z" },
    { id: "e2", amount: -500, kind: "redeemed", label: "Spent on React Basics", createdAt: "2026-10-02T10:00:00Z" },
  ],
  ...overrides,
});

describe("WalletCard", () => {
  it("shows the balance, the totals and each entry with its sign", async () => {
    api.getMyWallet.mockResolvedValue({ ok: true, wallet: wallet() });
    await render(<WalletCard />);
    expect(q(".wallet-amount").textContent).toBe("₹1,500");
    expect(container.textContent).toContain("Credit received");
    const rows = [...container.querySelectorAll(".wallet-history li")].map((li) => li.textContent);
    expect(rows[0]).toContain("Welcome credit");
    expect(rows[0]).toContain("+₹1,000");
    expect(rows[1]).toContain("Spent on React Basics");
    expect(rows[1]).toContain("−₹500");
  });

  it("explains an empty wallet instead of showing an empty list", async () => {
    api.getMyWallet.mockResolvedValue({ ok: true, wallet: wallet({ balance: 0, available: 0, earned: 0, spent: 0, entries: [] }) });
    await render(<WalletCard />);
    expect(q(".wallet-amount").textContent).toBe("₹0");
    expect(q(".wallet-history")).toBeNull();
    expect(container.textContent).toContain("No credit yet");
  });

  it("tells the student when part of the balance is held by an unfinished checkout", async () => {
    api.getMyWallet.mockResolvedValue({ ok: true, wallet: wallet({ reserved: 999, available: 501 }) });
    await render(<WalletCard />);
    expect(q(".wallet-note").textContent).toContain("₹999");
    expect(q(".wallet-note").textContent).toContain("₹501");
  });

  it("collapses a long history until asked", async () => {
    const entries = Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, amount: 10, kind: "adjustment", label: `Gift ${i}`, createdAt: "2026-10-01T10:00:00Z" }));
    api.getMyWallet.mockResolvedValue({ ok: true, wallet: wallet({ entries }) });
    await render(<WalletCard />);
    expect(container.querySelectorAll(".wallet-history li")).toHaveLength(6);
    await act(async () => { q(".wallet-card .link-btn").click(); });
    expect(container.querySelectorAll(".wallet-history li")).toHaveLength(9);
  });

  it("renders nothing when the wallet can't be loaded, rather than breaking the profile page", async () => {
    api.getMyWallet.mockResolvedValue({ ok: false, error: "nope" });
    await render(<WalletCard />);
    expect(q(".wallet-card")).toBeNull();
  });
});

describe("BuyModal with a wallet", () => {
  const item = { slug: "react-basics", title: "React Basics", type: "course", status: "open", tiers: [{ tier: "basic", price: 1000, discountPercent: 0, features: [] }] };
  const user = { name: "Asha", email: "asha@example.com", phone: "+919876543210" };
  const ctx = { openAuthModal: jest.fn() };
  const quote = (o) => ({ ok: true, planPrice: 1000, couponApplied: false, couponDiscount: 0, referralPercent: 0, referralDiscount: 0, creditApplied: 0, creditAvailable: 0, payable: 1000, walletCoversAll: false, walletPayable: 1000, ...o });

  const open = async () => {
    api.getMyReferral.mockResolvedValue({ ok: true, canApplyCode: false });
    await render(<UserContext.Provider value={ctx}><BuyModal item={item} user={user} initialTier="basic" onClose={jest.fn()} /></UserContext.Provider>);
  };
  const submit = async () => { await act(async () => { q(".modal-box form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); };

  it("offers to pay from the wallet when it covers the price, and never starts a Razorpay order", async () => {
    api.getPriceQuote.mockResolvedValue(quote({ creditApplied: 999, creditAvailable: 1500, payable: 1, walletCoversAll: true }));
    api.submitApplication.mockResolvedValue({ ok: true, application: { _id: "app1" } });
    api.payWithWallet.mockResolvedValue({ ok: true, courseSlug: "react-basics", enrolled: true });
    await open();

    const button = q('.modal-box button[type="submit"]');
    expect(button.textContent).toBe("Pay ₹1,000 with wallet");
    // The summary agrees with the button: the whole price from wallet credit, nothing left to pay.
    expect(q(".order-summary").textContent).toContain("Wallet credit−₹1,000");
    expect(q(".order-summary .is-total").textContent).toBe("You pay₹0");

    await submit();
    expect(api.payWithWallet).toHaveBeenCalledWith("app1", "react-basics", "basic", "");
    expect(api.createRazorpayOrder).not.toHaveBeenCalled();
    expect(q(".modal-box .alert-inline").textContent).toContain("Paid from your wallet");
  });

  it("shows the server's reason when the wallet payment is refused", async () => {
    api.getPriceQuote.mockResolvedValue(quote({ walletCoversAll: true }));
    api.submitApplication.mockResolvedValue({ ok: true, application: { _id: "app1" } });
    api.payWithWallet.mockResolvedValue({ ok: false, error: "Your wallet doesn't have enough credit to pay for this in full." });
    await open();
    await submit();
    expect(q(".modal-box .alert-inline.alert-error").textContent).toContain("doesn't have enough credit");
  });

  it("keeps the normal payment button when the wallet can't cover the price", async () => {
    api.getPriceQuote.mockResolvedValue(quote({ creditApplied: 400, creditAvailable: 400, payable: 600 }));
    await open();
    expect(q('.modal-box button[type="submit"]').textContent).toBe("Continue to payment · ₹600");
    expect(container.textContent).not.toContain("with wallet");
  });
});
