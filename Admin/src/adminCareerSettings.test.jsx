import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserContext } from "./context/UserContext.jsx";
import AdminCareerSettings from "./pages/admin/AdminCareerSettings.jsx";
import * as api from "./services/api.js";

// Careers settings: credits and test rules only. There is no test fee to set,
// and the free internships' form link is not here (it is edited under
// Training + Internship → Free internships; see adminCourses.test.jsx).
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
const settings = {
  signupBonusCredits: 300, creditExpiryMonths: 12, creditUsagePercent: 100, violationLimit: 3, snapshotIntervalSeconds: 60,
  generatedQuestionsPercent: 30, reapplyCooldownDays: 30, requireWebcam: true, requireDesktopApp: false,
  freeApplyFormUrl: "https://forms.gle/eaX7kab7zPG7w6SX6",
};

describe("admin careers settings", () => {
  it("has no fee and no form link to set, and saves without touching either", async () => {
    api.getAdminToken.mockReturnValue("token");
    api.adminGetCareerSettings.mockResolvedValue({ ok: true, settings });
    api.adminUpdateCareerSettings.mockResolvedValue({ ok: true, settings });
    await act(async () => {
      root.render(<UserContext.Provider value={{ logout: jest.fn() }}><MemoryRouter><AdminCareerSettings /></MemoryRouter></UserContext.Provider>);
    });

    expect(q("#cs-fee")).toBeNull();
    expect(q("#cs-processing")).toBeNull();
    expect(q("#cs-form")).toBeNull();
    expect(container.textContent).not.toMatch(/form link|Google Form/i);
    expect(container.textContent).toContain("Applying and the aptitude test are free for every role");

    await act(async () => { q("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    const sent = api.adminUpdateCareerSettings.mock.calls[0][0];
    expect(sent).toMatchObject({ reapplyCooldownDays: 30, requireWebcam: true });
    for (const key of ["testFeeRupees", "processingFeeRupees", "freeApplyFormUrl"]) expect(sent).not.toHaveProperty(key);
  });
});
