// Understanding what people type, for the help agent (data/helpAgent.js) —
// without any AI service. Three cheap, predictable steps:
//
//   1. understand(): Hinglish and everyday words are rewritten to the words the
//      agent knows ("kitna lagega" -> "price", "naukri" -> "job"), and a misspelt
//      word is corrected to the closest known one ("internshp" -> "internship").
//   2. similarity(): how alike two sentences are, letter-trigram by trigram — used
//      to suggest the closest questions when nothing matched outright.
//   3. tokens(): the words a sentence is searched by.

// ---------- 1. words people use -> words the agent knows ----------
// Single words only (phrases are handled by the agent's own phrase lists).
const SYNONYMS = {
  // Hinglish
  kitna: "price", kitne: "price", kitni: "price", daam: "price", rate: "price",
  paisa: "money", paise: "money", rupaye: "money", rupay: "money", rupee: "money", rs: "money",
  naukri: "job", nokri: "job", kaam: "work", rozgar: "job",
  sikhna: "learn", seekhna: "learn", sikhana: "learn", padhna: "learn", padhai: "study",
  chahiye: "want", chaiye: "want", chahie: "want", chahta: "want", chahti: "want", karna: "do",
  milega: "get", milegi: "get", milenge: "get", milta: "get", mile: "get",
  kab: "when", kaise: "how", kese: "how", kaisa: "how", kya: "what", kyu: "why", kyun: "why", kaha: "where", kahan: "where",
  nahi: "not", nahin: "not", nhi: "not", na: "not",
  hua: "happened", hogaya: "happened", gaya: "gone", kata: "deducted", kat: "deducted", cut: "deducted",
  wapas: "refund", vapas: "refund", lautana: "refund",
  banwana: "build", banwani: "build", banana: "build", banao: "build", bana: "build",
  dikha: "show", dikhao: "show", batao: "tell", bataye: "tell", bolo: "tell",
  shuru: "start", chalu: "start", khatam: "end",
  // Everyday English
  cost: "price", costs: "price", pricing: "price", rates: "price",
  fees: "fee", salary: "stipend", pay: "payment", paying: "payment", money: "money",
  cert: "certificate", certification: "certificate", certified: "certificate", certificates: "certificate",
  pwd: "password", pass: "password", passwd: "password", acc: "account", acct: "account",
  intern: "internship", internships: "internship", courses: "course", programme: "program", programmes: "program",
  vacancy: "job", vacancies: "job", jobs: "job", hiring: "hiring", opening: "openings",
  wfh: "remote", online: "online", offline: "offline",
  site: "website", webpage: "website", web: "web",
  ph: "phone", mob: "mobile", whatsapp: "contact", mail: "email",
  doubt: "question", query: "question", queries: "question", issue: "problem", error: "problem", bug: "problem",
  duration: "duration", long: "duration", months: "month", days: "day", weeks: "week", din: "day", mahina: "month", mahine: "month",
};

// ---------- 2. typo correction ----------
// Damerau–Levenshtein distance (adjacent swaps count as one edit), stopping
// early past `max`, since only near-misses matter.
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

// The closest known word, if it is close enough: one edit for short words, two
// for long ones, and the first letter must match (fewer wrong "corrections").
// Words under five letters are left alone: too many real words sit one letter
// from a known one ("cart" / "card", "pain" / "paid").
function correct(word, vocab) {
  if (word.length < 5 || vocab.has(word) || /\d/.test(word)) return word;
  const max = word.length >= 8 ? 2 : 1;
  let best = word;
  let bestD = max + 1;
  for (const v of vocab) {
    if (v[0] !== word[0] || Math.abs(v.length - word.length) > max) continue;
    const dist = editDistance(word, v, max);
    if (dist < bestD) { best = v; bestD = dist; if (dist === 1 && max === 1) break; }
  }
  return best;
}

const wordsOf = (text) => String(text || "").toLowerCase().normalize("NFKC").match(/[a-z0-9₹]+/g) || [];

// Every word the agent can recognise, from its own phrase lists, the answer bank
// and the live program / role titles. Build it once per load of that data
// (helpAgent.js vocabFor), not per message.
export function buildVocab(sources) {
  const vocab = new Set(Object.values(SYNONYMS));
  for (const s of sources) {
    const list = Array.isArray(s) ? s : [s];
    for (const item of list) for (const w of wordsOf(item)) if (w.length >= 3) vocab.add(w);
  }
  return vocab;
}

// Hindi phrases whose meaning isn't in any single word ("kitne din" is "how long",
// not "how much"). Applied before the word-by-word rewrite.
const PHRASES = [
  [/\bkitn[aei]+ (din|dino|days?|mahin[ae]|months?|time|samay|hafte|weeks?|saal)\b/g, "how long duration"],
  [/\bkab (se|tak)\b/g, "when start"],
  [/\bkaise (kare|karu|karun|kar|join|apply)\b/g, "how apply join"],
  [/\bkoi (job|naukri|vacancy)\b/g, "job hiring"],
];

// Rewrites a message into words the agent knows: a misspelt word is replaced by
// its correction, and a synonym is ADDED after the word it explains ("long" ->
// "long duration"), so phrases written with the original word still match.
// Returns lower-case, single-spaced text; the original is kept for showing back.
export function understand(text, vocab) {
  let joined = wordsOf(text).join(" ");
  for (const [re, to] of PHRASES) joined = joined.replace(re, to);
  return joined.split(" ").filter(Boolean)
    .map((w) => (vocab && !SYNONYMS[w] ? correct(w, vocab) : w))
    .map((w) => (SYNONYMS[w] && SYNONYMS[w] !== w ? `${w} ${SYNONYMS[w]}` : w))
    .join(" ");
}

// ---------- 3. how alike two sentences are (0..1) ----------
const trigrams = (s) => {
  const t = ` ${wordsOf(s).join(" ")} `;
  const out = new Set();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
};
export function similarity(a, b) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return (2 * shared) / (A.size + B.size);
}
