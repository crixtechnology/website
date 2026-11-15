import { useContext, useEffect, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { getMyWallet } from "../services/api.js";

// The logged-in student's spendable wallet credit, for showing what a program
// will actually cost them: { available (rupees), usagePercent } or null when
// logged out, still loading, or the wallet couldn't be read. Re-reads when the
// account changes (log in / log out / switch).
export function useWalletCredit() {
  const { isLoggedIn, user } = useContext(UserContext);
  const userKey = isLoggedIn ? (user && (user.id || user._id || user.email)) || "me" : null;
  const [wallet, setWallet] = useState(null);
  useEffect(() => {
    setWallet(null);
    if (!userKey) return undefined;
    let alive = true;
    getMyWallet().then((res) => {
      if (!alive || !res || !res.ok || !res.wallet) return;
      setWallet({ available: Number(res.wallet.available) || 0, usagePercent: Number(res.wallet.usagePercent ?? 100) });
    });
    return () => { alive = false; };
  }, [userKey]);
  return wallet;
}

// How much wallet credit comes off a price, in whole rupees — the same rule as
// checkout (Backend/src/utils/pricing.js priceOrder): at most the admin's
// usage cap (a % of the price), never below the ₹1 minimum charge, whole rupees.
export function walletDiscount(price, wallet) {
  const p = Math.floor(Number(price) || 0);
  if (!wallet || p <= 1) return 0;
  const cap = Math.floor((p * Math.max(0, Math.min(100, wallet.usagePercent))) / 100);
  const usable = Math.max(0, Math.min(p - 1, cap));
  return Math.floor(Math.min(Math.max(0, wallet.available), usable));
}
