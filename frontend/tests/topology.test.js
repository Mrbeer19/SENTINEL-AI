import test from "node:test";
import assert from "node:assert/strict";
import {
  topologyOf,
  topologyWindow,
  MAX_VISIBLE_SOURCES,
} from "../src/topologyModel.js";

const data = {
  events: Array.from({ length: 10000 }, (_, i) => ({
    source_ip: `2001:db8::${(i + 1).toString(16)}`,
    timestamp: new Date(1800000000000 - i * 1000).toISOString(),
  })),
  traffic: [],
  incidents: Array.from({ length: 80 }, (_, i) => ({
    source_ip: `2001:db8::${(i + 1).toString(16)}`,
    status: "detected",
    created_at: "2026-10-31T00:00:00Z",
  })),
};
const rules = Array.from({ length: 20 }, (_, i) => ({
  source_ip: `2001:db8::${(i + 1).toString(16)}`,
}));
const model = topologyOf(data, rules);

test("ten thousand unique sources become three accurate, non-overlapping groups", () => {
  assert.equal(model.sources.length, 10000);
  assert.deepEqual(
    model.groups.map((g) => g.count),
    [20, 60, 9920],
  );
  assert.equal(topologyWindow(model).clustered, true);
  assert.equal(
    model.sources.find((s) => s.ip === "2001:db8::1").status,
    "blocked",
  );
});

test("every grouped source remains reachable and no map page exceeds ten IPs", () => {
  for (const group of model.groups) {
    const first = topologyWindow(model, { group: group.key });
    const all = [];
    for (let page = 0; page < first.pages; page++) {
      const slice = topologyWindow(model, { group: group.key, page });
      assert.equal(slice.clustered, false);
      assert.ok(slice.visible.length <= MAX_VISIBLE_SOURCES);
      all.push(...slice.visible.map((s) => s.ip));
    }
    assert.equal(all.length, group.count);
    assert.equal(new Set(all).size, group.count);
  }
});

test("search preserves IP identity and pagination clamps after data shrinks", () => {
  const result = topologyWindow(model, { query: "2001:db8::270F", page: 9999 });
  assert.equal(result.clustered, false);
  assert.equal(result.page, 0);
  assert.deepEqual(
    result.visible.map((s) => s.ip),
    ["2001:db8::270f"],
  );
  assert.equal(topologyWindow(model, { group: "blocked", page: 9999 }).page, 1);
  assert.equal(topologyWindow(model, { page: -1 }).page, 0);
  assert.deepEqual(topologyWindow(model, { query: "no match" }).visible, []);
  assert.equal(
    topologyWindow(topologyOf({ events: [], traffic: [], incidents: [] }, []))
      .clustered,
    false,
  );
});

test("a small source set remains individually visible without grouping", () => {
  const small = topologyOf(
    { ...data, events: data.events.slice(0, 5), incidents: [] },
    [],
  );
  assert.equal(topologyWindow(small).clustered, false);
  assert.equal(topologyWindow(small).visible.length, 5);
});
test("channel filter keeps only sources seen on that channel", () => {
  const m = topologyOf(
    {
      events: [
        { source_ip: "192.0.2.1", event_type: "HTTP_REQUEST", timestamp: "2026-10-31T00:00:00Z" },
        { source_ip: "192.0.2.2", event_type: "CONNECTION", timestamp: "2026-10-31T00:00:00Z" },
      ],
      traffic: [],
      incidents: [],
    },
    [],
  );
  assert.deepEqual(topologyWindow(m, { channel: "web" }).filtered.map((s) => s.ip), ["192.0.2.1"]);
  assert.deepEqual(m.channels.map((c) => [c.key, c.count]), [["web", 1], ["ssh", 0], ["port", 1]]);
});

test("the time range hides quiet IPs but keeps blocked ones and open incidents", () => {
  const now = Date.parse("2026-11-04T02:00:00Z");
  const ago = (min) => new Date(now - min * 60000).toISOString();
  const recent = {
    events: [
      { source_ip: "198.51.100.1", timestamp: ago(2), event_type: "HTTP_REQUEST" },
      { source_ip: "198.51.100.2", timestamp: ago(40), event_type: "HTTP_REQUEST" },
      { source_ip: "198.51.100.3", timestamp: ago(90), event_type: "CONNECTION" },
      { source_ip: "198.51.100.4", timestamp: ago(300), event_type: "SSH_AUTH" },
    ],
    traffic: [],
    incidents: [{ source_ip: "198.51.100.4", status: "detected", kind: "SSH_BRUTE_FORCE", created_at: ago(300) }],
  };
  const blockedRule = [{ source_ip: "198.51.100.3" }];
  const ips = (range) => topologyOf(recent, blockedRule, { range, now }).sources.map((s) => s.ip).sort();
  assert.deepEqual(ips("15m"), ["198.51.100.1", "198.51.100.3", "198.51.100.4"]);
  assert.deepEqual(ips("1h"), ["198.51.100.1", "198.51.100.2", "198.51.100.3", "198.51.100.4"]);
  assert.equal(ips("all").length, 4);
  assert.equal(topologyOf(recent, blockedRule, { range: "15m", now }).channels.find((c) => c.key === "web").count, 1);
});
