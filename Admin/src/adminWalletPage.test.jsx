import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import AdminWallet from "./pages/admin/AdminWallet.jsx";
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

const q = (sel) => container.querySelector(sel);
const fill = (el, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const asha = { _id: "u1", name: "Asha Rao", email: "asha@example.com", phone: "", role: "student" };
const wallet = (balance) => ({ balance, reserved: 0, available: balance, earned: balance, spent: 0, entries: [] });

describe("admin wallet page", () => {
  it("picks a student, then adds credit to that student only", async () => {
    api.getAdminToken.mockReturnValue("token");
    api.adminGetUsers.mockResolvedValue({ ok: true, users: [asha, { ...asha, _id: "a1", name: "Boss", email: "boss@example.com", role: "admin" }] });
    api.adminGetUser.mockResolvedValue({ ok: true, user: asha, wallet: wallet(100) });
    api.adminAdjustWallet.mockResolvedValue({ ok: true, wallet: wallet(600) });
    await act(async () => {
      root.render(<UserContext.Provider value={{ logout: jest.fn() }}><MemoryRouter><AdminWallet /></MemoryRouter></UserContext.Provider>);
    });

    expect(q("#au-wallet-amount")).toBeNull(); // nothing until a student is chosen
    await act(async () => { q('input[role="combobox"]').focus(); });
    const options = [...container.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(options.join(" ")).toContain("Asha Rao");
    expect(options.join(" ")).not.toContain("Boss"); // admins have no wallet
    await act(async () => { [...container.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes("Asha")).dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true })); });

    expect(api.adminGetUser).toHaveBeenCalledWith("u1");
    expect(container.textContent).toContain("Balance ₹100");
    await act(async () => { fill(q("#au-wallet-amount"), "500"); });
    await act(async () => { [...container.querySelectorAll("button")].find((b) => b.textContent === "Add credit").click(); });
    expect(api.adminAdjustWallet).toHaveBeenCalledWith("u1", 500, "");
    expect(container.textContent).toContain("Balance ₹600");
  });
});
