import { CHANNELS, isOpenIncident, sourcesOf } from "./lib.js";
export const MAX_VISIBLE_SOURCES = 10;
export const CLUSTER_THRESHOLD = 12;
export const GROUPS = [
  { key: "blocked", label: "บล็อกอยู่", short: "BLOCKED" },
  { key: "attention", label: "ต้องตรวจสอบ", short: "REVIEW" },
  { key: "normal", label: "บันทึกการเชื่อมต่อ", short: "OBSERVED" },
];
// How far back the map looks. HTTP has no "left the site" signal, so an IP stays only while it is recent.
export const TIME_RANGES = [
  { key: "15m", label: "15 นาที", ms: 15 * 60 * 1000 },
  { key: "1h", label: "1 ชม.", ms: 60 * 60 * 1000 },
  { key: "all", label: "ทั้งหมด", ms: null },
];
export function topologyOf(data, rules, { range = "all", now = Date.now() } = {}) {
  const blocked = new Set(rules.map((r) => r.source_ip)),
    attention = new Set(
      data.incidents.filter(isOpenIncident).map((i) => i.source_ip),
    ),
    windowMs = TIME_RANGES.find((r) => r.key === range)?.ms;
  const sources = sourcesOf(data)
    .map((s) => ({
      ...s,
      status: blocked.has(s.ip)
        ? "blocked"
        : attention.has(s.ip)
          ? "attention"
          : "normal",
    }))
    // Blocked IPs and open incidents stay however quiet they are: an admin still has to act on them.
    .filter((s) => !windowMs || s.status !== "normal" || now - Date.parse(s.at) <= windowMs);
  const counts = { blocked: 0, attention: 0, normal: 0 };
  for (const s of sources) counts[s.status]++;
  return {
    sources,
    channels: CHANNELS.map((c) => ({
      ...c,
      count: sources.filter((s) => s.channels.includes(c.key)).length,
    })),
    groups: GROUPS.map((g) => ({ ...g, count: counts[g.key] })).filter(
      (g) => g.count > 0,
    ),
  };
}
export function topologyWindow(
  model,
  { group = null, query = "", page = 0, channel = null } = {},
) {
  const q = query.trim().toLowerCase(),
    filtered = model.sources.filter(
      (s) =>
        (!group || s.status === group) &&
        (!channel || s.channels.includes(channel)) &&
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
    clustered: !group && !q && !channel && filtered.length > CLUSTER_THRESHOLD,
    visible: filtered.slice(
      current * MAX_VISIBLE_SOURCES,
      (current + 1) * MAX_VISIBLE_SOURCES,
    ),
  };
}
