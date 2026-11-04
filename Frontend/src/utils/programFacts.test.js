import { programFacts } from "./positions.js";

// Every program card — Training + Internship, Free Internship, Careers — lists
// the same facts in the same order; only the values come from each one's data.
const labels = (item) => programFacts(item).map(([label]) => label);
const ALL = ["Positions", "Stipend", "Experience", "Duration", "Mode", "Starts on"];

it("lists a Careers or Free Internship role's facts, Starts on included", () => {
  const role = { positions: { total: 5, filled: 0, left: 5 }, stipend: "₹6,000", experience: "Freshers", duration: "3 months", mode: "Remote", startsOn: "2nd week of January" };
  expect(labels(role)).toEqual(ALL);
  expect(programFacts(role).find(([l]) => l === "Starts on")[1]).toBe("2nd week of January");
});

it("lists a training track's facts the same way, from its own fields", () => {
  const track = { type: "internship", positions: { total: 5, filled: 1, left: 4 }, stipend: "₹4,000", experience: "Freshers", durationDays: 90, mode: "Remote", startingFrom: "15 December" };
  expect(labels(track)).toEqual(ALL);
  const facts = Object.fromEntries(programFacts(track));
  expect(facts.Duration).toBe("3 months");
  expect(facts["Starts on"]).toBe("15 December");
});

it("leaves out what isn't set", () => {
  expect(labels({ stipend: "₹4,000" })).toEqual(["Stipend"]);
});
