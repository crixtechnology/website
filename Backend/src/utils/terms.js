// Every way of paying us (course/internship checkout, wallet pay, plan upgrade,
// admin payment request, aptitude-test fee) needs the buyer to tick "I agree to
// the Terms & Conditions" first. The checkbox lives in the browser, so the
// server checks for it too — a payment can't be started without it — and
// stamps the moment on the Payment (termsAcceptedAt) as the record of consent.
const TERMS_REQUIRED_ERROR = "Please read and accept the Terms & Conditions before paying.";

const termsAccepted = (body) => !!body && body.acceptTerms === true;

// Express helper: answers 400 and returns true when the box wasn't ticked.
function rejectWithoutTerms(req, res) {
  if (termsAccepted(req.body)) return false;
  res.status(400).json({ ok: false, error: TERMS_REQUIRED_ERROR, code: "TERMS_REQUIRED" });
  return true;
}

module.exports = { TERMS_REQUIRED_ERROR, termsAccepted, rejectWithoutTerms };
