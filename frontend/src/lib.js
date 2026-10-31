export const kinds = {
  HTTP_AUTH_BRUTE_FORCE: "HTTP Brute Force",
  SSH_BRUTE_FORCE: "SSH Brute Force",
  PORT_SCAN: "Port Scan",
  TRAFFIC_ANOMALY: "Traffic Anomaly",
  SUSPICIOUS_LOGIN: "Suspicious Login",
};
export const kind = (v) => kinds[v] || v || "—";
export const number = (v) => Number(v || 0).toLocaleString("en-US");
export const incidentId = (v) => `INC-${String(v).padStart(4, "0")}`;
export const time = (v) =>
  v ? new Date(v).toLocaleTimeString("en-GB", { hour12: false }) : "—";
export const date = (v) =>
  v
    ? new Date(v)
        .toLocaleString("en-GB", { hour12: false, calendar: "gregory" })
        .replace(",", "")
    : "—";
const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
export const sortIncidents = (rows) =>
  [...rows].sort((a, b) =>
    (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0) ||
    (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0),
  );
// What an analyst should look at first: pending approvals and unanalyzed serious incidents, worst first.
export function attentionQueue(incidents = [], proposals = []) {
  const byId = new Map(incidents.map((i) => [i.id, i]));
  const items = [
    ...proposals
      .filter((p) => p.status === "pending")
      .map((p) => ({ type: "approval", key: `p${p.id}`, proposal: p, incident: byId.get(p.incident_id) })),
    ...incidents
      .filter((i) => i.status === "detected" && ["CRITICAL", "HIGH"].includes(i.severity))
      .map((i) => ({ type: "analysis", key: `i${i.id}`, incident: i })),
  ];
  const rank = (x) => severityRank[x.incident?.severity] || 0;
  const at = (x) => Date.parse(x.incident?.created_at || x.proposal?.created_at) || 0;
  return items.sort((a, b) => rank(b) - rank(a) || at(b) - at(a));
}
export function ruleLifetime(rule, now) {
  const end = Date.parse(rule.expires_at), start = Date.parse(rule.created_at);
  if (!Number.isFinite(end) || !Number.isFinite(now)) return null;
  const remaining = Math.max(0, end - now);
  return {
    seconds: Math.ceil(remaining / 1000),
    percent: Number.isFinite(start) && end > start
      ? Math.max(0, Math.min(100, remaining / (end - start) * 100))
      : null,
  };
}
export const statusLabels = {
  detected: "รอวิเคราะห์",
  analyzing: "กำลังวิเคราะห์",
  awaiting_approval: "รออนุมัติ",
  blocked: "บล็อกแล้ว · รอยืนยันผล",
  verified: "ยืนยันผลแล้ว",
  rejected: "ปฏิเสธแล้ว",
  closed: "ปิดแล้ว",
  needs_review: "ต้องตรวจเพิ่มเติม",
  monitoring: "เฝ้าระวัง",
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
};
export const tone = (v) =>
  ["verified", "approved", "ok", "allowed", "success"].includes(v)
    ? "good"
    : ["rejected", "failed", "denied", "error", "CRITICAL", "HIGH"].includes(v)
      ? "bad"
      : [
            "pending",
            "awaiting_approval",
            "blocked",
            "MEDIUM",
            "needs_review",
            "analyzing",
          ].includes(v)
        ? "warn"
        : "quiet";
export function parsed(v) {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
export function analysisOf(report) {
  const a = parsed(report?.analysis);
  return a
    ? {
        ...a,
        evidence: Array.isArray(a.evidence) ? a.evidence : [],
        explanation_th: a.explanation_th || a.summary || "",
        confidence: typeof a.confidence === "number" ? a.confidence : null,
      }
    : null;
}
export const activeRule = (r, now = Date.now()) =>
  Date.parse(r.expires_at) > now;
export const isOpenIncident = (i) =>
  !["verified", "rejected", "closed"].includes(i.status);
export const duration = (s) =>
  s ? `${Math.round(s / 60)} นาที` : "จนกว่าจะปลดบล็อก";
export const action = (v) =>
  ({
    TEMP_BLOCK_IP: "บล็อก IP ชั่วคราว",
    BLOCK_IP: "บล็อก IP",
    MONITOR: "เฝ้าระวัง",
    INVESTIGATE: "ตรวจสอบเพิ่มเติม",
    NO_ACTION: "ไม่ดำเนินการ",
  })[v] ||
  v ||
  "—";
export function sourcesOf(data) {
  const m = new Map();
  for (const item of [
    ...data.events.map((e) => ({ ip: e.source_ip, at: e.timestamp })),
    ...data.traffic.map((t) => ({ ip: t.source_ip, at: t.created_at })),
    ...data.incidents.map((i) => ({ ip: i.source_ip, at: i.created_at })),
  ]) {
    if (
      item.ip &&
      (!m.has(item.ip) || Date.parse(item.at) > Date.parse(m.get(item.ip).at))
    )
      m.set(item.ip, item);
  }
  return [...m.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
export const isPublic = (ip) =>
  !!ip &&
  !/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|0\.)/.test(
    ip,
  ) &&
  !["::1", "::"].includes(ip) &&
  !/^(fc|fd|fe80:|2001:db8:)/i.test(ip);
export function proofFor(rule, traffic) {
  return traffic.find(
    (t) =>
      t.source_ip === rule.source_ip &&
      t.decision === "denied" &&
      Date.parse(t.created_at) >= Date.parse(rule.created_at) &&
      Date.parse(t.created_at) <= Date.parse(rule.expires_at),
  );
}

export const targetIp = (p) => p?.target_ip || p?.source_ip || "—";
