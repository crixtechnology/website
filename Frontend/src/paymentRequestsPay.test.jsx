import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import PaymentRequests from "./components/PaymentRequests.jsx";
import * as api from "./services/api.js";

// Training + Internship is paid through payment requests, so paying one shows
// the same breakdown as checkout — offer code, referral discount, wallet credit
// — and can be paid from the wallet alone when the credit covers it.
jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.resetAllMocks();
  api.getMyReferral.mockResolvedValue({ ok: true, canApplyCode: false });
  api.getMyPaymentRequests.mockResolvedValue({
    ok: true,
    requests: [{ _id: "req1", status: "pending", amount: 2000, tier: null, note: "", course: { _id: "c1", title: "MERN Training", slug: "mern", type: "internship" } }],
  });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const user = { name: "Asha Mehta", email: "asha@example.com", phone: "+919876543210" };
async function render() {
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user, isLoggedIn: true, isAdmin: false }}>
        <MemoryRouter><PaymentRequests /></MemoryRouter>
      </UserContext.Provider>
    );
  });
}
const buttons = () => [...container.querySelectorAll("button")];
const button = (text) => buttons().find((b) => b.textContent.startsWith(text));
const agree = () => act(async () => { container.querySelector(".terms-check input").click(); });

it("prices the request with the student's credit and referral discount before they pay", async () => {
  api.getPaymentRequestQuote.mockResolvedValue({
    ok: true, planPrice: 2000, couponApplied: false, couponDiscount: 0, referralPercent: 10, referralDiscount: 200,
    creditApplied: 300, creditAvailable: 300, payable: 1500, walletCoversAll: false, walletPayable: 1800,
  });
  api.createPaymentRequestOrder.mockResolvedValue({ ok: false, error: "stop here" });
  await render();
  await act(async () => { button("Pay ₹2,000").click(); });
  expect(api.getPaymentRequestQuote).toHaveBeenCalledWith("req1", "");
  expect(container.textContent).toContain("₹300"); // credit taken off
  const pay = button("Pay ₹1,500");
  expect(pay).toBeTruthy();
  expect(pay.disabled).toBe(true); // Terms first
  await agree();
  await act(async () => { button("Pay ₹1,500").click(); });
  expect(api.createPaymentRequestOrder).toHaveBeenCalledWith("req1", "");
});

it("pays from the wallet when the credit covers it all", async () => {
  api.getPaymentRequestQuote.mockResolvedValue({
    ok: true, planPrice: 2000, couponApplied: false, couponDiscount: 0, referralPercent: 0, referralDiscount: 0,
    creditApplied: 1999, creditAvailable: 5000, payable: 1, walletCoversAll: true, walletPayable: 2000,
  });
  api.payPaymentRequestWithWallet.mockResolvedValue({ ok: true, enrolled: true, courseSlug: "mern" });
  await render();
  await act(async () => { button("Pay ₹2,000").click(); });
  await agree();
  await act(async () => { button("Pay ₹2,000 from wallet").click(); });
  expect(api.payPaymentRequestWithWallet).toHaveBeenCalledWith("req1", "");
  expect(api.createPaymentRequestOrder).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Payment confirmed");
});

it("charges the plain amount when the request has discounts switched off", async () => {
  api.getMyPaymentRequests.mockResolvedValue({
    ok: true,
    requests: [{ _id: "req2", status: "pending", amount: 1200, allowDiscounts: false, tier: null, note: "", course: { _id: "c1", title: "MERN Training", slug: "mern", type: "internship" } }],
  });
  api.createPaymentRequestOrder.mockResolvedValue({ ok: false, error: "stop here" });
  await render();
  await act(async () => { button("Pay ₹1,200").click(); });
  expect(api.getPaymentRequestQuote).not.toHaveBeenCalled();
  expect(container.textContent).toContain("already includes your discount");
  await agree();
  await act(async () => { buttons().filter((b) => b.textContent === "Pay ₹1,200").pop().click(); });
  expect(api.createPaymentRequestOrder).toHaveBeenCalledWith("req2", "");
});
