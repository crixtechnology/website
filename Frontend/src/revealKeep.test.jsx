import { act } from "react";
import { createRoot } from "react-dom/client";
import { Reveal } from "./components/ui.jsx";

// A card's entrance direction depends on its place in the list, so reordering
// or filtering re-renders its className. That used to wipe the "in" class the
// scroll reveal had added — the card went invisible, leaving an empty gap on
// phones. A shown Reveal must stay shown.
global.IS_REACT_ACT_ENVIRONMENT = true;

// Every observed element scrolls into view straight away.
beforeAll(() => {
  global.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe(el) { this.cb([{ isIntersecting: true, target: el }]); }
    unobserve() {}
    disconnect() {}
  };
});

it("keeps a shown element shown when its variant changes on a re-render", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<Reveal variant="reveal-l">card</Reveal>); });
  const el = container.firstChild;
  expect(el.classList.contains("in")).toBe(true);

  await act(async () => { root.render(<Reveal variant="reveal-r">card</Reveal>); });
  expect(el.className).toContain("reveal-r");
  expect(el.classList.contains("in")).toBe(true);

  act(() => root.unmount());
  container.remove();
});
