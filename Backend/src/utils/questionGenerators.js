// Questions that are different every time.
//
// The question bank (the test_questions table) holds fixed questions. The
// generators here write a question on the spot instead: each one is a pattern —
// "simple interest on ₹P at r% for t years" — filled with fresh random values
// whenever a test paper is drawn, with the right answer worked out in code. Two
// candidates never get the same numbers, and a leaked paper is no help with the
// next one. utils/careers.js buildPaper mixes them in with bank questions, in
// the share set by the admin (Careers settings → generated questions).
//
// Every generator returns { text, options: [four distinct strings], correct }
// where `correct` is the index of the right option. Number, logic and code
// questions are computed; verbal questions are drawn from word pools, so they
// rotate rather than being computed. tests/questionGenerators.test.js runs every
// generator many times and checks each result.
const crypto = require("crypto");

// ---------- helpers ----------
const rand = (min, max) => crypto.randomInt(min, max + 1);
const pick = (items) => items[rand(0, items.length - 1)];
function shuffled(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// `n` different items from a list.
const sample = (items, n) => shuffled(items).slice(0, n);
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const fraction = (n, d) => { const g = gcd(n, d); return `${n / g}/${d / g}`; };
const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;
const round2 = (n) => Math.round(n * 100) / 100;
const pyList = (items) => `[${items.join(", ")}]`;
// 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

// Builds the question: the right answer plus three wrong ones, shuffled. Wrong
// answers that repeat the right one (or each other) are dropped; `pad(k)`, when
// given, supplies more until there are three.
function ask(text, correct, wrong, pad) {
  const options = [String(correct)];
  const has = (s) => options.some((o) => o.trim().toLowerCase() === s.trim().toLowerCase());
  for (const w of wrong) {
    const s = String(w);
    if (options.length < 4 && !has(s)) options.push(s);
  }
  for (let k = 1; pad && options.length < 4 && k < 60; k++) {
    const s = String(pad(k));
    if (!has(s)) options.push(s);
  }
  if (options.length < 4) throw new Error("Could not make four distinct options");
  const order = shuffled(options);
  return { text, options: order, correct: order.indexOf(String(correct)) };
}

// A question whose answer is a number: spare wrong answers are spaced around it.
function askNumber(text, value, wrong, format = String) {
  const step = Math.max(1, Math.round(Math.abs(value) * 0.1));
  return ask(text, format(value), wrong.filter((w) => w > 0 || value <= 0).map(format), (k) => format(value + k * step));
}

// ====================== quantitative ======================
const quantitative = [
  function simpleInterest() {
    const p = rand(2, 20) * 1000, r = rand(4, 12), t = rand(2, 5);
    const si = (p * r * t) / 100;
    return askNumber(`What is the simple interest on ${rupees(p)} at ${r}% per annum for ${t} years?`, si, [si + (p * r) / 100, si - (p * r) / 100, (p * r) / 100], rupees);
  },
  function compoundInterest() {
    const p = rand(1, 5) * 4000, r = pick([5, 10, 15, 20]);
    const ci = (p * r * (200 + r)) / 10000;
    return askNumber(`What is the compound interest on ${rupees(p)} at ${r}% per annum for 2 years, compounded annually?`, ci, [(p * 2 * r) / 100, ci + (p * r) / 100, ci - p / 100], rupees);
  },
  function workTogether() {
    const [a, b] = pick([[6, 12], [10, 15], [12, 24], [20, 30], [15, 30], [18, 9], [24, 8], [30, 45], [40, 60], [21, 28], [36, 45]]);
    const days = (a * b) / (a + b);
    return askNumber(`A alone can finish a piece of work in ${a} days and B alone in ${b} days. Working together, in how many days will they finish it?`, days, [Math.round((a + b) / 2), Math.min(a, b), days + 2], (n) => `${n} days`);
  },
  function platformLength() {
    const v = pick([10, 15, 20, 25]), t = rand(24, 40), train = rand(10, 18) * 10;
    const platform = v * t - train; // at least 60 m with these ranges
    return askNumber(`A train ${train} m long, running at ${(v * 18) / 5} km/h, takes ${t} seconds to cross a platform completely. How long is the platform?`, platform, [v * t, platform + train / 2, Math.abs(platform - train) + 30], (n) => `${n} m`);
  },
  function averageSpeed() {
    const [a, b] = pick([[40, 60], [30, 60], [20, 30], [60, 90], [45, 90], [24, 40], [36, 45]]);
    const avg = (2 * a * b) / (a + b);
    return askNumber(`A car travels from one town to another at ${a} km/h and returns by the same road at ${b} km/h. What is its average speed for the whole journey?`, avg, [(a + b) / 2, avg + 2, avg - 3], (n) => `${n} km/h`);
  },
  function markupAndDiscount() {
    const m = pick([40, 50, 60, 80]), d = pick([10, 20, 25]); // always ends in a profit
    const profit = round2(((100 + m) * (100 - d)) / 100 - 100);
    return ask(`A shopkeeper marks his goods ${m}% above the cost price and then allows a discount of ${d}%. What is his profit percentage?`, `${profit}%`, [`${m - d}%`, `${round2(profit + d / 2)}%`, `${round2(m - d / 2)}%`], (k) => `${round2(profit + k * 2.5)}%`);
  },
  function populationChange() {
    const p = rand(2, 9) * 10000, up = pick([10, 20, 25]), down = pick([10, 20, 25]);
    const result = (p * (100 + up) * (100 - down)) / 10000;
    return askNumber(`A town has ${p.toLocaleString("en-IN")} people. Its population rises by ${up}% in the first year and falls by ${down}% in the second. What is the population after two years?`, result, [(p * (100 + up - down)) / 100 + (up === down ? p / 100 : 0), (p * (100 + up)) / 100, result + p / 100], (n) => n.toLocaleString("en-IN"));
  },
  function diceSum() {
    const s = rand(4, 10);
    const ways = (x) => (x <= 7 ? x - 1 : 13 - x);
    return ask(`Two dice are thrown together. What is the probability that the numbers add up to ${s}?`, fraction(ways(s), 36), [fraction(ways(s) + 1, 36), fraction(ways(s) - 1 || 7, 36), fraction(s, 36), "1/2", "1/4"]);
  },
  function progressionSum() {
    const a = rand(2, 9), d = rand(2, 6), n = pick([10, 12, 15, 20]);
    const sum = (n * (2 * a + (n - 1) * d)) / 2;
    return askNumber(`What is the sum of the first ${n} terms of the arithmetic progression ${a}, ${a + d}, ${a + 2 * d}, ${a + 3 * d}, ...?`, sum, [sum - n * d, sum + n, (n * (a + (n - 1) * d)) / (n % 2 ? 1 : 2)]);
  },
  function fatherAndSon() {
    const [m, n, k] = pick([[3, 2, 10], [3, 2, 12], [3, 2, 15], [4, 3, 5], [5, 3, 8], [4, 2, 16], [4, 3, 4]]);
    const son = (k * (n - 1)) / (m - n);
    const times = ["", "", "twice", "three times", "four times", "five times"];
    return askNumber(`A father is ${times[m]} as old as his son. After ${k} years he will be ${times[n]} as old as his son. What is the father's present age?`, m * son, [m * son + k, n * (son + k), m * son - m], (x) => `${x} years`);
  },
  function unitsDigit() {
    const base = pick([2, 3, 7, 8]), e = rand(21, 99);
    let digit = 1;
    for (let i = 0; i < e; i++) digit = (digit * base) % 10;
    return ask(`What is the units digit of ${base} raised to the power ${e}?`, digit, shuffled([1, 2, 3, 4, 6, 7, 8, 9]));
  },
  function otherNumberFromHcfLcm() {
    const h = pick([4, 6, 8, 12, 15]), [p, q] = pick([[2, 3], [3, 4], [3, 5], [4, 5], [2, 5], [5, 6], [3, 7]]);
    const a = h * p, b = h * q, lcm = h * p * q;
    return askNumber(`The HCF of two numbers is ${h} and their LCM is ${lcm}. If one of the numbers is ${a}, what is the other?`, b, [lcm / h, b + h, h * (q + 2)]);
  },
];

// ====================== logical reasoning ======================
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const shiftWord = (word, k) => word.replace(/[A-Z]/g, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 65 + k + 26) % 26) + 65));
const CODE_WORDS = ["PLANET", "MARKET", "SILVER", "BRIDGE", "GARDEN", "WINTER", "CAMERA", "ROCKET", "FOREST", "CANDLE", "ORANGE", "TICKET", "MONKEY", "BUTTON"];

