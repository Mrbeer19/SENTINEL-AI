import test from "node:test";
import assert from "node:assert/strict";
import {
  proofFor,
  sourcesOf,
  activeRule,
  analysisOf,
  isPublic,
  sortIncidents,
  ruleLifetime,
  date,
  attentionQueue,
} from "../src/lib.js";
test("incident priority uses severity before recency without changing source order", () => {
  const rows = [
    { id: 1, severity: "LOW", created_at: "2026-10-31T12:00:00Z" },
    { id: 2, severity: "CRITICAL", created_at: "2026-10-30T12:00:00Z" },
    { id: 3, severity: "HIGH", created_at: "2026-10-31T10:00:00Z" },
    { id: 4, severity: "HIGH", created_at: "2026-10-31T11:00:00Z" },
    { id: 5, severity: null, created_at: "invalid" },
  ];
  assert.deepEqual(sortIncidents(rows).map((r) => r.id), [2, 4, 3, 1, 5]);
  assert.deepEqual(rows.map((r) => r.id), [1, 2, 3, 4, 5]);
});
test("display dates use the Gregorian year", () => {
  assert.match(date("2026-10-31T12:00:00Z"), /2026/);
  assert.doesNotMatch(date("2026-10-31T12:00:00Z"), /2569/);
  assert.doesNotMatch(date("2026-10-31T12:00:00Z"), /,/);
  assert.equal(date(null), "—");
});
test("rule lifetime follows server timestamps and never invents a percentage", () => {
  const rule = { created_at: "2026-10-31T12:00:00Z", expires_at: "2026-10-31T12:10:00Z" };
  assert.deepEqual(ruleLifetime(rule, Date.parse("2026-10-31T12:05:00Z")), { seconds: 300, percent: 50 });
  assert.deepEqual(ruleLifetime(rule, Date.parse("2026-10-31T12:15:00Z")), { seconds: 0, percent: 0 });
  assert.equal(ruleLifetime(rule, Date.parse("2026-10-31T11:59:00Z")).percent, 100);
  assert.equal(ruleLifetime({ ...rule, created_at: null }, Date.parse("2026-10-31T12:05:00Z")).percent, null);
  assert.equal(ruleLifetime({ expires_at: "invalid" }, Date.now()), null);
});
test("verification requires a denied request within the correct source and rule lifetime", () => {
  const r = {
    source_ip: "192.0.2.5",
    created_at: "2026-10-31T00:00:00Z",
    expires_at: "2026-10-31T00:10:00Z",
  };
  const t = {
    source_ip: r.source_ip,
    created_at: "2026-10-31T00:02:00Z",
    decision: "denied",
  };
  assert.equal(proofFor(r, [t]), t);
  for (const bad of [
    { ...t, source_ip: "192.0.2.6" },
    { ...t, decision: "allowed" },
    { ...t, created_at: "2026-10-30T23:59:00Z" },
    { ...t, created_at: "2026-10-31T00:11:00Z" },
  ])
    assert.equal(proofFor(r, [bad]), undefined);
  assert.equal(proofFor(r, []), undefined);
});
test("source list deduplicates and retains latest observed time", () => {
  const data = {
    events: [{ source_ip: "192.0.2.5", timestamp: "2026-10-31T00:02:00Z" }],
    traffic: [{ source_ip: "192.0.2.5", created_at: "2026-10-31T00:03:00Z" }],
    incidents: [{ source_ip: "192.0.2.6", created_at: "2026-10-31T00:01:00Z" }],
  };
  const s = sourcesOf(data);
  assert.equal(s.length, 2);
  assert.equal(s[0].at, data.traffic[0].created_at);
  assert.equal(s[1].ip, "192.0.2.6");
});
test("rule expiry and analysis fallback do not fabricate evidence", () => {
  assert.equal(
    activeRule(
      { expires_at: "2026-10-31T00:10:00Z" },
      Date.parse("2026-10-31T00:11:00Z"),
    ),
    false,
  );
  assert.equal(analysisOf({ analysis: "bad json" }), null);
  assert.equal(analysisOf({ analysis: { severity: "HIGH" } }).confidence, null);
  assert.deepEqual(
    analysisOf({ analysis: { evidence: "wrong type" } }).evidence,
    [],
  );
  for (const ip of [
    "192.0.2.5",
    "198.51.100.24",
    "203.0.113.4",
    "127.0.0.1",
    "10.1.2.3",
    "2001:db8::270f",
    "fd00::1",
  ])
    assert.equal(isPublic(ip), false);
});

test("attention queue puts unanalyzed critical incidents before a high approval", () => {
  const incidents = [
    { id: 1, severity: "HIGH", status: "awaiting_approval", created_at: "2026-11-01T00:00:05Z" },
    { id: 3, severity: "CRITICAL", status: "detected", created_at: "2026-11-01T00:00:01Z" },
    { id: 4, severity: "LOW", status: "detected", created_at: "2026-11-01T00:00:09Z" },
    { id: 5, severity: "HIGH", status: "verified", created_at: "2026-11-01T00:00:09Z" },
  ];
  const proposals = [
    { id: 1, incident_id: 1, status: "pending" },
    { id: 2, incident_id: 5, status: "approved" },
  ];
  const q = attentionQueue(incidents, proposals);
  assert.deepEqual(q.map((x) => x.key), ["i3", "p1"]);
  assert.equal(q[0].type, "analysis");
  assert.equal(q[1].type, "approval");
  assert.deepEqual(attentionQueue([], []), []);
});
