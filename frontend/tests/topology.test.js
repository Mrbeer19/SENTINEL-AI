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