const logical = [
  function growingGapSeries() {
    const start = rand(2, 12), d = rand(2, 6), k = rand(2, 5);
    const terms = [start];
    for (let i = 0; i < 5; i++) terms.push(terms[i] + d + i * k);
    const next = terms.pop();
    return askNumber(`Find the next number in the series: ${terms.join(", ")}, ?`, next, [next - k, next + k, next + d]);
  },
  function multiplyAddSeries() {
    const start = rand(2, 5), m = pick([2, 3]), c = pick([-1, 1, 2, 3]); // never a flat series
    const terms = [start];
    for (let i = 0; i < 5; i++) terms.push(terms[i] * m + c);
    const next = terms.pop();
    return askNumber(`Find the next number in the series: ${terms.join(", ")}, ?`, next, [next - c * 2 || next + 5, terms[4] * m, next + m]);
  },
  function squareSeries() {
    const from = rand(2, 7), c = pick([-3, -2, -1, 1, 2, 3, 4, 5]);
    const terms = [0, 1, 2, 3, 4].map((i) => (from + i) ** 2 + c);
    const next = (from + 5) ** 2 + c;
    return askNumber(`Find the next number in the series: ${terms.join(", ")}, ?`, next, [next - c, (from + 5) ** 2 + c + 2, terms[4] + (terms[4] - terms[3])]);
  },
  function letterCode() {
    const [a, b] = sample(CODE_WORDS, 2), k = pick([1, 2, 3, 4, -1, -2]);
    const right = shiftWord(b, k);
    const oneOff = right.slice(0, -1) + shiftWord(right.slice(-1), 1);
    return ask(`In a certain code, ${a} is written as ${shiftWord(a, k)}. How is ${b} written in that code?`, right, [shiftWord(b, k + 1), shiftWord(b, k - 1), oneOff, shiftWord(b, -k)]);
  },
  function rankFromBottom() {
    const total = rand(30, 60), top = rand(8, 25);
    const bottom = total - top + 1;
    return ask(`In a class of ${total} students, Meera ranks ${ordinal(top)} from the top. What is her rank from the bottom?`, ordinal(bottom), [ordinal(bottom - 1), ordinal(bottom + 1), ordinal(bottom - 2)]);
  },
  function rowAfterExchange() {
    const a = rand(8, 15), c = a + rand(5, 12), b = rand(10, 20);
    const total = c + b - 1;
    return askNumber(`In a row of people, A is ${ordinal(a)} from the left and B is ${ordinal(b)} from the right. When they exchange places, A becomes ${ordinal(c)} from the left. How many people are in the row?`, total, [total + 1, total - 1, a + b + c]);
  },
  function distanceFromStart() {
    const [east, extra, far] = pick([[3, 4, 5], [4, 3, 5], [6, 8, 10], [8, 6, 10], [5, 12, 13], [12, 5, 13], [8, 15, 17]]);
    const north = rand(2, 9);
    return askNumber(`A man walks ${north} km north, turns right and walks ${east} km, then turns right again and walks ${north + extra} km. How far is he from his starting point?`, far, [east + extra, far + 2, north + extra], (n) => `${n} km`);
  },
  function playsNeither() {
    const both = rand(5, 12), a = both + rand(10, 20), b = both + rand(8, 18), neither = rand(3, 12);
    const total = a + b - both + neither;
    return askNumber(`In a group of ${total} students, ${a} play cricket, ${b} play football and ${both} play both. How many play neither game?`, neither, [neither + both, total - a - b + 2 * both, neither + 2]);
  },
  function clockAngle() {
    const h = rand(1, 11), m = pick([10, 20, 40, 50]);
    const raw = Math.abs(30 * h - 5.5 * m);
    const angle = Math.min(raw, 360 - raw);
    return ask(`What is the smaller angle between the hour hand and the minute hand of a clock at ${h}:${m}?`, `${angle}°`, [`${angle + 5}°`, `${Math.abs(30 * h - 6 * m) % 180 || 15}°`, `${angle + 10}°`], (k) => `${angle + 10 + k * 5}°`);
  },
  function paintedCube() {
    const n = rand(3, 6), faces = pick([0, 1, 2]);
    const counts = [(n - 2) ** 3, 6 * (n - 2) ** 2, 12 * (n - 2)];
    const label = ["no painted face", "exactly one painted face", "exactly two painted faces"][faces];
    return askNumber(`A cube is painted on all its faces and then cut into ${n ** 3} equal small cubes. How many of the small cubes have ${label}?`, counts[faces], [counts[(faces + 1) % 3], counts[(faces + 2) % 3], 8]);
  },
  function dayAfterManyDays() {
    const today = rand(0, 6), n = rand(30, 200);
    return ask(`If today is ${DAYS[today]}, what day of the week will it be ${n} days from now?`, DAYS[(today + n) % 7], shuffled(DAYS));
  },
  function hiddenOperation() {
    const [rule, f] = pick([
      ["squares", (a, b) => a * a + b * b],
      ["product", (a, b) => a * b + a + b],
      ["sum", (a, b) => (a + b) ** 2],
    ]);
    const pairs = [];
    while (pairs.length < 4) {
      const p = [rand(2, 7), rand(2, 9)];
      if (p[0] !== p[1] && !pairs.some((q) => q[0] === p[0] && q[1] === p[1])) pairs.push(p);
    }
    const [x, y] = pairs[3];
    const answer = f(x, y);
    const shown = pairs.slice(0, 3).map(([a, b]) => `${a} * ${b} = ${f(a, b)}`).join(", ");
    const others = { squares: [x * y + x + y, (x + y) ** 2], product: [x * x + y * y, (x + y) ** 2], sum: [x * x + y * y, x * y + x + y] }[rule];
    return askNumber(`If ${shown}, then ${x} * ${y} = ?`, answer, [...others, answer + x]);
  },
];

