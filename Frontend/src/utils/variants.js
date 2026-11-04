import { formatDuration } from "./duration.js";

// Training + Internship tracks — and Free Internship roles — that share a
// domain `group` (set in Admin) are one domain offered in several durations.
// The site shows each group as a single card with a duration switch; one with
// no group is a group of one. A track's length is durationDays; a role's is
// its Duration text ("6 months").

const DAYS_PER = { day: 1, week: 7, month: 30, year: 365 };
const daysOf = (v) => {
  if (v && v.durationDays) return Number(v.durationDays);
  const m = String((v && v.duration) || "").toLowerCase().match(/(\d+(?:\.\d+)?)\s*(day|week|month|year)/);
  return m ? Number(m[1]) * DAYS_PER[m[2]] : Infinity;
};

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
  groups.forEach((g) => g.variants.sort((a, b) => daysOf(a) - daysOf(b)));
  return groups;
}

// Other tracks in this one's group (itself included), shortest first.
export function siblingsOf(item, items) {
  const key = groupKey(item);
  if (!key) return [item];
  return groupVariants((items || []).filter((c) => groupKey(c) === key))[0]?.variants || [item];
}

// What the switch calls a duration: "3 months" (a track's length or a role's
// Duration text), else its tag or title.
export const variantLabel = (item) => formatDuration(item.durationDays) || String(item.duration || "").trim() || item.tag || item.title;
