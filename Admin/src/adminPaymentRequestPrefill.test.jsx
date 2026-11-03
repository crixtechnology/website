import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import AdminPaymentRequests from "./pages/admin/AdminPaymentRequests.jsx";
import * as api from "./services/api.js";

// "Send payment request" on a Training + Internship application opens this
// form with the applicant and the track already filled in.
jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.resetAllMocks();
  api.getAdminToken.mockReturnValue("token");
  api.adminGetPaymentRequests.mockResolvedValue({ ok: true, requests: [] });
  api.adminGetCourses.mockResolvedValue({
    ok: true,
    courses: [{ _id: "c1", title: "MERN Training", type: "internship", status: "open", tiers: [{ tier: "basic", price: 4999, discountPercent: 0, features: [] }] }],
  });
  api.adminGetUsers.mockResolvedValue({ ok: true, users: [{ _id: "u1", name: "Asha Patel", email: "asha@example.com", role: "student" }] });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function renderAt(path) {
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ logout: jest.fn() }}>
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route path="/admin/payment-requests" element={<AdminPaymentRequests />} /></Routes>
        </MemoryRouter>
      </UserContext.Provider>
    );
  });
  // Lists load, then the prefill runs.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

it("fills in the applicant, the track and its fee", async () => {
  await renderAt("/admin/payment-requests?email=Asha%40example.com&courseId=c1");
  expect(container.textContent).toContain("Asha Patel");
  expect(container.querySelector("#paymentrequests-course-internship").value).toBe("c1");
  expect(container.querySelector("#paymentrequests-plan").value).toBe("basic");
  expect(container.querySelector("#paymentrequests-amount").value).toBe("4999");
});

it("says so when the applicant has no account yet", async () => {
  await renderAt("/admin/payment-requests?email=new%40example.com&courseId=c1");
  expect(container.textContent).toContain("new@example.com has no account yet");
});
