import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useNavigate } from "react-router-dom";
import App from "./App.jsx";

// If a page crashes, the visitor gets a "reload" screen instead of a blank page — and
// moving to another page clears it.
jest.mock("./services/api.js");
// Make the 404 page crash when it renders (stands in for any page failing).
jest.mock("./pages/pages.jsx", () => ({
  ...jest.requireActual("./pages/pages.jsx"),
  NotFound: () => { throw new Error("this page crashed"); },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let errorSpy;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  errorSpy.mockRestore();
});

// A button, inside the router, that goes to another page (as a link click would).
function GoContact() {
  const navigate = useNavigate();
  return <button id="go-contact" onClick={() => navigate("/contact")}>go</button>;
}

describe("a page that crashes", () => {
  it("shows a reload screen (not a blank page), keeps the site's header and footer, and recovers on navigation", async () => {
    await act(async () => { root.render(<MemoryRouter initialEntries={["/crashing-page"]}><App /><GoContact /></MemoryRouter>); });

    expect(container.textContent).toContain("This page hit a problem.");
    expect(container.textContent).toContain("Reload the page");
    expect(container.querySelector("nav, header")).not.toBeNull(); // the site's chrome survived

    await act(async () => { container.querySelector("#go-contact").click(); });
    expect(container.textContent).toContain("Ready to build with us?");
    expect(container.textContent).not.toContain("This page hit a problem.");
  });
});