// ====================== verbal ability ======================
// Drawn from pools: the word asked about, and the wrong options, change each time.
const SYNONYMS = [
  ["ephemeral", "short-lived"], ["candid", "frank"], ["mitigate", "lessen"], ["tenacious", "persistent"], ["lucid", "clear"],
  ["arduous", "difficult"], ["benign", "harmless"], ["concur", "agree"], ["deter", "discourage"], ["elated", "overjoyed"],
  ["futile", "pointless"], ["augment", "increase"], ["jovial", "cheerful"], ["meticulous", "thorough"], ["novice", "beginner"],
  ["obsolete", "outdated"], ["abundant", "plentiful"], ["reluctant", "unwilling"], ["scrutinise", "examine"], ["terse", "brief"],
  ["frugal", "thrifty"], ["wary", "cautious"], ["zealous", "enthusiastic"], ["adept", "skilled"],
];
const ANTONYMS = [
  ["benevolent", "cruel"], ["verbose", "concise"], ["frugal", "extravagant"], ["transient", "permanent"], ["diligent", "lazy"],
  ["scarcity", "abundance"], ["exacerbate", "soothe"], ["amateur", "professional"], ["bold", "timid"], ["complex", "simple"],
  ["expand", "shrink"], ["flexible", "rigid"], ["genuine", "fake"], ["hostile", "friendly"], ["include", "exclude"],
  ["majority", "minority"], ["optimistic", "gloomy"], ["praise", "criticise"], ["reject", "accept"], ["victory", "defeat"],
];
const IDIOMS = [
  ["to burn the midnight oil", "to work late into the night"], ["a blessing in disguise", "something good that seemed bad at first"],
  ["to beat around the bush", "to avoid coming to the point"], ["to bite the bullet", "to face a difficult situation bravely"],
  ["to hit the nail on the head", "to describe something exactly right"], ["once in a blue moon", "very rarely"],
  ["to let the cat out of the bag", "to reveal a secret by mistake"], ["a piece of cake", "something very easy"],
  ["to cost an arm and a leg", "to be very expensive"], ["to be under the weather", "to feel slightly ill"],
  ["to break the ice", "to get people talking in an awkward situation"], ["to call it a day", "to stop working for now"],
  ["to sit on the fence", "to avoid taking a side"], ["to spill the beans", "to tell something that was meant to be kept private"],
];
const ONE_WORD = [
  ["a person who knows and uses many languages", "Polyglot"], ["government by a small group of people", "Oligarchy"],
  ["a person who dislikes people in general", "Misanthrope"], ["a speech given without preparation", "Extempore"],
  ["a person who collects stamps", "Philatelist"], ["a person who loves books", "Bibliophile"],
  ["a remedy for every disease or problem", "Panacea"], ["a person who walks in their sleep", "Somnambulist"],
  ["the study of handwriting", "Graphology"], ["a place where birds are kept", "Aviary"],
  ["a person who eats both plants and meat", "Omnivore"], ["a person who is new to a job or skill", "Novice"],
  ["a statement that seems to contradict itself", "Paradox"], ["a fear of confined spaces", "Claustrophobia"],
];
const SPELLINGS = [
  ["Accommodate", ["Accomodate", "Acommodate", "Acomodate"]], ["Conscientious", ["Concientious", "Consciencious", "Conscientous"]],
  ["Entrepreneur", ["Enterpreneur", "Entreprenuer", "Entreprener"]], ["Maintenance", ["Maintainance", "Maintenence", "Maintanance"]],
  ["Occurrence", ["Occurence", "Ocurrence", "Occurrance"]], ["Privilege", ["Priviledge", "Privelege", "Privilage"]],
  ["Recommend", ["Reccomend", "Recomend", "Reccommend"]], ["Separate", ["Seperate", "Separete", "Seprate"]],
  ["Definitely", ["Definately", "Definitly", "Defanitely"]], ["Embarrass", ["Embarass", "Embaress", "Embarras"]],
  ["Necessary", ["Neccessary", "Necesary", "Neccesary"]], ["Questionnaire", ["Questionaire", "Questionnare", "Questionairre"]],
];
// [sentence with a blank, the right word, three wrong ones]
const PREPOSITIONS = [
  ["He was accused ___ stealing the documents.", "of", ["for", "with", "about"]], ["I prefer tea ___ coffee.", "to", ["than", "from", "over than"]],
  ["She is capable ___ leading the team.", "of", ["to", "for", "in"]], ["They congratulated him ___ his promotion.", "on", ["for", "at", "with"]],
  ["He insisted ___ paying the bill.", "on", ["to", "for", "at"]], ["She has been absent ___ work since Monday.", "from", ["of", "at", "to"]],
  ["The manager is angry ___ the delay.", "about", ["on", "of", "to"]], ["He is married ___ a doctor.", "to", ["with", "by", "of"]],
  ["She apologised ___ being late.", "for", ["of", "on", "about"]], ["This rule applies ___ everyone.", "to", ["on", "for", "with"]],
  ["He succeeded ___ solving the puzzle.", "in", ["at", "to", "on"]], ["I am familiar ___ this software.", "with", ["to", "of", "about"]],
];
const AGREEMENT = [
  ["The manager, along with his assistants, ___ attending the meeting.", "is", ["are", "were", "have been"]],
  ["Each of the students ___ submitted the assignment.", "has", ["have", "are", "were"]],
  ["Neither the teacher nor the students ___ aware of the change.", "were", ["was", "is", "has been"]],
  ["The news about the results ___ surprising.", "was", ["were", "are", "have been"]],
  ["One of my friends ___ in Bengaluru.", "lives", ["live", "are living", "have lived"]],
  ["A bunch of keys ___ lying on the table.", "is", ["are", "were", "have been"]],
  ["Either my brother or my parents ___ coming tomorrow.", "are", ["is", "was", "has been"]],
  ["Ten kilometres ___ a long distance to walk.", "is", ["are", "were", "have been"]],
  ["The quality of these mangoes ___ not good.", "is", ["are", "were", "have been"]],
  ["Everybody in the two teams ___ ready.", "is", ["are", "were", "have been"]],
];
const TENSES = [
  ["If I ___ you, I would accept the offer.", "were", ["was", "am", "had been"]],
  ["By the time we reach the theatre, the film ___.", "will have started", ["will start", "has started", "would start"]],
  ["I wish I ___ harder for the exam last year.", "had studied", ["studied", "have studied", "would study"]],
  ["She has been living in Pune ___ five years.", "for", ["since", "from", "by"]],
  ["Hardly had he reached the station ___ the train left.", "when", ["than", "then", "that"]],
  ["No sooner had she finished speaking ___ the audience applauded.", "than", ["when", "then", "that"]],
  ["If it rains tomorrow, we ___ the match.", "will cancel", ["would cancel", "cancelled", "had cancelled"]],
  ["He ___ in this company since 2019.", "has worked", ["worked", "is working", "works"]],
  ["When I reached home, my brother ___ already left.", "had", ["has", "was", "have"]],
  ["She would have passed if she ___ more.", "had practised", ["practised", "has practised", "would practise"]],
];

