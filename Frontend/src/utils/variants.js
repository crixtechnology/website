import { formatDuration } from "./duration.js";

// Training + Internship tracks that share a domain `group` (set in Admin) are
// one domain offered in several durations. The site shows each group as a
// single card with a duration switch; a track with no group is a group of one.

const groupKey = (item) => {
  const g = String((item && item.group) || "").trim().toLowerCase();
  return g ? `${item.type || ""}:${g}` : null;
};

// [{ key, variants }] in the order each group first appears, its durations
// shortest first (a track with no duration goes last).
export function groupVariants(items) {
  const groups = [];
  const byKey = new Map();
  (items || []).forEach((item, i) => {
    const key = groupKey(item);
    if (key && byKey.has(key)) { byKey.get(key).variants.push(item); return; }
    const entry = { key: key || `solo:${item.slug || item._id || item.title || i}`, variants: [item] };
    if (key) byKey.set(key, entry);
    groups.push(entry);
  });
  const days = (v) => (v.durationDays ? Number(v.durationDays) : Infinity);
  groups.forEach((g) => g.variants.sort((a, b) => days(a) - days(b)));
  return groups;
}

// Other tracks in this one's group (itself included), shortest first.
export function siblingsOf(item, items) {
  const key = groupKey(item);
  if (!key) return [item];
  return groupVariants((items || []).filter((c) => groupKey(c) === key))[0]?.variants || [item];
}

// What the switch calls a duration: "1 month", else the track's tag or title.
export const variantLabel = (item) => formatDuration(item.durationDays) || item.tag || item.title;
