// Answers about ONE named program or role, for the help agent (data/helpAgent.js),
// straight from the live data the Programs and Careers pages show: "price of the
// MERN internship?", "how long is Android Development?", "stipend for the data
// science intern?". Nothing here is invented — a fact the data doesn't have is
// simply left out, and the program's own page is always linked.
import { offeredTiers, planPrice, formatINR, isOpenForBuy, tierLabel } from "../utils/tiers.js";
import { formatDuration } from "../utils/duration.js";
import { startsInFuture, formatStartDate } from "../utils/startDate.js";

// Title words too common to tell one program from another.
const GENERIC = new Set([
  "with", "and", "the", "for", "your", "development", "developer", "programming", "program", "course", "courses", "internship", "intern",
  "track", "systems", "system", "fundamentals", "integration", "guided", "virtual", "basics", "complete", "building", "build", "intro",
  "introduction", "advanced", "beginner", "master", "masterclass", "bootcamp", "using", "from", "zero", "pro",
]);
// Split on dots as the message is ("React.js" -> "react", "js"), so the two match.
const keyWords = (title) => (String(title).toLowerCase().match(/[a-z0-9]+/g) || [])
  .filter((w) => w.length >= 2 && !GENERIC.has(w));

// The program or role the message names, if one stands out: the most of its
// distinctive title words present, and strictly more than any other item.
export function findNamed(items, n) {
  const list = (items || []).map((item) => ({ item, words: keyWords(item.title) })).filter((x) => x.words.length);
  // How many titles share each word: "ai" in three titles names none of them on its own.
  const shared = {};
  for (const { words } of list) for (const w of new Set(words)) shared[w] = (shared[w] || 0) + 1;
  let best = null;
  let bestScore = 0;
  let tie = false;
  for (const { item, words } of list) {
    const hits = words.filter((w) => n.includes(` ${w} `) || n.includes(` ${w}s `));
    if (!hits.length || (hits.length < 2 && shared[hits[0]] > 1)) continue;
    const score = hits.length / words.length + hits.length;
    if (score > bestScore) { best = item; bestScore = score; tie = false; } else if (score === bestScore) tie = true;
  }
  return tie ? null : best;
}

const ASPECTS = {
  price: ["price", "fee", "cost", "how much", "plans", "plan", "discount"],
  duration: ["duration", "how long", "month", "day", "week", "weeks"],
  start: ["start", "when", "batch", "begin", "date"],
  certificate: ["certificate", "lor", "letter", "offer letter"],
  syllabus: ["syllabus", "topics", "learn", "cover", "covers", "include", "includes", "what will", "content", "curriculum", "skills"],
  stipend: ["stipend", "salary", "paid", "earn"],
  mode: ["remote", "online", "office", "location", "mode", "where"],
  test: ["test", "aptitude", "exam", "questions", "marks"],
  eligibility: ["eligible", "eligibility", "who can", "fresher", "experience", "qualification"],
};
const asked = (n, aspect) => ASPECTS[aspect].some((w) => n.includes(` ${w}`));

const kind = (p) => (p.type === "internship" ? "internship" : "course");
const pageLink = (p) => ({ to: p.slug ? `/programs/${p.slug}` : "/programs", label: `Open ${p.title}` });

function priceLine(p) {
  if (!isOpenForBuy(p)) return `${p.title} isn't open for online enrolment right now — use “Request to ${p.type === "internship" ? "apply" : "enroll"}” on its page and the team will tell you about the next batch and price.`;
  const plans = offeredTiers(p);
  const lines = plans.map((t) => {
    const now = planPrice(t);
    return `• ${tierLabel(t.tier)}: ${formatINR(now)}${t.discountPercent ? ` (was ${formatINR(t.price)}, ${t.discountPercent}% off)` : ""}`;
  });
  return `${p.title} ${plans.length > 1 ? "has these plans" : "costs"}:\n${lines.join("\n")}\nWallet credit and offer codes are taken off at checkout.`;
}

