// A friend's referral code travels in a shared link (https://site/?ref=CRIX-K7P3QZ).
// Whoever opens it might not sign up until later, so the code is remembered in
// localStorage (best effort — it's only a convenience) and used to pre-fill the
// signup form and the checkout's referral box.

const KEY = "crix_ref";
const CODE_SHAPE = /^[A-Za-z0-9-]{4,20}$/;

export function captureReferralFromUrl(search) {
  try {
    const code = new URLSearchParams(search).get("ref");
    if (code && CODE_SHAPE.test(code)) window.localStorage.setItem(KEY, code.toUpperCase());
  } catch (e) { /* storage blocked — the link still works, just isn't remembered */ }
}

export function getStoredReferral() {
  try { return window.localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
}

export function clearStoredReferral() {
  try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

// The link a student shares.
export function referralLink(code) {
  return `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
}

// Copies text; falls back to a hidden textarea where the async clipboard API is
// unavailable (older browsers, non-secure contexts). Resolves true on success.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch (err) {
      return false;
    }
  }
}
