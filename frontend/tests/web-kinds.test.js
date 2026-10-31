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
  logLevel: "error",
  server: { middlewareMode: true, hmr: false },
});
after(() => server.close());
const ui = await server.ssrLoadModule("/src/ui.jsx");
const { thresholdEvent } = await import("../src/detectionRules.js");
const { EventTable } = await server.ssrLoadModule("/src/Pages.jsx");
const { default: Analysis } = await server.ssrLoadModule("/src/Analysis.jsx");

const event = (id, seconds, fields = {}) => ({
  id,
  timestamp: new Date(Date.UTC(2026, 9, 31) + seconds * 1000).toISOString(),
  event_type: "HTTP_REQUEST",
  outcome: "attempt",
  ...fields,
});
const html = (Component, props) =>
  renderToStaticMarkup(React.createElement(Component, props));

test("honeypot selects the first matching HTTP request, including an out-of-order input", () => {
  const first = event(2, 2, { outcome: "honeypot" });
  assert.equal(
    thresholdEvent(
      [event(4, 4, { outcome: "honeypot" }), event(1, 1), first],
      "HONEYPOT",
    ),
    first,
  );
  assert.equal(
    thresholdEvent(
      [
        event(1, 0, { event_type: "HTTP_AUTH", outcome: "honeypot" }),
        event(2, 1),
      ],
      "HONEYPOT",
    ),
    null,
  );
});

test("flood sums request_count rather than event rows and flags the first crossing", () => {
  const rows = [
    event(1, 0, { request_count: 120 }),
    event(2, 30, { request_count: 179 }),
    event(3, 60, { request_count: 1 }),
    event(4, 61, { request_count: 300 }),
  ];
  assert.equal(thresholdEvent(rows, "HTTP_FLOOD").id, 3);
  assert.equal(
    thresholdEvent(
      Array.from({ length: 300 }, (_, i) => event(i, 0, { request_count: 0 })),
      "HTTP_FLOOD",
    ),
    null,
  );
  assert.equal(
    thresholdEvent([event(1, 0, { request_count: "300" })], "HTTP_FLOOD").id,
    1,
  );
});

test("flood excludes expired requests, wrong event types and invalid counts", () => {
  assert.equal(
    thresholdEvent(
      [
        event(1, 0, { request_count: 200 }),
        event(2, 60.001, { request_count: 100 }),
      ],
      "HTTP_FLOOD",
    ),
    null,
  );
  assert.equal(
    thresholdEvent(
      [
        event(1, 0, { request_count: 999, event_type: "HTTP_AUTH" }),
        event(2, 1, { request_count: 299 }),
      ],
      "HTTP_FLOOD",
    ),
    null,
  );
  for (const value of [undefined, -300, "invalid", Infinity, true, [300]]) {
    assert.equal(
      thresholdEvent([event(1, 0, { request_count: value })], "HTTP_FLOOD"),
      null,
    );
  }
});

test("scan independently sums not_found or scan_paths inside sixty seconds", () => {
  assert.equal(
    thresholdEvent(
      [event(1, 0, { not_found: 4 }), event(2, 60, { not_found: 6 })],
      "WEB_SCAN",
    ).id,
    2,
  );
  assert.equal(
    thresholdEvent(
      [event(1, 0, { scan_paths: 2 }), event(2, 60, { scan_paths: 1 })],
      "WEB_SCAN",
    ).id,
    2,
  );
  assert.equal(
    thresholdEvent([event(1, 0, { not_found: 9, scan_paths: 2 })], "WEB_SCAN"),
    null,
  );
  assert.equal(
    thresholdEvent(
      [
        event(1, 0, { not_found: 6, scan_paths: 2 }),
        event(2, 60.001, { not_found: 4, scan_paths: 1 }),
      ],
      "WEB_SCAN",
    ),
    null,
  );
});

test("all existing detection thresholds retain their previous behavior", () => {
  const auth = Array.from({ length: 5 }, (_, i) =>
    event(i + 1, i, { event_type: "HTTP_AUTH", outcome: "failed" }),
  );
  assert.equal(thresholdEvent(auth, "HTTP_AUTH_BRUTE_FORCE").id, 5);
  assert.equal(
    thresholdEvent(
      auth.map((e) => ({ ...e, event_type: "SSH_AUTH" })),
      "SSH_BRUTE_FORCE",
    ).id,
    5,
  );
  assert.equal(
    thresholdEvent(
      [...auth, event(6, 5, { event_type: "HTTP_AUTH", outcome: "success" })],
      "SUSPICIOUS_LOGIN",
    ).id,
    6,
  );
  assert.equal(
    thresholdEvent(
      Array.from({ length: 8 }, (_, i) =>
        event(i + 1, i, { destination_port: i + 20 }),
      ),
      "PORT_SCAN",
    ).id,
    8,
  );
  assert.equal(
    thresholdEvent(
      Array.from({ length: 100 }, (_, i) => event(i + 1, i / 2)),
      "TRAFFIC_ANOMALY",
    ).id,
    100,
  );
});

