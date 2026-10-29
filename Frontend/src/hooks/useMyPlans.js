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
//   hasAccess(course) -> true while they have live access, plan or not
//
// Call `reload()` after an upgrade is paid so the new plan shows straight away.
export function useMyPlans() {
  const { isLoggedIn } = useContext(UserContext);
  const [plans, setPlans] = useState({}); // course _id -> tier
  const [access, setAccess] = useState({}); // course _id -> true (live access, with or without a plan)

  const reload = useCallback(() => {
    if (!isLoggedIn) { setPlans({}); setAccess({}); return; }
    getMyEnrollments().then((res) => {
      if (!res || !res.ok) return;
      const next = {};
      const live = {};
      for (const e of res.enrollments || []) {
        if (!e.expired && e.course) live[e.course._id] = true;
        if (e.tier && !e.expired && e.course) next[e.course._id] = e.tier;
      }
      setPlans(next);
      setAccess(live);
    });
  }, [isLoggedIn]);

  useEffect(() => { reload(); }, [reload]);

  const ownedTier = (item) => (item && plans[item._id]) || null;
  const hasAccess = (item) => !!(item && access[item._id]);
  return { ownedTier, hasAccess, reload };
}