// A program named in the message: answers the aspect asked about, or a short overview.
export function programAnswer(p, n) {
  const facts = [];
  const dur = formatDuration(p.durationDays);
  const starts = startsInFuture(p) ? formatStartDate(p.startsAt) : "";
  if (asked(n, "price")) facts.push(priceLine(p));
  if (asked(n, "duration")) facts.push(dur ? `${p.title} runs for ${dur}.` : `The length of ${p.title} is on its page.`);
  if (asked(n, "start")) facts.push(starts ? `The next batch starts on ${starts}.` : "You get access as soon as you enrol — there's no waiting for a batch.");
  if (asked(n, "certificate")) {
    facts.push(kind(p) === "internship"
      ? "Yes — internships come with an offer letter when you join, a completion certificate and a Letter of Recommendation at the end."
      : "Yes — you get a certificate of completion once you finish the course requirements.");
  }
  if (asked(n, "syllabus") && (p.points || []).length) facts.push(`What it covers:\n${p.points.slice(0, 6).map((x) => `• ${x}`).join("\n")}`);

  if (!facts.length) {
    const from = isOpenForBuy(p) ? Math.min(...offeredTiers(p).map(planPrice)) : null;
    facts.push([
      `${p.title} — ${kind(p) === "internship" ? "a virtual internship" : "a self-paced course"}${dur ? `, ${dur}` : ""}${from != null ? `, from ${formatINR(from)}` : ""}.`,
      p.desc || "",
      (p.points || []).length ? (p.points || []).slice(0, 4).map((x) => `• ${x}`).join("\n") : "",
    ].filter(Boolean).join("\n"));
  }
  return {
    text: facts.join("\n"),
    links: [pageLink(p)],
    chips: [
      !asked(n, "price") && { label: "Price & plans", say: `price of ${p.title}` },
      !asked(n, "syllabus") && (p.points || []).length && { label: "What it covers", say: `what does ${p.title} cover` },
      !asked(n, "duration") && { label: "How long?", say: `how long is ${p.title}` },
      { label: "How do I join?", say: "How do I join?" },
    ].filter(Boolean).slice(0, 3),
  };
}

// A Careers role named in the message.
export function roleAnswer(o, n) {
  const facts = [];
  const test = o.test || {};
  const free = o.feeRequired === false;
  if (asked(n, "stipend") && o.stipend) facts.push(`Stipend: ${o.stipend}.`);
  if (asked(n, "duration") && o.duration) facts.push(`Duration: ${o.duration}.`);
  if (asked(n, "mode") && o.mode) facts.push(`Mode: ${o.mode}.`);
  if (asked(n, "eligibility")) facts.push(`Eligibility: ${[o.experience, ...(o.eligibility || [])].filter(Boolean).join("; ") || "freshers are welcome"}.`);
  if (asked(n, "test")) facts.push(`Aptitude test: ${test.questions ? `${test.questions} questions` : "multiple-choice questions"}${test.durationMinutes ? ` in ${test.durationMinutes} minutes` : ""}, with no negative marking.`);
  if (asked(n, "price")) facts.push(free ? "This role is free to apply for — no registration fee." : "This role has an aptitude-test registration fee, shown on its card; the whole fee comes back to your wallet as credit.");
  if (!facts.length) {
    facts.push([
      `${o.title}${o.summary ? ` — ${o.summary}` : ""}`,
      [o.stipend && `• Stipend: ${o.stipend}`, o.duration && `• Duration: ${o.duration}`, o.mode && `• Mode: ${o.mode}`, o.experience && `• Experience: ${o.experience}`, `• ${free ? "Free to apply" : "Registration fee applies"}`].filter(Boolean).join("\n"),
    ].join("\n"));
  }
  return {
    text: facts.join("\n"),
    links: [{ to: "/careers", label: "See the role & apply" }],
    chips: [
      { label: "About the test", say: `aptitude test for ${o.title}` },
      { label: "Am I eligible?", say: `eligibility for ${o.title}` },
      { label: "How do I apply?", say: "How do I apply for a role?" },
    ],
  };
}