const fromPool = (pool, question) => () => {
  const [asked, ...others] = sample(pool, 4);
  return ask(question(asked[0]), asked[1], others.map((o) => o[1]));
};
const fillBlank = (pool) => () => {
  const [sentence, right, wrong] = pick(pool);
  return ask(`Fill in the blank: "${sentence}"`, right, wrong);
};

const verbal = [
  fromPool(SYNONYMS, (w) => `Choose the word or phrase closest in meaning to "${w}".`),
  fromPool(SYNONYMS, (w) => `Which of these could best replace "${w}" in a sentence?`),
  fromPool(ANTONYMS, (w) => `Choose the word opposite in meaning to "${w}".`),
  fromPool(IDIOMS, (w) => `What does the idiom "${w}" mean?`),
  fromPool(ONE_WORD, (w) => `Which single word means: ${w}?`),
  function spelling() {
    const [right, wrong] = pick(SPELLINGS);
    return ask("Which word is spelled correctly?", right, wrong);
  },
  fillBlank(PREPOSITIONS),
  fillBlank(AGREEMENT),
  fillBlank(TENSES),
];

// ====================== web development ======================
const web = [
  function reduceSum() {
    const items = [rand(1, 9), rand(1, 9), rand(1, 9), rand(1, 9)], start = rand(5, 20);
    const sum = items.reduce((a, b) => a + b, start);
    return askNumber(`What does this code print?\nconsole.log([${items.join(", ")}].reduce((a, b) => a + b, ${start}));`, sum, [sum - start, sum + items[0], items.reduce((a, b) => a * b, 1)]);
  },
  function filterAndMap() {
    const items = Array.from({ length: 6 }, () => rand(1, 20)), k = rand(2, 5);
    const result = items.filter((x) => x % 2 === 0).map((x) => x * k);
    const odd = items.filter((x) => x % 2 !== 0).map((x) => x * k);
    return ask(`What does this code print?\nconst a = [${items.join(", ")}];\nconsole.log(a.filter(x => x % 2 === 0).map(x => x * ${k}).length);`, result.length, [odd.length, items.length, result.length + 1], (n) => result.length + n + 1);
  },
  function stringCoercion() {
    const a = rand(1, 9), b = rand(1, 9), c = rand(1, 9);
    const value = Number(`${a}${b}`) - c;
    return ask(`What does console.log(${a} + "${b}" - ${c}) print?`, value, [a + b - c, `"${a}${b}${c}"`, "NaN", `"${a}${b - c}"`], (k) => value + k);
  },
  function boxWidth() {
    const w = rand(10, 30) * 10, p = rand(1, 4) * 10, b = rand(1, 5), borderBox = rand(0, 1) === 1;
    const total = borderBox ? w : w + 2 * p + 2 * b;
    return askNumber(`An element has ${borderBox ? "box-sizing: border-box" : "the default box-sizing"}, width: ${w}px, padding: ${p}px and border: ${b}px solid. How wide is it on screen?`, total, [w + 2 * p + 2 * b, w, w + p + b, w + 2 * p], (n) => `${n}px`);
  },
  function closureCounter() {
    const start = rand(0, 10), step = rand(2, 5), calls = rand(3, 5);
    const lines = Array.from({ length: calls - 1 }, () => "next();").join(" ");
    return askNumber(`What does this code print?\nfunction counter() {\n  let c = ${start};\n  return () => (c += ${step});\n}\nconst next = counter();\n${lines}\nconsole.log(next());`, start + calls * step, [start + (calls - 1) * step, start + step, calls * step + (start === 0 ? 1 : 0)]);
  },
  function spliceLength() {
    const items = Array.from({ length: rand(6, 9) }, (_, i) => i + 1), at = rand(1, 3), count = rand(1, 3);
    const viaSplice = rand(0, 1) === 1;
    const code = viaSplice ? `a.splice(${at}, ${count});` : `a.slice(${at}, ${at + count});`;
    const answer = viaSplice ? items.length - count : items.length;
    return askNumber(`What does this code print?\nconst a = [${items.join(", ")}];\n${code}\nconsole.log(a.length);`, answer, [items.length - count, items.length, count, items.length - at]);
  },
  function remToPixels() {
    const root = pick([10, 14, 16, 18, 20]), parent = pick([12, 24, 30]), size = pick([1.5, 2, 2.5, 3]);
    return askNumber(`The html element has font-size: ${root}px and a parent element has font-size: ${parent}px. How wide is a child with width: ${size}rem?`, size * root, [size * parent, root, size * 16 === size * root ? size * 12 : size * 16], (n) => `${n}px`);
  },
  function stateUpdates() {
    const n = rand(0, 5), k = rand(1, 4), functional = rand(0, 1) === 1;
    const call = functional ? `setN(prev => prev + ${k});` : `setN(n + ${k});`;
    const answer = functional ? n + 2 * k : n + k;
    return askNumber(`A React component has const [n, setN] = useState(${n}). One click runs these two lines:\n${call}\n${call}\nWhat is n after that single click?`, answer, [n + k, n + 2 * k, n, k]);
  },
  function loopSum() {
    const limit = rand(10, 20), k = rand(2, 4);
    let sum = 0;
    for (let i = 1; i <= limit; i++) if (i % k === 0) sum += i;
    return askNumber(`What does this code print?\nlet s = 0;\nfor (let i = 1; i <= ${limit}; i++) {\n  if (i % ${k} === 0) s += i;\n}\nconsole.log(s);`, sum, [sum + k, (limit * (limit + 1)) / 2, Math.floor(limit / k)]);
  },
  function flexShares() {
    const parts = [rand(1, 3), rand(1, 3), rand(1, 4)], unit = pick([50, 60, 80, 100]), which = rand(0, 2);
    const total = parts.reduce((a, b) => a + b, 0) * unit;
    return askNumber(`A flex container is ${total}px wide and holds three items with flex: ${parts[0]}, flex: ${parts[1]} and flex: ${parts[2]} (no gaps, padding or content width). How wide is the ${["first", "second", "third"][which]} item?`, parts[which] * unit, [total / 3, parts[(which + 1) % 3] * unit, unit], (n) => `${Math.round(n)}px`);
  },
  function truthyCount() {
    const pool = ["0", "\"\"", "\"0\"", "null", "[]", "NaN", "\"false\"", "undefined", "{}", "1", "-1"];
    const truthy = new Set(["\"0\"", "[]", "\"false\"", "{}", "1", "-1"]);
    const items = sample(pool, 6);
    const count = items.filter((x) => truthy.has(x)).length;
    return askNumber(`What does this code print?\nconsole.log([${items.join(", ")}].filter(Boolean).length);`, count, [6 - count, count + 1, count - 1, 6]);
  },
  function spreadMax() {
    const a = Array.from({ length: 3 }, () => rand(1, 30)), b = Array.from({ length: 3 }, () => rand(1, 30));
    const max = Math.max(...a, ...b);
    return askNumber(`What does this code print?\nconst a = [${a.join(", ")}];\nconst b = [${b.join(", ")}];\nconsole.log(Math.max(...a, ...b) - [...a, ...b].length);`, max - 6, [max, max - 3, Math.min(...a, ...b)]);
  },
];

