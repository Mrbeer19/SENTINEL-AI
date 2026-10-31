import { RULE_ONLY_KINDS, isRuleOnly } from "../src/ui.jsx";
if (!import.meta.env.DEV)
  throw new Error("This fixture is available in development only");
let webKind = null;
let scenario = "pending",
  disabledRules = new Set(),
  decisionAt = Date.now();
const fixtureNow = Date.now();
const sockets = new Set(),
  requests = [];
const created = new Date(fixtureNow - 360000).toISOString();
const base = {
  severity: "HIGH",
  id: 1,
  kind: "HTTP_AUTH_BRUTE_FORCE",
  source_ip: "198.51.100.24",
  status: "detected",
  event_count: 6,
  created_at: created,
  updated_at: created,
  trace: [],
  timeline: [],
  events: [],
  traffic: [],
};
const demoLocations = [
  {
    ip: "1.1.1.1",
    country: "Thailand",
    city: "Bangkok",
    latitude: 13.7563,
    longitude: 100.5018,
  },
  {
    ip: "8.8.8.8",
    country: "Singapore",
    city: "Singapore",
    latitude: 1.3521,
    longitude: 103.8198,
  },
  {
    ip: "9.9.9.9",
    country: "Japan",
    city: "Tokyo",
    latitude: 35.6762,
    longitude: 139.6503,
  },
  {
    ip: "208.67.222.222",
    country: "Thailand",
    city: "Bangkok",
    latitude: 13.7563,
    longitude: 100.5018,
  },
  {
    ip: "64.6.64.6",
    country: "United States",
    city: "New York",
    latitude: 40.7128,
    longitude: -74.006,
  },
]; // Public address examples with deliberately synthetic positions; never used by the real app.
const agents = ["investigation", "threat_analysis", "defense_planning"];
const trace = agents.flatMap((agent, i) => [
  {
    id: i * 2 + 1,
    agent,
    operation: i === 0 ? "execute_tool" : "chat",
    tool: i === 0 ? "get_incident_logs" : "model",
    status: "ok",
    duration_ms: 900,
    created_at: created,
    input: "{}",
    output: '{"ok":true}',
  },
  {
    id: i * 2 + 2,
    agent,
    operation: "invoke_agent",
    tool: agent,
    status: "ok",
    duration_ms: 1600 + i * 1000,
    created_at: created,
    input: "{}",
    output: "{}",
  },
]);
const analysis = {
  threat_type: "HTTP_AUTH_BRUTE_FORCE",
  severity: "HIGH",
  confidence: 0.94,
  explanation_th:
    "พบการเข้าสู่ระบบไม่สำเร็จซ้ำในช่วงเวลาสั้น ควรตรวจหลักฐานและพิจารณาบล็อกชั่วคราว",
  evidence: ["พบการล็อกอินไม่สำเร็จ 6 ครั้ง", "เหตุการณ์มาจาก IP เดียวกัน"],
  recommended_action: "TEMP_BLOCK_IP",
};
function report(kind = scenario) {
  if (arguments.length === 0 && webKind) {
    const r = report(
      ["blocked", "verified", "expired", "rejected"].includes(scenario)
        ? scenario
        : "pending",
    );
    return {
      ...r,
      kind: webKind,
      event_count: 3,
      trace: [],
      analysis_mode: "rule_fallback",
      analysis: {
        ...analysis,
        threat_type: webKind,
        confidence: null,
        explanation_th: "ตรวจด้วยกฎเฉพาะทางจากข้อมูลสังเคราะห์",
      },
      proposal: r.proposal ? { ...r.proposal, source: "rule_fallback" } : null,
    };
  }
  const r = { ...base, trace: [], timeline: [] };
  if (kind === "detected") return r;
  if (["analyzing", "analyst", "planner"].includes(kind))
    return {
      ...r,
      status: "analyzing",
      trace:
        kind === "analyzing"
          ? trace.slice(0, 1)
          : kind === "analyst"
            ? trace.slice(0, 3)
            : trace.slice(0, 5),
    };
  Object.assign(r, { analysis, analysis_mode: "ollama", trace });
  if (kind === "no-action")
    return { ...r, status: "monitoring", proposal: null };
  r.proposal = {
    id: 1,
    incident_id: 1,
    status: "pending",
    action: "TEMP_BLOCK_IP",
    target_ip: base.source_ip,
    source_ip: base.source_ip,
    duration_seconds: 600,
    source: "model",
    created_at: created,
  };
  r.status = "awaiting_approval";
  if (["blocked", "verified", "expired"].includes(kind)) {
    r.proposal = { ...r.proposal, status: "approved", reviewer: "QA admin" };
    r.status = kind === "expired" ? "closed" : kind;
  }
  if (kind === "rejected") {
    r.proposal = { ...r.proposal, status: "rejected", reviewer: "QA admin" };
    r.status = "rejected";
  }
  if (kind === "fallback") {
    r.analysis_mode = "rule_fallback";
    r.analysis = { ...analysis, confidence: null };
    r.proposal = { ...r.proposal, source: "rule_fallback" };
    r.trace = [
      { ...trace[0], operation: "chat", status: "error" },
      { ...trace[1], agent: "rule_fallback", status: "fallback" },
    ];
  }
  return r;
}
window.fetch = async (input, options = {}) => {
  const path = new URL(
    typeof input === "string" ? input : input.url,
    location.href,
  ).pathname;
  requests.push({ path, method: options.method || "GET" });
  document
    .querySelector("[data-qa-requests]")
    ?.setAttribute("data-qa-requests", JSON.stringify(requests));
  if (options.method && options.method !== "GET") {
    if (
      options.method === "POST" &&
      /^\/api\/proposals\/1\/(approve|reject)$/.test(path)
    ) {
      if (report().proposal?.status !== "pending")
        return new Response('{"detail":"already decided"}', { status: 409 });
      scenario = path.endsWith("/approve") ? "blocked" : "rejected";
      decisionAt = Date.now();
      window.dispatchEvent(
        new CustomEvent("fixture-scenario", { detail: scenario }),
      );
      return new Response(JSON.stringify(report()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (options.method === "DELETE" && /^\/api\/rules\/[12]$/.test(path)) {
      disabledRules.add(Number(path.split("/").at(-1)));
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response('{"detail":"unsupported local fixture action"}', {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (scenario === "offline") throw new TypeError("Fixture offline");
  if (path.startsWith("/api/geoip/")) {
    const ip = decodeURIComponent(path.split("/").at(-1)),
      point = demoLocations.find((p) => p.ip === ip);
    return new Response(
      JSON.stringify(
        point ? { ...point, success: true, fixture: true } : { success: false },
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  const r = report(),
    second = {
      ...report("verified"),
      id: 2,
      kind: "PORT_SCAN",
      severity: "MEDIUM",
      source_ip: "192.0.2.42",
      proposal: {
        ...report("verified").proposal,
        id: 2,
        incident_id: 2,
        source_ip: "192.0.2.42",
        target_ip: "192.0.2.42",
      },
    };
  const extras = ["TRAFFIC_ANOMALY", "SSH_BRUTE_FORCE", "SUSPICIOUS_LOGIN"].map(
    (kind, i) => ({
      ...base,
      id: i + 3,
      kind,
      source_ip: `203.0.113.${i + 20}`,
      severity: i === 0 ? "CRITICAL" : "LOW",
      status: "detected",
      analysis: null,
      trace: [],
    }),
  );
  const incidents = scenario === "empty" ? [] : [r, second, ...extras];
  const events =
    scenario === "empty"
      ? []
      : Array.from({ length: 32 }, (_, i) => ({
          id: i + 1,
          event_type: i % 4 === 0 ? "SSH_AUTH" : "HTTP_AUTH",
          source_ip: i % 3 === 0 ? "192.0.2.42" : base.source_ip,
          timestamp: new Date(fixtureNow - i * 31000).toISOString(),
          outcome: i % 5 === 0 ? "success" : "failed",
          username: "qa-user",
          destination_port: null,
        }));
  const traffic =
    scenario === "empty"
      ? []
      : Array.from({ length: 58 }, (_, i) => ({
          id: 100 + i,
          source_ip: i % 3 === 0 ? "192.0.2.42" : base.source_ip,
          created_at: new Date(fixtureNow - i * 13000).toISOString(),
          decision: i % 3 === 0 ? "denied" : "allowed",
        }));
  if (scenario === "verified")
    traffic.unshift({
      id: 999,
      source_ip: base.source_ip,
      created_at: new Date(fixtureNow - 500).toISOString(),
      decision: "denied",
    });
  const rules =
    scenario === "empty"
      ? []
      : [
          {
            id: 2,
            proposal_id: 2,
            source_ip: "192.0.2.42",
            created_at: created,
            expires_at: new Date(
              Date.now() + (disabledRules.has(2) ? -1000 : 600000),
            ).toISOString(),
            active: !disabledRules.has(2),
          },
          ...(["blocked", "verified"].includes(scenario)
            ? [
                {
                  id: 1,
                  proposal_id: 1,
                  source_ip: base.source_ip,
                  created_at: new Date(
                    scenario === "verified" ? fixtureNow - 2000 : decisionAt,
                  ).toISOString(),
                  expires_at: new Date(
                    Date.now() + (disabledRules.has(1) ? -1000 : 600000),
                  ).toISOString(),
                  active: !disabledRules.has(1),
                },
              ]
            : []),
        ];
  if (webKind)
    events.splice(
      0,
      events.length,
      ...[
        { request_count: 140, not_found: 4, scan_paths: 1, outcome: "attempt" },
        {
          request_count: 159,
          not_found: 5,
          scan_paths: 1,
          outcome: webKind === "HONEYPOT" ? "honeypot" : "attempt",
        },
        { request_count: 1, not_found: 1, scan_paths: 1, outcome: "attempt" },
      ].map((e, i) => ({
        ...e,
        id: 9000 + i,
        event_type: "HTTP_REQUEST",
        source_ip: base.source_ip,
        timestamp: new Date(fixtureNow - 60000 + i * 30000).toISOString(),
        paths: JSON.stringify([
          "/<img src=x onerror=alert(1)>",
          "https://example.invalid/<script>alert(1)</script>",
        ]),
      })),
    );
  if (scenario === "geo-locations")
    for (const [i, point] of demoLocations.entries())
      events.unshift({
        id: 20000 + i,
        source_ip: point.ip,
        event_type: "HTTP_AUTH",
        outcome: "success",
        timestamp: new Date(fixtureNow + i * 1000).toISOString(),
      });
  if (scenario === "many-sources") {
    // Documentation-only addresses; no traffic is sent to these IPs.
    for (let i = 1; i <= 2495; i++) {
      const source_ip = `2001:db8::${i.toString(16)}`;
      events.push({
        id: 10000 + i,
        event_type: "HTTP_AUTH",
        source_ip,
        timestamp: new Date(fixtureNow - i * 1000).toISOString(),
        outcome: "success",
      });
      if (i <= 80)
        incidents.push({
          ...base,
          id: 10000 + i,
          source_ip,
          status: "detected",
          proposal: null,
          analysis: null,
        });
      if (i <= 20)
        rules.push({
          id: 10000 + i,
          source_ip,
          created_at: created,
          expires_at: new Date(Date.now() + 600000).toISOString(),
          active: true,
        });
    }
  }
  const reports = incidents.map((i) => ({
    ...i,
    events: events.filter((e) => e.source_ip === i.source_ip),
    traffic: traffic.filter((t) => t.source_ip === i.source_ip),
    timeline: [
      {
        id: 1,
        stage: "detected",
        created_at: created,
        detail: "ตรวจพบจากข้อมูลทดสอบที่แยกจากระบบจริง",
      },
    ],
  }));
  let data =
    path === "/api/health"
      ? { model: "sentinel-r3", model_ready: true, ai_mode: "ollama" }
      : path === "/api/incidents"
        ? incidents
        : path === "/api/proposals"
          ? incidents.map((i) => i.proposal).filter(Boolean)
          : path.startsWith("/api/reports/")
            ? reports.find((i) => i.id === Number(path.split("/").at(-1)))
            : path === "/api/events"
              ? events
              : path === "/api/traffic"
                ? traffic
                : path === "/api/rules"
                  ? rules
                  : path === "/api/audit/verify"
                    ? { valid: true, count: 0 }
                    : [];
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
window.WebSocket = class FixtureSocket {
  constructor() {
    sockets.add(this);
    queueMicrotask(() => this.onopen?.());
  }
  close() {
    sockets.delete(this);
  }
};

export function setScenario(value) {
  scenario = value;
  webKind = isRuleOnly(value) ? value : null;
  disabledRules = new Set();
  sockets.forEach((s) => s.onmessage?.({ data: "{}" }));
}
export const scenarios = [
  "pending",
  ...RULE_ONLY_KINDS,
  "analyzing",
  "analyst",
  "planner",
  "blocked",
  "verified",
  "rejected",
  "fallback",
  "no-action",
  "expired",
  "many-sources",
  "geo-locations",
  "empty",
  "offline",
];
