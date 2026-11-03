import test from "node:test";
import assert from "node:assert/strict";
import { activeAfterBlock, attentionQueue, isOpenIncident } from "../src/lib.js";

const rule = { source_ip: "198.51.100.9", created_at: "2026-11-04T01:00:00Z" };
const incident = { id: 7, source_ip: "198.51.100.9", status: "blocked", kind: "SSH_BRUTE_FORCE", severity: "HIGH" };
const ev = (type, at, ip = "198.51.100.9") => ({ source_ip: ip, event_type: type, timestamp: at });

test("blocked incidents are not open, but SSH/port activity after the block is flagged", () => {
  assert.equal(isOpenIncident(incident), false);
  const events = [
    ev("SSH_AUTH", "2026-11-04T00:59:00Z"), // before the rule: not counted
    ev("SSH_AUTH", "2026-11-04T01:02:00Z"),
    ev("CONNECTION", "2026-11-04T01:03:00Z"),
    ev("HTTP_REQUEST", "2026-11-04T01:04:00Z"), // web is blocked at Caddy (403), not a gap
    ev("SSH_AUTH", "2026-11-04T01:05:00Z", "203.0.113.1"), // another IP
  ];
  assert.equal(activeAfterBlock(incident, [rule], events), 2);
  const queue = attentionQueue([incident], [], [rule], events);
  assert.deepEqual(queue.map((x) => [x.type, x.count]), [["afterBlock", 2]]);
  assert.equal(attentionQueue([incident], [], [rule], events.slice(0, 1)).length, 0);
  assert.equal(activeAfterBlock({ ...incident, status: "verified" }, [rule], events), 0);
});
