import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import AdminUsers from "./pages/admin/AdminUsers.jsx";
import * as api from "./services/api.js";

// The wallet panel in Admin → Users: add or take away a student's credit.
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
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

const q = (sel) => container.querySelector(sel);
const fill = (el, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const button = (label) => [...container.querySelectorAll("button")].find((b) => b.textContent === label);

const student = { _id: "u1", name: "Asha Rao", email: "asha@example.com", phone: "", role: "student", createdAt: "2026-09-01T00:00:00Z" };
const wallet = (balance, entries = []) => ({ balance, reserved: 0, available: balance, earned: balance, spent: 0, entries });

async function openStudent(detailWallet) {
  api.getAdminToken.mockReturnValue("token");
  api.adminGetCourses.mockResolvedValue({ ok: true, courses: [] });
  api.adminGetUsers.mockResolvedValue({ ok: true, users: [student] });
  api.adminGetUser.mockResolvedValue({ ok: true, user: student, enrollments: [], applications: [], wallet: detailWallet });
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ isLoggedIn: true, isAdmin: true, user: { id: "admin1" }, logout: jest.fn() }}>
        <MemoryRouter><AdminUsers /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  await act(async () => { q(".admin-row").click(); });
}

describe("admin wallet panel", () => {
  it("shows the student's balance and recent entries", async () => {
    await openStudent(wallet(750, [{ id: "e1", amount: 750, kind: "adjustment", label: "Welcome credit", createdAt: "2026-10-01T00:00:00Z" }]));
    expect(q(".admin-detail-panel").textContent).toContain("Balance ₹750");
    expect(q(".admin-detail-panel").textContent).toContain("Welcome credit");
  });

  it("adds credit with the note, then shows the updated wallet", async () => {
    await openStudent(wallet(0));
    api.adminAdjustWallet.mockResolvedValue({ ok: true, wallet: wallet(500, [{ id: "e1", amount: 500, kind: "adjustment", label: "Contest prize", createdAt: "2026-10-07T00:00:00Z" }]) });

    expect(button("Add credit").disabled).toBe(true); // nothing typed yet
    await act(async () => { fill(q("#au-wallet-amount"), "500"); });
    await act(async () => { fill(q("#au-wallet-note"), "Contest prize"); });
    await act(async () => { button("Add credit").click(); });

    expect(api.adminAdjustWallet).toHaveBeenCalledWith("u1", 500, "Contest prize");
    expect(q(".admin-detail-panel").textContent).toContain("Balance ₹500");
    expect(q(".admin-detail-panel").textContent).toContain("Credit added.");
    expect(q("#au-wallet-amount").value).toBe(""); // cleared for the next one
  });

  it("takes credit away as a negative amount", async () => {
    await openStudent(wallet(900));
    api.adminAdjustWallet.mockResolvedValue({ ok: true, wallet: wallet(600) });
    await act(async () => { fill(q("#au-wallet-amount"), "300"); });
    await act(async () => { button("Take away").click(); });
    expect(api.adminAdjustWallet).toHaveBeenCalledWith("u1", -300, "");
    expect(q(".admin-detail-panel").textContent).toContain("Balance ₹600");
  });

  it("does nothing when the admin cancels the confirmation, and rejects a non-whole amount", async () => {
    await openStudent(wallet(100));
    await act(async () => { fill(q("#au-wallet-amount"), "50"); });
    window.confirm.mockReturnValue(false);
    await act(async () => { button("Add credit").click(); });
    expect(api.adminAdjustWallet).not.toHaveBeenCalled();

    window.confirm.mockReturnValue(true);
    await act(async () => { fill(q("#au-wallet-amount"), "12.5"); });
    await act(async () => { button("Add credit").click(); });
    expect(api.adminAdjustWallet).not.toHaveBeenCalled();
    expect(q(".admin-detail-panel").textContent).toContain("whole number of rupees");
  });

  it("shows the server's reason when taking away too much", async () => {
    await openStudent(wallet(100));
    api.adminAdjustWallet.mockResolvedValue({ ok: false, error: "They only have ₹100 that can be taken away right now." });
    await act(async () => { fill(q("#au-wallet-amount"), "400"); });
    await act(async () => { button("Take away").click(); });
    expect(q(".admin-detail-panel .form-error").textContent).toContain("only have ₹100");
    expect(q(".admin-detail-panel").textContent).toContain("Balance ₹100"); // unchanged
  });
});
