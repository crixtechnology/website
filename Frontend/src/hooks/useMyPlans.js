import { useCallback, useContext, useEffect, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { getMyEnrollments } from "../services/api.js";

// The plan (basic / plus / pro) the logged-in student currently holds on each
// course, so pages can show "your plan" and offer an upgrade instead of a
// fresh purchase. Only live access that was bought as a plan counts — an
// expired enrollment, or admin-granted access with no plan, isn't upgradable.
//
//   const { ownedTier, reload } = useMyPlans();
//   ownedTier(course) -> "basic" | "plus" | "pro" | null
//
// Call `reload()` after an upgrade is paid so the new plan shows straight away.
export function useMyPlans() {
  const { isLoggedIn } = useContext(UserContext);
  const [plans, setPlans] = useState({}); // course _id -> tier

  const reload = useCallback(() => {
    if (!isLoggedIn) { setPlans({}); return; }
    getMyEnrollments().then((res) => {
      if (!res.ok) return;
      const next = {};
      for (const e of res.enrollments || []) {
        if (e.tier && !e.expired && e.course) next[e.course._id] = e.tier;
      }
      setPlans(next);
    });
  }, [isLoggedIn]);

  useEffect(() => { reload(); }, [reload]);

  const ownedTier = (item) => (item && plans[item._id]) || null;
  return { ownedTier, reload };
}
