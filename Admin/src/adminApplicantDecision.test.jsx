import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import AdminApplicants from "./pages/admin/AdminApplicants.jsx";
import * as api from "./services/api.js";

// The decision buttons on an applicant: one "No" button (there used to be a
// separate Reject that clashed with Not shortlisted). It reads "Not shortlisted"
// after the test, and "Not selected" once the candidate was shortlisted or
// interviewed — then it closes the application with the interview message.
jest.mock("./services/api.js");
global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.resetAllMocks();
  window.confirm = jest.fn(() => true);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const buttons = () => [...container.querySelectorAll(".admin-actions button")].map((b) => b.textContent.trim());

async function openApplicant(status) {
  const application = { _id: "a1", status, statusLabel: status, user: { name: "Asha" }, opening: { title: "Web Intern", audience: "careers" }, attempt: null };
  api.getAdminToken.mockReturnValue("token");
  api.adminGetJobOpenings.mockResolvedValue({ ok: true, openings: [] });
  api.adminGetUsers.mockResolvedValue({ ok: true, users: [] });
  api.adminGetJobApplications.mockResolvedValue({ ok: true, applications: [application], summary: {}, statuses: {} });
  api.adminGetJobApplication.mockResolvedValue({ ok: true, application, review: null });
  api.adminSetJobApplicationStatus && api.adminSetJobApplicationStatus.mockResolvedValue({ ok: true, application: { ...application, statusLabel: "Done" } });
  await act(async () => {
    root.render(
      <UserContext.Provider value={{ user: { email: "admin@example.com" }, isLoggedIn: true, isAdmin: true, logout: jest.fn() }}>
        <MemoryRouter><AdminApplicants /></MemoryRouter>
      </UserContext.Provider>
    );
  });
  await act(async () => { [...container.querySelectorAll("button")].find((b) => b.textContent === "Review").click(); });
}

it("has no separate Reject button", async () => {
  await openApplicant("submitted");
  expect(buttons()).not.toContain("Reject");
});

it("after the test, the button marks the candidate not shortlisted", async () => {
  await openApplicant("submitted");
  expect(buttons()).toContain("Not shortlisted");
  expect(buttons()).not.toContain("Not selected");
});

it("once shortlisted or interviewed, the same button reads Not selected", async () => {
  await openApplicant("shortlisted");
  expect(buttons()).toContain("Not selected");
  expect(buttons()).not.toContain("Not shortlisted");
  const no = [...container.querySelectorAll(".admin-actions button")].find((b) => b.textContent.trim() === "Not selected");
  expect(no.disabled).toBe(false);
});
