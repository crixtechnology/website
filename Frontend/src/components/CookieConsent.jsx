import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  analyticsAvailable, getAnalyticsConsent, setAnalyticsConsent, OPEN_COOKIE_SETTINGS_EVENT,
} from "../utils/analytics.js";

// The cookie banner. Our own storage (login, theme, a referral code) is needed
// for the site to work and isn't asked about; Google Analytics is optional and
// only loads after "Accept" (utils/analytics.js). Shown until the visitor
// chooses, and again from "Cookie settings" in the footer. Both answers are
// equally easy, and nothing is pre-ticked. With no analytics configured there
// is nothing to ask, so it never appears.
export default function CookieConsent() {
  const [open, setOpen] = useState(() => analyticsAvailable() && getAnalyticsConsent() === null);

  useEffect(() => {
    if (!analyticsAvailable()) return undefined;
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  if (!open) return null;
  const current = getAnalyticsConsent();
  const choose = (value) => { setAnalyticsConsent(value); setOpen(false); };

  return (
    <div className="cookie-banner" role="dialog" aria-modal="false" aria-labelledby="cookie-title" aria-describedby="cookie-text">
      <div className="cookie-banner-text">
        <b id="cookie-title">Cookies on this site</b>
        <p id="cookie-text">
          We use only the storage the site needs to work (keeping you logged in, your theme). With your OK, we'd also use
          Google Analytics cookies to count visits and see which pages help — nothing else, and never for ads.{" "}
          <Link to="/privacy-policy" onClick={() => setOpen(false)}>Privacy Policy</Link>
          {current && <> · You've currently {current === "granted" ? "allowed" : "declined"} analytics.</>}
        </p>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" className="btn btn-ghost" onClick={() => choose("denied")}>Decline</button>
        <button type="button" className="btn btn-solid" onClick={() => choose("granted")}>Accept analytics</button>
      </div>
    </div>
  );
}
