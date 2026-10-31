import { isOpenIncident, sourcesOf } from "./lib.js";
export const MAX_VISIBLE_SOURCES = 10;
export const CLUSTER_THRESHOLD = 12;
export const GROUPS = [
  { key: "blocked", label: "บล็อกอยู่", short: "BLOCKED" },
  { key: "attention", label: "ต้องตรวจสอบ", short: "REVIEW" },
  { key: "normal", label: "บันทึกการเชื่อมต่อ", short: "OBSERVED" },
];
export function topologyOf(data, rules) {
  const blocked = new Set(rules.map((r) => r.source_ip)),
    attention = new Set(
      data.incidents.filter(isOpenIncident).map((i) => i.source_ip),
    );
  const sources = sourcesOf(data).map((s) => ({
    ...s,
    status: blocked.has(s.ip)
      ? "blocked"
      : attention.has(s.ip)
        ? "attention"
        : "normal",
  }));
  const counts = { blocked: 0, attention: 0, normal: 0 };
  for (const s of sources) counts[s.status]++;
  return {
    sources,
    groups: GROUPS.map((g) => ({ ...g, count: counts[g.key] })).filter(
      (g) => g.count > 0,
    ),
  };
}
export function topologyWindow(
  model,
  { group = null, query = "", page = 0 } = {},
) {
  const q = query.trim().toLowerCase(),
    filtered = model.sources.filter(
      (s) =>
        (!group || s.status === group) &&
        (!q || s.ip.toLowerCase().includes(q)),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / MAX_VISIBLE_SOURCES)),
    current = Math.max(
      0,
      Math.min(Number.isFinite(page) ? Math.floor(page) : 0, pages - 1),
    );
  return {
    filtered,
    pages,
    page: current,
    clustered: !group && !q && filtered.length > CLUSTER_THRESHOLD,
    visible: filtered.slice(
      current * MAX_VISIBLE_SOURCES,
      (current + 1) * MAX_VISIBLE_SOURCES,
    ),
  };
}
