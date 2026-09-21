import { act } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { Hero3D } from "./components/ui.jsx";

// Something failing inside one part of the site must not blank the whole page.
jest.mock("./services/api.js");
// The 3D scenes are a separate, lazily loaded file. Make it fail to load, as it would
// on a dropped connection, or after a deploy replaced the file an open tab asks for.
jest.mock("./components/Scene3D.jsx", () => { throw new Error("chunk failed to load"); });

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let errorSpy;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {}); // React logs caught errors loudly
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  errorSpy.mockRestore();
});

const Boom = () => { throw new Error("boom"); };

describe("ErrorBoundary", () => {
  it("shows its fallback for what crashed and leaves everything else standing", async () => {
    await act(async () => {
      root.render(
        <div>
          <p>the rest of the page</p>
          <ErrorBoundary fallback={<p>fallback shown</p>}><Boom /></ErrorBoundary>
        </div>
      );
    });
    expect(container.textContent).toContain("the rest of the page");
    expect(container.textContent).toContain("fallback shown");
  });

  it("can simply vanish (fallback={null})", async () => {
    await act(async () => { root.render(<div><p>page</p><ErrorBoundary fallback={null}><Boom /></ErrorBoundary></div>); });
    expect(container.textContent).toBe("page");
  });

  it("starts fresh when it is given a new key (the visitor moved to another page)", async () => {
    await act(async () => { root.render(<ErrorBoundary key="a" fallback={<p>fallback shown</p>}><Boom /></ErrorBoundary>); });
    expect(container.textContent).toContain("fallback shown");
    await act(async () => { root.render(<ErrorBoundary key="b" fallback={<p>fallback shown</p>}><p>a healthy page</p></ErrorBoundary>); });
    expect(container.textContent).toBe("a healthy page");
  });

  it("passes healthy children straight through", async () => {
    await act(async () => { root.render(<ErrorBoundary fallback={<p>fallback shown</p>}><p>all fine</p></ErrorBoundary>); });
    expect(container.textContent).toBe("all fine");
  });
});

describe("the home page's 3D background", () => {
  it("failing to load doesn't take the page down: the content stays, the background just doesn't appear", async () => {
    await act(async () => { root.render(<div><h1>Home page content</h1><Hero3D /></div>); });
    // let the failed lazy import settle
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(container.textContent).toContain("Home page content");
    expect(container.querySelector("canvas")).toBeNull();
  });
});
