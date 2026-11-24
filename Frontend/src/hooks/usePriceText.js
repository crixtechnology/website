import { useContext } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { formatINR, maskINR } from "../utils/tiers.js";

// How a Training + Internship fee prints for whoever is looking: the real
// price once they're logged in, the masked one (₹4XXX9*) before — logging in
// is what reveals it. Only for program fees; wallet amounts and payments a
// logged-in student makes always use formatINR.
export function usePriceText() {
  const { isLoggedIn } = useContext(UserContext);
  return isLoggedIn ? formatINR : maskINR;
}