// ====================== full stack ======================
const STATUS_CASES = [
  ["A new resource was created successfully.", "201"], ["The request needs a login, and none was sent.", "401"],
  ["The user is logged in but is not allowed to do this.", "403"], ["The requested resource does not exist.", "404"],
  ["The client has sent too many requests in a short time.", "429"], ["The request succeeded and there is no content to return.", "204"],
  ["The request clashes with the current state, such as a duplicate email.", "409"], ["The server hit an unexpected error.", "500"],
  ["The resource has moved permanently to a new address.", "301"], ["The cached copy the client holds is still valid.", "304"],
];
const tableText = (header, rows) => [header.join(" | "), ...rows.map((r) => r.join(" | "))].join("\n");

const fullstack = [
  function paginationOffset() {
    const page = rand(3, 12), limit = pick([10, 20, 25, 50]);
    return askNumber(`An API returns ${limit} items per page. Which OFFSET does the SQL query need for page ${page} (pages start at 1)?`, (page - 1) * limit, [page * limit, (page + 1) * limit, page]);
  },
  function totalPages() {
    const limit = pick([10, 20, 25]), rows = rand(5, 30) * limit + rand(1, limit - 1);
    return askNumber(`A table has ${rows} rows and the API shows ${limit} per page. How many pages are there?`, Math.ceil(rows / limit), [Math.floor(rows / limit), Math.ceil(rows / limit) + 1, limit]);
  },
  function caretRange() {
    const a = rand(1, 5), b = rand(1, 8), c = rand(1, 9);
    return ask(`package.json lists a dependency as "^${a}.${b}.${c}". Which of these versions is npm allowed to install?`, `${a}.${b + rand(1, 3)}.${rand(0, 5)}`, [`${a + 1}.0.0`, `${a}.${b}.${c - 1}`, `${a}.${b - 1}.${c + 3}`]);
  },
  function statusCode() {
    const [asked, ...others] = sample(STATUS_CASES, 4);
    return ask(`Which HTTP status code fits this best? ${asked[0]}`, asked[1], others.map((o) => o[1]));
  },
  function countWhere() {
    const amounts = Array.from({ length: 6 }, () => rand(1, 20) * 50), limit = rand(4, 14) * 50 + 25;
    const count = amounts.filter((x) => x > limit).length;
    const table = tableText(["id", "amount"], amounts.map((x, i) => [i + 1, x]));
    return askNumber(`The orders table holds these rows:\n${table}\n\nWhat does SELECT COUNT(*) FROM orders WHERE amount > ${limit}; return?`, count, [6 - count, count + 1, 6, count - 1]);
  },
  function sumByDepartment() {
    const rows = Array.from({ length: 6 }, (_, i) => [i + 1, pick(["Sales", "Tech"]), rand(20, 60) * 1000]);
    rows[0][1] = "Sales";
    rows[1][1] = "Tech";
    const dept = pick(["Sales", "Tech"]);
    const total = rows.filter((r) => r[1] === dept).reduce((s, r) => s + r[2], 0);
    const all = rows.reduce((s, r) => s + r[2], 0);
    return askNumber(`The employees table holds these rows:\n${tableText(["id", "dept", "salary"], rows)}\n\nWhat does SELECT SUM(salary) FROM employees WHERE dept = '${dept}'; return?`, total, [all - total, all, total + rows[0][2]]);
  },
  function rateLimited() {
    const limit = pick([20, 30, 50, 100]), sent = limit + rand(5, 40), minutes = pick([1, 5, 15]);
    return askNumber(`An API allows ${limit} requests per client every ${minutes} minute${minutes === 1 ? "" : "s"}. A client sends ${sent} requests inside one window. How many of them get a 429 response?`, sent - limit, [sent, limit, sent - limit + 1]);
  },
  function joinRows() {
    const customers = rand(6, 12), withOrder = rand(2, customers - 2), left = rand(0, 1) === 1;
    return askNumber(`A customers table has ${customers} rows. ${withOrder} of those customers have exactly one row each in the orders table; the rest have none. How many rows does customers ${left ? "LEFT JOIN" : "INNER JOIN"} orders (joined on the customer id) return?`, left ? customers : withOrder, [left ? withOrder : customers, customers + withOrder, customers - withOrder]);
  },
  function commitsAfterCommand() {
    const commits = rand(6, 15), k = rand(1, 3), reset = rand(0, 1) === 1;
    const text = reset
      ? `A branch has ${commits} commits. You run git reset --soft HEAD~${k}. How many commits does the branch have now?`
      : `A branch has ${commits} commits. You run git revert on the latest commit. How many commits does the branch have now?`;
    return askNumber(text, reset ? commits - k : commits + 1, [commits, commits - 1, commits + k, commits - k - 1]);
  },
  function eventLoopOrder() {
    const [sync, micro, timer] = sample(["A", "B", "C", "D", "E"], 3);
    const lines = shuffled([
      [`console.log("${sync}");`, 0],
      [`Promise.resolve().then(() => console.log("${micro}"));`, 1],
      [`setTimeout(() => console.log("${timer}"), 0);`, 2],
    ]);
    const written = lines.map((l) => [sync, micro, timer][l[1]]).join(" ");
    const right = `${sync} ${micro} ${timer}`;
    return ask(`In what order does this Node.js code print?\n${lines.map((l) => l[0]).join("\n")}`, right, [written, `${sync} ${timer} ${micro}`, `${micro} ${sync} ${timer}`, `${timer} ${micro} ${sync}`, `${timer} ${sync} ${micro}`]);
  },
  function routeParams() {
    const user = rand(10, 99), order = rand(100, 999), page = rand(2, 9);
    return ask(`An Express app defines the route /users/:id/orders/:orderId. For the request GET /users/${user}/orders/${order}?page=${page}, what is req.params.orderId?`, `"${order}"`, [`"${user}"`, `"${page}"`, "undefined", String(order)]);
  },
  function mongoFilter() {
    const ages = Array.from({ length: 7 }, () => rand(15, 30)), limit = rand(18, 25);
    const count = ages.filter((a) => a >= limit).length;
    return askNumber(`A users collection holds seven documents with these ages: ${ages.join(", ")}. How many documents does db.users.find({ age: { $gte: ${limit} } }) return?`, count, [ages.filter((a) => a > limit).length, 7 - count, count + 1, count - 1]);
  },
];

