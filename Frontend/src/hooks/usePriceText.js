import { useContext } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { SignupBonusContext } from "../context/SignupBonusContext.jsx";
import { walletOffPrice } from "./useWalletCredit.js";
import { formatINR, maskINR } from "../utils/tiers.js";

// How a Training + Internship fee prints for whoever is looking: the real
// price once they're logged in, the masked one (₹4XXX9*) before — logging in
// is what reveals it. Only for program fees; wallet amounts and payments a
// logged-in student makes always use formatINR.
export function usePriceText() {
  const { isLoggedIn } = useContext(UserContext);
  return isLoggedIn ? formatINR : maskINR;
}

// The signup bonus a logged-out visitor would get ({ amount, usagePercent }),
// or null when logged in or there's none.
export function useVisitorBonus() {
  const { isLoggedIn } = useContext(UserContext);
  const bonus = useContext(SignupBonusContext);
  return !isLoggedIn && bonus && bonus.amount > 0 ? bonus : null;
}

// What the signup bonus takes off a price — the same rule as wallet credit at
// checkout (it is wallet credit once they sign up).
export const bonusOff = (price, bonus) =>
  (bonus ? walletOffPrice(price, { available: bonus.amount, usagePercent: bonus.usagePercent }) : 0);

// A fee as one line of text: the real price logged in; logged out, the price
// after the signup bonus, masked (₹4,299 less ₹300 -> ₹3XXX9*).
export function useFeeText() {
  const { isLoggedIn } = useContext(UserContext);
  const bonus = useVisitorBonus();
  if (isLoggedIn) return formatINR;
  return (amount) => maskINR(Math.max(0, amount - bonusOff(amount, bonus)));
}
