import { createContext, useContext, useEffect, useRef, useState } from "react";
import { UserContext } from "./UserContext.jsx";
import { getOpenings, hasBackend } from "../services/api.js";
import { defaultTerms } from "../data/careers.js";

// The signup bonus a new account gets (Admin's careers terms), for showing a
// logged-out visitor what a program costs after it: { amount, usagePercent }
// (usagePercent: the most of one purchase credit may pay, as checkout applies
// it), or null — logged in (they see their own wallet instead), still
// loading, or no bonus. Read once per visit.
export const SignupBonusContext = createContext(null);

const fromTerms = (t) => {
  const amount = Number(t && t.signupBonus);
  const usage = Number(t && t.creditUsagePercent);
  return {
    amount: Number.isFinite(amount) ? amount : defaultTerms.signupBonus,
    usagePercent: Number.isFinite(usage) ? usage : defaultTerms.creditUsagePercent,
  };
};

export function SignupBonusProvider({ children }) {
  const { isLoggedIn } = useContext(UserContext);
  const [terms, setTerms] = useState(hasBackend ? null : fromTerms(defaultTerms));
  const asked = useRef(false);
  useEffect(() => {
    if (!hasBackend || isLoggedIn || asked.current) return undefined;
    asked.current = true;
    let alive = true;
    getOpenings().then((res) => {
      if (alive) setTerms(fromTerms(res && res.ok && res.terms ? res.terms : defaultTerms));
    });
    return () => { alive = false; };
  }, [isLoggedIn]);
  const value = !isLoggedIn && terms && terms.amount > 0 ? terms : null;
  return <SignupBonusContext.Provider value={value}>{children}</SignupBonusContext.Provider>;
}