// ====================== data science ======================
const datascience = [
  function meanOfValues() {
    const values = Array.from({ length: 4 }, () => rand(5, 40));
    const partial = values.reduce((a, b) => a + b, 0);
    values.push(5 - (partial % 5) + rand(1, 6) * 5); // makes the total divisible by 5
    const mean = values.reduce((a, b) => a + b, 0) / 5;
    const sorted = values.slice().sort((a, b) => a - b);
    return askNumber(`What is the mean of ${values.join(", ")}?`, mean, [sorted[2] === mean ? mean + 1 : sorted[2], mean + 2, mean - 1]);
  },
  function medianOfValues() {
    const n = pick([5, 6, 7]);
    const values = Array.from({ length: n }, () => rand(1, 40));
    const sorted = values.slice().sort((a, b) => a - b);
    const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    const mean = round2(values.reduce((a, b) => a + b, 0) / n);
    return askNumber(`What is the median of ${values.join(", ")}?`, median, [values[Math.floor(n / 2)], mean, sorted[Math.floor(n / 2) - 1]]);
  },
  function zScore() {
    const mean = rand(4, 9) * 10, sd = pick([4, 5, 8, 10]), k = pick([-2, -1.5, -1, 1, 1.5, 2, 2.5]);
    return ask(`Exam scores have a mean of ${mean} and a standard deviation of ${sd}. What is the z-score of a score of ${mean + k * sd}?`, k, [-k, k * sd, round2((mean + k * sd) / sd), k + 1]);
  },
  function precisionOrRecall() {
    const tp = rand(3, 9) * 10, fp = rand(1, 5) * 10, fn = rand(1, 5) * 10, tn = rand(3, 9) * 10;
    const precision = round2(tp / (tp + fp)), recall = round2(tp / (tp + fn));
    const accuracy = round2((tp + tn) / (tp + fp + fn + tn)), specificity = round2(tn / (tn + fp));
    const wantPrecision = rand(0, 1) === 1;
    const answer = wantPrecision ? precision : recall;
    return ask(`A classifier gives TP = ${tp}, FP = ${fp}, FN = ${fn} and TN = ${tn}. What is its ${wantPrecision ? "precision" : "recall"}, to two decimal places?`, answer, [wantPrecision ? recall : precision, accuracy, specificity], (j) => round2(Math.min(0.99, answer + j * 0.03)));
  },
  function accuracy() {
    const tp = rand(20, 45), tn = rand(20, 45), wrong = 100 - tp - tn, fp = rand(1, wrong - 1);
    return ask(`Out of 100 test cases a model gives TP = ${tp}, TN = ${tn}, FP = ${fp} and FN = ${wrong - fp}. What is its accuracy?`, `${tp + tn}%`, [`${tp}%`, `${100 - tp - tn}%`, `${tn}%`], (j) => `${tp + tn + j}%`);
  },
  function listSlice() {
    const values = Array.from({ length: 7 }, () => rand(1, 30));
    const [code, result] = pick([
      ["x[2:5]", values.slice(2, 5)], ["x[-3:]", values.slice(-3)], ["x[::2]", values.filter((_, i) => i % 2 === 0)],
      ["x[1:6:2]", [values[1], values[3], values[5]]], ["x[:3]", values.slice(0, 3)], ["x[::-1][:3]", values.slice().reverse().slice(0, 3)],
    ]);
    return ask(`What does this Python code print?\nx = ${pyList(values)}\nprint(${code})`, pyList(result), [pyList(values.slice(1, 4)), pyList(values.slice(3, 6)), pyList(values.slice(0, 4)), pyList(values.slice(-4)), pyList(values.slice(2, 4))]);
  },
  function comprehension() {
    const n = rand(6, 10), k = rand(2, 4), m = pick([2, 3]);
    const result = [];
    for (let i = 0; i < n; i++) if (i % m === 0) result.push(i * k);
    const sum = result.reduce((a, b) => a + b, 0);
    return askNumber(`What does this Python code print?\nprint(sum([i * ${k} for i in range(${n}) if i % ${m} == 0]))`, sum, [sum + n * k, result.length, sum - result[result.length - 1], sum + k]);
  },
  function groupTotal() {
    const cities = ["Pune", "Surat"];
    const rows = [["Pune", rand(1, 9) * 10], ["Surat", rand(1, 9) * 10], ["Pune", rand(1, 9) * 10], ["Surat", rand(1, 9) * 10], [pick(cities), rand(1, 9) * 10]];
    const city = pick(cities);
    const mine = rows.filter((r) => r[0] === city).map((r) => r[1]);
    const total = mine.reduce((a, b) => a + b, 0);
    const overall = rows.reduce((a, r) => a + r[1], 0);
    const data = `df = pd.DataFrame({"city": ${JSON.stringify(rows.map((r) => r[0]))}, "sales": ${pyList(rows.map((r) => r[1]))}})`;
    return askNumber(`What does this code print?\n${data}\nprint(df.groupby("city")["sales"].sum()["${city}"])`, total, [overall, overall - total, Math.max(...mine), mine.length]);
  },
  function axisSum() {
    const m = [[rand(1, 9), rand(1, 9), rand(1, 9)], [rand(1, 9), rand(1, 9), rand(1, 9)]], axis = rand(0, 1);
    const columns = [0, 1, 2].map((j) => m[0][j] + m[1][j]);
    const rows = m.map((r) => r.reduce((a, b) => a + b, 0));
    const total = rows[0] + rows[1];
    return ask(`What does this code print?\na = np.array([${pyList(m[0])}, ${pyList(m[1])}])\nprint(a.sum(axis=${axis}).tolist())`, pyList(axis === 0 ? columns : rows), [pyList(axis === 0 ? rows : columns), String(total), pyList([...m[0], ...m[1]]), pyList([total])]);
  },
  function sqlAverage() {
    // Two rows for team A and four for team B, in multiples of 10, so the average is exact.
    const rows = shuffled(["A", "A", "B", "B", "B", "B"]).map((team, i) => [i + 1, team, rand(1, 9) * 10]);
    const group = pick(["A", "B"]);
    const mine = rows.filter((r) => r[1] === group).map((r) => r[2]);
    const avg = round2(mine.reduce((a, b) => a + b, 0) / mine.length);
    const overall = round2(rows.reduce((a, r) => a + r[2], 0) / rows.length);
    return askNumber(`A scores table holds these rows:\n${[["id", "team", "score"], ...rows].map((r) => r.join(" | ")).join("\n")}\n\nWhat does SELECT AVG(score) FROM scores WHERE team = '${group}'; return?`, avg, [overall, mine.reduce((a, b) => a + b, 0), mine.length]);
  },
  function bothRed() {
    const red = rand(3, 7), blue = rand(2, 6), total = red + blue;
    return ask(`A bag holds ${red} red and ${blue} blue balls. Two are drawn one after the other without replacement. What is the probability that both are red?`, fraction(red * (red - 1), total * (total - 1)), [fraction(red * red, total * total), fraction(red, total), fraction(red * blue, total * (total - 1)), fraction(blue * (blue - 1), total * (total - 1)), "1/2"]);
  },
  function variance() {
    const mean = rand(10, 40), a = pick([2, 4, 6]), b = pick([2, 4, 6, 8]);
    const values = shuffled([mean - a, mean - b, mean + b, mean + a]);
    const v = (a * a + b * b) / 2;
    return askNumber(`What is the population variance of ${values.join(", ")}?`, v, [round2(Math.sqrt(v)) === v ? v + 3 : round2(Math.sqrt(v)), (a * a + b * b) * 2, v * 2, (a + b) / 2]);
  },
];

