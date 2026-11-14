import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import AdminCareerSettings from "./pages/admin/AdminCareerSettings.jsx";
import * as api from "./services/api.js";

// Careers settings: no test fee to set, and the link "Apply Now" opens on the
// Free Internships page.
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
afterEach(() => { act(() => root.unmount()); container.remove(); });

const q = (sel) => container.querySelector(sel);
const fill = (el, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const settings = {
  signupBonusCredits: 300, creditExpiryMonths: 12, creditUsagePercent: 100, violationLimit: 3, snapshotIntervalSeconds: 60,
  generatedQuestionsPercent: 30, reapplyCooldownDays: 30, requireWebcam: true, requireDesktopApp: false,
  freeApplyFormUrl: "https://forms.gle/eaX7kab7zPG7w6SX6",
};

describe("admin careers settings", () => {
  it("has no fee to set, and saves the free internships application form link", async () => {
    api.getAdminToken.mockReturnValue("token");
    api.adminGetCareerSettings.mockResolvedValue({ ok: true, settings });
    api.adminUpdateCareerSettings.mockResolvedValue({ ok: true, settings });
    await act(async () => {
      root.render(<UserContext.Provider value={{ logout: jest.fn() }}><MemoryRouter><AdminCareerSettings /></MemoryRouter></UserContext.Provider>);
    });

    // The fee fields are gone.
    expect(q("#cs-fee")).toBeNull();
    expect(q("#cs-processing")).toBeNull();
    expect(container.textContent).toContain("Applying and the aptitude test are free for every role");

    const link = q("#cs-form");
    expect(link.value).toBe("https://forms.gle/eaX7kab7zPG7w6SX6");
    expect(container.textContent).toContain("not under Applicants here");
    await act(async () => { fill(link, "  https://forms.gle/NewForm123 "); });
    await act(async () => { q("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });

    const sent = api.adminUpdateCareerSettings.mock.calls[0][0];
    expect(sent.freeApplyFormUrl).toBe("https://forms.gle/NewForm123");
    expect(sent).toMatchObject({ reapplyCooldownDays: 30, requireWebcam: true });
    expect(sent).not.toHaveProperty("testFeeRupees");
    expect(sent).not.toHaveProperty("processingFeeRupees");
  });

  it("shows the server's reason when the link is refused", async () => {
    api.getAdminToken.mockReturnValue("token");
    api.adminGetCareerSettings.mockResolvedValue({ ok: true, settings });
    api.adminUpdateCareerSettings.mockResolvedValue({ ok: false, error: "The free internships form link must be a full https:// link (for example a Google Form link)." });
    await act(async () => {
      root.render(<UserContext.Provider value={{ logout: jest.fn() }}><MemoryRouter><AdminCareerSettings /></MemoryRouter></UserContext.Provider>);
    });
    await act(async () => { fill(q("#cs-form"), "forms.gle/abc"); });
    await act(async () => { q("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(container.textContent).toContain("must be a full https:// link");
  });
});
