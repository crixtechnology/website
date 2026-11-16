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

// Not every Training + Internship program pays a stipend: the site must never
// promise one for every internship (only "on programs that offer one").
describe("stipend wording", () => {
  const { trainingStages, process, benefits, legal, programDeliverables } = require("../data/content.js");
  const faqs = require("../data/faqData.js").ALL_FAQS;
  const seo = require("../data/seo.json");
  it("makes no unconditional stipend promise", () => {
    const text = JSON.stringify({ trainingStages, process, benefits, legal, programDeliverables, faqs, seo });
    expect(text).not.toMatch(/stipend-based internship|stipend internship|earn a stipend|Training \+ Stipend/i);
    expect(JSON.stringify(trainingStages)).toMatch(/Stipend/);
  });
});

// Not every program includes a joining kit either.
describe("joining kit wording", () => {
  const { trainingStages, benefits, legal, programDeliverables } = require("../data/content.js");
  const faqs = require("../data/faqData.js").ALL_FAQS;
  it("never promises a kit to every trainee", () => {
    const text = JSON.stringify({ trainingStages, benefits, legal, programDeliverables, faqs });
    expect(text).not.toMatch(/Every trainee receives a physical joining kit|• A joining kit\n/);
    expect(JSON.stringify(programDeliverables)).not.toMatch(/Joining kit/);
  });
});

// Every program includes the offer letter, certificate and LOR; only the
// stipend, joining kit and LinkedIn recognition depend on the program.
describe("what every program includes", () => {
  const { trainingStages, benefits, programDeliverables } = require("../data/content.js");
  it("lists the core documents as included and the extras as optional", () => {
    const included = trainingStages[0].points.join(" ");
    ["Offer letter", "Training certificate", "Letter of Recommendation", "Mentor support", "Real project tasks", "industry experts", "resume boost"]
      .forEach((x) => expect(included).toMatch(new RegExp(x, "i")));
    expect(trainingStages[1].points).toEqual(["Stipend", "Joining kit", "LinkedIn recognition"]);
    expect(benefits.filter((b) => b.optional).map((b) => b.title).sort()).toEqual(["Joining Kit", "LinkedIn Recognition", "Stipend"]);
    expect(programDeliverables.internship).toEqual(expect.arrayContaining(["Offer letter", "Training certificate", "Letter of Recommendation"]));
  });
});

describe("per-program extras", () => {
  const { programFacts } = require("./positions.js");
  it("shows the extras a program includes, and nothing when it has none", () => {
    expect(programFacts({ joiningKit: true, linkedinRecognition: true })).toContainEqual(["Also includes", "Joining kit · LinkedIn recognition"]);
    expect(programFacts({ joiningKit: true })).toContainEqual(["Also includes", "Joining kit"]);
    expect(programFacts({}).map(([k]) => k)).not.toContain("Also includes");
  });
});
