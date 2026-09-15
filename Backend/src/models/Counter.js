const mongoose = require("mongoose");

// Generic atomic counter collection (one doc per named sequence) — used to
// mint gap-free, race-safe sequential numbers like receipt numbers without a
// separate dedicated collection per sequence. findOneAndUpdate's $inc is a
// single atomic Mongo operation, so two concurrent payments can never be
// handed the same number.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", counterSchema);

async function nextSequence(name) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}

module.exports = { nextSequence };
