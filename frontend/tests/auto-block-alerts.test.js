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
const { default: AutoBlockAlerts, unacknowledgedAutoBlocks } = await server.ssrLoadModule("/src/AutoBlockAlerts.jsx");

const auto = { id: 7, incident_id: 12, target_ip: "198.51.100.9", status: "approved", reviewer: "system (auto)", duration_seconds: 600, created_at: "2026-11-04T12:00:00Z", acknowledged_at: null };
const ctx = (proposals, extra = {}) => ({
  data: { proposals, incidents: [{ id: 12, kind: "HONEYPOT" }] },
  user: "admin",
  busy: false,
  act: () => null,
  ...extra,
});
const html = (c) => renderToStaticMarkup(React.createElement(AutoBlockAlerts, { ctx: c }));

test("only automatic blocks that nobody acknowledged stay on screen", () => {
  const human = { ...auto, id: 8, reviewer: "admin" };
  const acked = { ...auto, id: 9, acknowledged_at: "2026-11-04T12:01:00Z", acknowledged_by: "admin" };
  const pending = { ...auto, id: 10, status: "pending", reviewer: null };
  assert.deepEqual(unacknowledgedAutoBlocks([auto, human, acked, pending]).map((p) => p.id), [7]);
  assert.equal(html(ctx([human, acked, pending])), "");
});

test("the alert names the IP, duration, incident and offers an acknowledge button", () => {
  const out = html(ctx([auto]));
  assert.match(out, /role="alert"/);
  assert.match(out, /รอรับทราบ 1 รายการ/);
  assert.match(out, /198\.51\.100\.9/);
  assert.match(out, /10 นาที/);
  assert.match(out, /href="#\/incident\/12"/);
  assert.match(out, /INC-0012/);
  assert.match(out, /system \(auto\)/);
  assert.match(out, />รับทราบ</);
  assert.doesNotMatch(out, /disabled=""/);
  assert.match(html(ctx([auto], { busy: true })), /disabled=""/);
});

test("acknowledge posts the admin name to the acknowledge endpoint", () => {
  const calls = [];
  const c = ctx([auto], { act: (path, opts) => calls.push([path, opts]) });
  const element = AutoBlockAlerts({ ctx: c });
  const findButton = (node) => {
    if (!node || typeof node !== "object") return null;
    if (node.type === "button") return node;
    const kids = [].concat(node.props?.children ?? []);
    for (const k of kids.flat()) {
      const found = findButton(k);
      if (found) return found;
    }
    return null;
  };
  findButton(element).props.onClick();
  assert.deepEqual(calls, [["/api/proposals/7/acknowledge", { body: { reviewer: "admin" } }]]);
});
