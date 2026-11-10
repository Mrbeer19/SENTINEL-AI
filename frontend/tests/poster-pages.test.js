import test, { after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true, hmr: false },
});
after(() => server.close());
const { Summary, StoredEvents, EventChart, Incidents, Rules } =
  await server.ssrLoadModule("/src/PosterPages.jsx");
const html = (component, props) =>
  renderToStaticMarkup(React.createElement(component, props));
const at = "2026-11-10T12:00:00Z";
const incidents = [
  {
    id: 27,
    source_ip: "203.0.113.24",
    kind: "HTTP_FLOOD",
    status: "awaiting_approval",
    severity: "CRITICAL",
    created_at: at,
  },
  {
    id: 28,
    source_ip: "198.51.100.28",
    kind: "SSH_BRUTE_FORCE",
    status: "detected",
    severity: "HIGH",
    created_at: at,
  },
  {
    id: 26,
    source_ip: "192.0.2.48",
    kind: "WEB_SCAN",
    status: "verified",
    severity: "MEDIUM",
    created_at: at,
  },
];
const ctx = {
  data: { incidents, proposals: [], rules: [], traffic: [], events: [] },
  now: Date.parse(at) + 60000,
  user: "reviewer",
  error: "",
  busy: false,
};
test("new incident rows retain each real incident identity", () => {
  globalThis.location = { hash: "#/incidents" };
  const out = html(Incidents, { ctx });
  for (const id of [26, 27, 28])
    assert.match(out, new RegExp(`href="#/incident/${id}"`));
  assert.deepEqual(
    [...out.matchAll(/href="#\/incident\/(\d+)">INC-(\d+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]),
    [
      [27, 27],
      [28, 28],
      [26, 26],
    ],
  );
});
test("deep-linked source, severity and channel filters are applied together", () => {
  globalThis.location = {
    hash: "#/incidents?q=198.51.100.28&severity=HIGH&channel=ssh",
  };
  const out = html(Incidents, { ctx });
  assert.match(out, /href="#\/incident\/28"/);
  assert.doesNotMatch(out, /href="#\/incident\/(26|27)"/);
});
test("open queue excludes verified incidents", () => {
  globalThis.location = { hash: "#/incidents?status=open" };
  const out = html(Incidents, { ctx });
  assert.match(out, /href="#\/incident\/27"/);
  assert.doesNotMatch(out, /href="#\/incident\/26"/);
});
test("rule-only and fallback summaries never present model confidence", () => {
  const analysis = {
    explanation_th: "Recorded evidence",
    confidence: 0.99,
    evidence: [],
    recommended_action: "TEMP_BLOCK_IP",
  };
  for (const report of [
    { kind: "HTTP_FLOOD", analysis },
    { kind: "SSH_BRUTE_FORCE", analysis_mode: "rule_fallback", analysis },
  ])
    assert.doesNotMatch(html(Summary, { report }), /99% confidence/);
  assert.match(
    html(Summary, {
      report: { kind: "SSH_BRUTE_FORCE", analysis_mode: "ollama", analysis },
    }),
    /99% confidence/,
  );
});
test("stored HTTP evidence preserves request totals and escapes attacker paths", () => {
  const out = html(StoredEvents, {
    kind: "HTTP_FLOOD",
    events: [
      {
        id: 1,
        timestamp: at,
        event_type: "HTTP_REQUEST",
        outcome: "attempt",
        request_count: 900,
        not_found: 12,
        paths: ["<script>alert(1)</script>"],
      },
    ],
  });
  assert.match(out, /900/);
  assert.match(out, /&lt;script&gt;/);
  assert.doesNotMatch(out, /<script>|<a[^>]+alert/);
  assert.match(out, /ถึงเกณฑ์/);
});
test("chart describes stored counts without fabricating a requests-per-second rate", () => {
  const out = html(EventChart, {
    events: [{ id: 1, timestamp: at, request_count: 300 }],
  });
  assert.match(out, /300/);
  assert.match(out, /ต่อ event/);
  assert.doesNotMatch(out, /requests per second|req\/s/i);
});
test("active protection is not verified without a denied request", () => {
  const rule = {
    id: 9,
    source_ip: "203.0.113.24",
    created_at: at,
    expires_at: "2026-11-10T12:10:00Z",
  };
  const out = html(Rules, {
    ctx: { ...ctx, data: { ...ctx.data, rules: [rule] } },
    id: 9,
  });
  assert.match(out, /รอคำขอใหม่/);
  assert.match(out, /ยังไม่มีหลักฐาน HTTP 403/);
  assert.doesNotMatch(out, /✓ HTTP 403 verified/);
});
test("manual-unblock rules display no invented countdown", () => {
  const rule = {
    id: 10,
    source_ip: "203.0.113.24",
    created_at: at,
    expires_at: "9999-12-31T23:59:59Z",
  };
  const out = html(Rules, {
    ctx: { ...ctx, data: { ...ctx.data, rules: [rule] } },
    id: 10,
  });
  assert.match(out, /จนกว่าจะปลด/);
  assert.doesNotMatch(out, /9999|NaN|เหลือ \d+ วินาที/);
});