test("intentional rule kinds have a normal notice even with a legacy fallback mode", () => {
  for (const kind of ["HTTP_FLOOD", "WEB_SCAN", "HONEYPOT"]) {
    assert.equal(ui.isRuleOnly(kind), true);
    assert.equal(
      ui.isFallback({
        kind,
        analysis_mode: "rule_fallback",
        analysis: { confidence: null },
      }),
      false,
    );
    const notice = html(ui.RuleOnlyNotice, { kind });
    assert.match(notice, /notice ruleOnlyNotice/);
    assert.match(notice, /ภัยเว็บตรวจด้วยกฎเฉพาะทาง · ยังต้องให้แอดมินอนุมัติ/);
    assert.doesNotMatch(notice, /rule fallback|banner warn/);
    const analysis = {
      confidence: null,
      explanation_th: "rule evidence",
      evidence: [],
    };
    assert.doesNotMatch(
      html(Analysis, {
        report: {
          kind,
          analysis_mode: "rule_fallback",
          analysis,
          analysis_meta: { model: "unused-model" },
        },
      }),
      /rule fallback|unused-model|banner warn/,
    );
  }
});

test("genuine model fallback for other kinds remains visible and yellow", () => {
  assert.equal(ui.isRuleOnly("HTTP_FLOOD_OTHER"), false);
  assert.equal(
    ui.isFallback({
      kind: "HTTP_AUTH_BRUTE_FORCE",
      analysis_mode: "rule_fallback",
    }),
    true,
  );
  assert.equal(
    ui.isFallback({ kind: "PORT_SCAN", analysis: { confidence: null } }),
    true,
  );
  const analysis = { confidence: null, evidence: [] };
  assert.match(
    html(Analysis, {
      report: { analysis, kind: "PORT_SCAN", analysis_mode: "rule_fallback" },
    }),
    /notice warn/,
  );
});

const payload = [
  '/<img src=x onerror="alert(1)">',
  "https://example.invalid/<script>alert(1)</script>",
];
test("empty port columns stay hidden while scan port evidence remains available", () => {
  const rows = [event(1, 0, { event_type: "SSH_AUTH", username: "qa-user" })];
  const withoutPort = html(EventTable, { events: rows });
  assert.doesNotMatch(withoutPort, /<th>PORT<\/th>/);
  assert.match(withoutPort, /qa-user/);
  const withPort = html(EventTable, { events: [{ ...rows[0], destination_port: 22 }] });
  assert.match(withPort, /<th>PORT<\/th>/);
  assert.match(withPort, />22<\/td>/);
});
test("event table renders request totals and paths as escaped text without links", () => {
  const markup = html(EventTable, {
    kind: "HTTP_FLOOD",
    events: [
      event(1, 0, {
        request_count: 300,
        not_found: 10,
        paths: JSON.stringify(payload),
      }),
    ],
  });
  assert.match(markup, /<th>REQUESTS<\/th>/);
  assert.match(markup, /<th>404<\/th>/);
  assert.match(markup, /300/);
  assert.match(markup, /ถึงเกณฑ์ตรวจจับ/);
  assert.match(markup, /&lt;img/);
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<img|<script|<a\s|<th>Port|<th>Username/);
});

test("trace log table retains HTTP request fields and escapes untrusted paths", () => {
  const markup = html(EventTable, {
    kind: "HTTP_FLOOD",
    events: [
      event(1, 0, {
        request_count: 320,
        not_found: 12,
        paths: JSON.stringify(payload),
      }),
    ],
  });
  for (const label of ["REQUESTS", "404", "PATHS"])
    assert.match(markup, new RegExp(`<th>${label}</th>`));
  assert.match(markup, /320/);
  assert.match(markup, /&lt;img/);
  assert.doesNotMatch(markup, /<img|<script|<a\s/);
  assert.equal(ui.formatEventPaths("not valid json"), "not valid json");
  assert.equal(ui.formatEventPaths([]), "—");
  assert.equal(ui.formatEventPaths(payload), payload.join("\n"));
});