// ====================== python ======================
const WORDS_BY_LENGTH = {
  3: ["cat", "sun", "pen"], 4: ["tree", "book", "lamp"], 5: ["apple", "river", "chair"],
  6: ["banana", "garden", "pencil"], 7: ["library", "picture", "teacher"],
};
const SENTENCE_WORDS = ["learn", "python", "every", "day", "with", "small", "steps", "and", "real", "projects"];
const byName = (list, ...names) => list.filter((g) => names.includes(g.name));

const python = [
  ...byName(datascience, "listSlice", "comprehension"),
  function floorDivMod() {
    const b = rand(3, 9);
    let a = rand(20, 99);
    if (a % b === 0) a += 1;
    const q = Math.floor(a / b), r = a % b;
    return ask(`What does this Python code print?\nprint(${a} // ${b}, ${a} % ${b})`, `${q} ${r}`, [`${round2(a / b)} ${r}`, `${q + 1} ${r}`, `${r} ${q}`, `${q} ${b - r}`, `${q - 1} ${r}`]);
  },
  function stringRepeatLength() {
    const word = pick(["ab", "cat", "code", "py", "data"]), n = rand(2, 5);
    return askNumber(`What does this Python code print?\ns = "${word}"\nprint(len(s * ${n}))`, word.length * n, [word.length + n, n, word.length * (n + 1)]);
  },
  function rangeSum() {
    const start = rand(1, 5), stop = rand(10, 20), step = rand(2, 4);
    const values = [];
    for (let i = start; i < stop; i += step) values.push(i);
    const sum = values.reduce((a, b) => a + b, 0);
    return askNumber(`What does this Python code print?\nprint(sum(range(${start}, ${stop}, ${step})))`, sum, [sum + stop, sum - start, values.length]);
  },
  function halvingLoop() {
    const start = rand(10, 100);
    let n = start, count = 0;
    while (n > 1) { n = Math.floor(n / 2); count += 1; }
    return askNumber(`What does this Python code print?\nn = ${start}\ncount = 0\nwhile n > 1:\n    n = n // 2\n    count += 1\nprint(count)`, count, [count + 1, count - 1, Math.floor(start / 2)]);
  },
  function dictUpdate() {
    const x = rand(1, 9), y = rand(1, 9), z = rand(1, 9), k = rand(1, 9);
    const total = x + k + y + z;
    return askNumber(`What does this Python code print?\nd = {"a": ${x}, "b": ${y}}\nd["a"] += ${k}\nd["c"] = ${z}\nprint(sum(d.values()))`, total, [x + y + z, x + y + k, total + k]);
  },
  function appendVersusExtend() {
    const n = rand(2, 5), m = rand(2, 4);
    const start = Array.from({ length: n }, () => rand(1, 9)), more = Array.from({ length: m }, () => rand(1, 9));
    return askNumber(`What does this Python code print?\nx = ${pyList(start)}\nx.append([${rand(1, 9)}, ${rand(1, 9)}])\nx.extend(${pyList(more)})\nprint(len(x))`, n + 1 + m, [n + 2 + m, n + m, n + 2]);
  },
  function splitWordCount() {
    const words = sample(SENTENCE_WORDS, rand(3, 7));
    const sentence = words.join(" ");
    return askNumber(`What does this Python code print?\nprint(len("${sentence}".split()))`, words.length, [sentence.length, words.length - 1, words.length + 1]);
  },
  function setLength() {
    const values = Array.from({ length: 7 }, () => rand(1, 5));
    const distinct = new Set(values).size;
    return askNumber(`What does this Python code print?\nprint(len(set(${pyList(values)})))`, distinct, [values.length, distinct - 1, distinct + 1]);
  },
  function longestWord() {
    const words = shuffled(sample([3, 4, 5, 6, 7], 4).map((len) => pick(WORDS_BY_LENGTH[len])));
    const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
    return ask(`What does this Python code print?\nwords = [${words.map((w) => `"${w}"`).join(", ")}]\nprint(max(words, key=len))`, longest, words.filter((w) => w !== longest));
  },
];

