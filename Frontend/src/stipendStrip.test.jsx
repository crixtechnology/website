import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { StipendStrip } from "./components/ui.jsx";
import { stipendInfo, programFacts } from "./utils/positions.js";

// A program's stipend on its card and page: tidy amount, "Performance based",
// and which months are training (no stipend) and which pay.

let container, root;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = (item) => act(() => root.render(<MemoryRouter><StipendStrip item={item} /></MemoryRouter>));
const text = (sel) => container.querySelector(sel) && container.querySelector(sel).textContent;

it("tidies the admin's text for display", () => {
  expect(stipendInfo({ stipend: "₹3000 - ₹7000/ month" })).toMatchObject({ amount: "₹3,000 – ₹7,000", per: "month" });
  expect(stipendInfo({ stipend: "Up to ₹6,000/month (performance based)" })).toMatchObject({ amount: "Up to ₹6,000", per: "month" });
  expect(stipendInfo({ stipend: "No Stipend" })).toEqual({ none: true });
  expect(stipendInfo({ stipend: "" })).toBeNull();
});

it("shows the amount, the badge and a month bar with training and paid months", () => {
  render({ stipend: "₹3000 - ₹7000/ month", durationDays: 180, stipendTrainingMonths: 3 });
  expect(text(".stipend-strip-amount")).toBe("₹3,000 – ₹7,000/month");
  expect(text(".stipend-strip-badge")).toBe("Performance based");
  expect(container.querySelectorAll(".stipend-track .is-training")).toHaveLength(3);
  expect(container.querySelectorAll(".stipend-track .is-paid")).toHaveLength(3);
  expect(text(".stipend-legend")).toBe("Months 1–3 · TrainingMonths 4–6 · Stipend");
});

it("shows no bar when the stipend runs from month 1", () => {
  render({ stipend: "₹4,000/month", durationDays: 90, stipendTrainingMonths: 0 });
  expect(text(".stipend-strip-amount")).toBe("₹4,000/month");
  expect(container.querySelector(".stipend-track")).toBeNull();
});

it("says plainly when a program has no stipend, and shows nothing when none is stated", () => {
  render({ stipend: "No Stipend", durationDays: 90 });
  expect(text(".stipend-strip")).toBe("StipendNot included");
  render({ stipend: "" });
  expect(container.innerHTML).toBe("");
});

it("leaves the stipend rows out of the facts when the strip draws it", () => {
  const item = { type: "internship", stipend: "₹4,000/month", durationDays: 90, stipendTrainingMonths: 1, mode: "Remote" };
  expect(programFacts(item, { stipendStrip: true }).map(([l]) => l)).toEqual(["Duration", "Mode"]);
});
