// Answers about ONE named program or role, for the help agent (data/helpAgent.js),
// straight from the live data the Programs and Careers pages show: "price of the
// MERN internship?", "how long is Android Development?", "stipend for the data
// science intern?". Nothing here is invented — a fact the data doesn't have is
// simply left out, and the program's own page is always linked.
import { offeredTiers, planPrice, listPrice, offPercent, formatINR, maskINR, isOpenForBuy, tierLabel } from "../utils/tiers.js";
import { formatDuration } from "../utils/duration.js";
import { bonusOff } from "../hooks/usePriceText.js";

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
const pageLink = (p) => ({ to: p.slug ? `/programs/${p.slug}` : "/training-internship", label: `Open ${p.title}` });

// Fees as the cards show them: the real price for a logged-in student; before
// that, masked (₹4XXX9*) and after the signup bonus (`bonus`, { amount,
// usagePercent } or null), so the chat never shows a price the page hides.
function shownPlan(t, loggedIn, bonus) {
  let now = planPrice(t);
  let was = listPrice(t);
  let pct = offPercent(t);
  const off = loggedIn ? 0 : bonusOff(now, bonus);
  if (off > 0) {
    const full = was || now;
    now = Math.max(0, now - off);
    was = full;
    pct = full > 0 ? Math.round(((full - now) / full) * 100) : 0;
  }
  return { now, was, pct };
}
const visitorNote = (bonus) => (bonus ? `Shown after the ${formatINR(bonus.amount)} signup bonus. Log in to see the full price.` : "Log in to see the full price.");

function priceLine(p, loggedIn, bonus) {
  const money = loggedIn ? formatINR : maskINR;
  // Training + Internship is bought online: quote the fee, then how to enroll.
  const howToJoin = "To join, tap “Enroll now” on its card on the Training + Internship page and pay the fee securely online with Razorpay — or call our Training + Internship team first.";
  if (p.type === "internship" && !isOpenForBuy(p)) return `Ask our Training + Internship team about the fee for ${p.title}. ${howToJoin}`;
  if (!isOpenForBuy(p)) return `${p.title} isn't open for online enrolment right now — use “Request to ${p.type === "internship" ? "apply" : "enroll"}” on its page and the team will tell you about the next batch and price.`;
  const plans = offeredTiers(p);
  const lines = plans.map((t) => {
    const { now, was, pct } = shownPlan(t, loggedIn, bonus);
    return `• ${plans.length > 1 ? `${tierLabel(t.tier)}: ` : ""}${money(now)}${was ? ` (was ${money(was)}, ${pct}% off)` : ""}`;
  });
  return `${p.title} ${plans.length > 1 ? "has these plans" : "costs"}:\n${lines.join("\n")}${loggedIn ? "" : `\n${visitorNote(bonus)}`}\n${p.type === "internship" ? howToJoin : "Wallet credit is taken off at checkout."}`;
}

// A program named in the message: answers the aspect asked about, or a short overview.
export function programAnswer(p, n, loggedIn = false, bonus = null) {
  const money = loggedIn ? formatINR : maskINR;
  const facts = [];
  const dur = formatDuration(p.durationDays);
  // A rough estimate the admin typed ("2nd week of January"); never an exact date.
  const starts = String(p.startingFrom || "").trim();
  if (asked(n, "price")) facts.push(priceLine(p, loggedIn, bonus));
  if (asked(n, "duration")) facts.push(dur ? `${p.title} runs for ${dur}.` : `The length of ${p.title} is on its page.`);
  if (asked(n, "start")) facts.push(starts ? `The next batch is expected to start ${starts} — we confirm the exact start after you enroll.` : "We confirm the batch start after you enroll.");
  if (asked(n, "test")) facts.push("There's no aptitude test for Training + Internship — you enroll online by paying the training fee, and that confirms your seat. Aptitude tests are only for Free Internship and Careers roles.");
  if (asked(n, "certificate")) {
    facts.push(kind(p) === "internship"
      ? "Yes — every program includes an offer letter, and a training certificate and Letter of Recommendation when you complete it."
      : "Yes — you get a training certificate once you complete the training.");
  }
  if (asked(n, "syllabus") && (p.points || []).length) facts.push(`What it covers:\n${p.points.slice(0, 6).map((x) => `• ${x}`).join("\n")}`);

  if (!facts.length) {
    const from = isOpenForBuy(p) ? Math.min(...offeredTiers(p).map((t) => shownPlan(t, loggedIn, bonus).now)) : null;
    facts.push([
      `${p.title} — ${"paid, mentored training with an offer letter, certificate and LOR"}${dur ? `, ${dur}` : ""}${from != null ? `, from ${money(from)}` : ""}.`,
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

// A Careers role, or a Free Internship role (audience "free"), named in the message.
export function roleAnswer(o, n) {
  const facts = [];
  const test = o.test || {};
  const free = o.audience === "free";
  if (asked(n, "stipend") && o.stipend) facts.push(`Stipend: ${o.stipend}.`);
  if (asked(n, "duration") && o.duration) facts.push(`Duration: ${o.duration}.`);
  if (asked(n, "mode") && o.mode) facts.push(`Mode: ${o.mode}.`);
  if (asked(n, "start") && o.startsOn) facts.push(`Expected to start: ${o.startsOn}${free ? " — the exact date comes with your offer letter" : ""}.`);
  if (asked(n, "eligibility")) facts.push(`Eligibility: ${[o.experience, ...(o.eligibility || [])].filter(Boolean).join("; ") || "freshers are welcome"}.`);
  if (asked(n, "test")) {
    facts.push(free
      ? "Aptitude test: after you apply through our form, our team emails you how and when to take it. Candidates who do well are invited to an interview."
      : `Aptitude test: ${test.questions ? `${test.questions} questions` : "multiple-choice questions"}${test.durationMinutes ? ` in ${test.durationMinutes} minutes` : ""}, with no negative marking.`);
  }
  if (asked(n, "price")) facts.push(free ? "This internship is free — no fee to apply, for the test or for the internship." : "This role is free to apply for — there's no registration or test fee.");
  if (!facts.length) {
    facts.push([
      `${o.title}${o.summary ? ` — ${o.summary}` : ""}`,
      [o.stipend && `• Stipend: ${o.stipend}`, o.duration && `• Duration: ${o.duration}`, o.mode && `• Mode: ${o.mode}`, o.experience && `• Experience: ${o.experience}`, "• Free to apply"].filter(Boolean).join("\n"),
    ].join("\n"));
  }
  return {
    text: facts.join("\n"),
    links: [free ? { to: "/free-internships", label: "See the internship & apply" } : { to: "/careers", label: "See the role & apply" }],
    chips: [
      { label: "About the test", say: `aptitude test for ${o.title}` },
      { label: "Am I eligible?", say: `eligibility for ${o.title}` },
      { label: "How do I apply?", say: free ? "How do I apply for a free internship?" : "How do I apply for a role?" },
    ],
  };
}