// The newer role banks reuse the closest existing patterns; a foundation bank
// uses the same patterns as its standard bank (they are school-level sums,
// series and word questions).
const GENERATORS = {
  quantitative, logical, verbal,
  quantitative_foundation: quantitative, logical_foundation: logical, verbal_foundation: verbal,
  web, fullstack, datascience,
  frontend: web,
  python,
  webfundamentals: [...web, ...byName(fullstack, "statusCode", "routeParams", "paginationOffset", "totalPages", "rateLimited")],
  aiml: datascience.filter((g) => !["sqlAverage", "groupTotal"].includes(g.name)),
};

// Writes up to `count` questions for a category, each from a different pattern
// so one paper never asks the same kind of question twice. A pattern that fails
// to produce a usable question is skipped rather than breaking the test.
function generateQuestions(category, count) {
  const made = [];
  for (const generator of shuffled(GENERATORS[category] || [])) {
    if (made.length >= count) break;
    try {
      const q = generator();
      const ok = q && typeof q.text === "string" && Array.isArray(q.options) && q.options.length === 4 && q.correct >= 0 && q.correct < 4;
      if (ok) made.push(q);
    } catch (err) {
      console.error(`[careers] question generator ${generator.name || "(pool)"} failed:`, err.message);
    }
  }
  return made;
}

const generatorCount = (category) => (GENERATORS[category] || []).length;

module.exports = { GENERATORS, generateQuestions, generatorCount };
