// Cleans a question typed into the help bot before it is stored.
//
// People type anything into a chat box, including their own email or phone
// number, so those are masked BEFORE saving — the admin list is for finding
// gaps in the bot's answers, not for collecting contact details. The result is
// lower-cased with spaces collapsed so "Fees?" and "fees ?" count as one question.
//
// Returns the cleaned text, or null when there is nothing worth keeping (not
// text, too long to be a question, or nothing left but masked placeholders).
const MAX_RAW_LENGTH = 200; // the chat box allows 120; anything far past that isn't it
const MAX_STORED_LENGTH = 120;

function cleanQuestion(raw) {
  if (typeof raw !== "string" || raw.length > MAX_RAW_LENGTH) return null;
  const text = raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, "[link]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{5,}\d/g, "[number]") // phone numbers, long digit runs
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_STORED_LENGTH)
    .trim();
  // Needs at least two real letters once the placeholders are ignored.
  const letters = text.replace(/\[(link|email|number)\]/g, "").match(/\p{L}/gu) || [];
  return letters.length >= 2 ? text : null;
}

module.exports = { cleanQuestion, MAX_STORED_LENGTH };
