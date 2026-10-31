const RULES = {
  HTTP_AUTH_BRUTE_FORCE: { match: (e) => e.outcome === "failed", count: 5 },
  SSH_BRUTE_FORCE: { match: (e) => e.outcome === "failed", count: 5 },
  PORT_SCAN: { distinctPorts: 8 },
  TRAFFIC_ANOMALY: { count: 100 },
  SUSPICIOUS_LOGIN: { success: true, count: 5 },
  HONEYPOT: {
    eventType: "HTTP_REQUEST",
    match: (e) => e.outcome === "honeypot",
    first: true,
    criterion: "ตรวจพบตั้งแต่ HTTP_REQUEST แรกที่ outcome = honeypot",
  },
  HTTP_FLOOD: {
    eventType: "HTTP_REQUEST",
    totals: { request_count: 300 },
    criterion: "ผลรวม request_count ภายใน 60 วินาที ≥ 300 คำขอ · รวมค่าของแต่ละแถว",
  },
  WEB_SCAN: {
    eventType: "HTTP_REQUEST",
    totals: { not_found: 10, scan_paths: 3 },
    criterion: "ภายใน 60 วินาที ผลรวม not_found ≥ 10 หรือผลรวม scan_paths ≥ 3",
  },
};
export const ruleCriterion = (kind) => RULES[kind]?.criterion;

export function thresholdEvent(events, kind) {
  const rule = RULES[kind];
  if (!rule) return null;
  const at = (e) => new Date(e.timestamp).getTime();
  const ordered = rule.eventType
    ? events
        .filter((e) => e.event_type === rule.eventType)
        .slice()
        .sort((a, b) => at(a) - at(b))
    : events;
  if (rule.first) return ordered.find(rule.match) || null;
  return (
    ordered.find((e, i) => {
      const window = ordered
        .slice(0, i + 1)
        .filter((x) => at(e) - at(x) >= 0 && at(e) - at(x) <= 60000);
      if (rule.totals)
        return Object.entries(rule.totals).some(
          ([field, count]) =>
            window.reduce((sum, event) => {
              const value = ["number", "string"].includes(typeof event[field])
                ? Number(event[field])
                : 0;
              return sum + (Number.isFinite(value) && value > 0 ? value : 0);
            }, 0) >= count,
        );
      if (rule.distinctPorts)
        return (
          new Set(window.map((x) => x.destination_port)).size >=
          rule.distinctPorts
        );
      if (rule.success)
        return (
          e.outcome === "success" &&
          window.filter(
            (x) => x.outcome === "failed" && x.event_type === e.event_type,
          ).length >= rule.count
        );
      return (
        (!rule.match || rule.match(e)) &&
        window.filter(rule.match || (() => true)).length >= rule.count
      );
    }) || null
  );
}
