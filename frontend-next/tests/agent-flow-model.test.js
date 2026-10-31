import test from "node:test";
import assert from "node:assert/strict";
import { deriveFlow, packetPosition } from "../src/agentFlowModel.js";

const agents = ["investigation", "threat_analysis", "defense_planning"];
const completed = agents.map((agent, id) => ({
  id,
  agent,
  operation: "invoke_agent",
  status: "ok",
  duration_ms: 100,
  created_at: "2026-10-31T01:00:00Z",
}));
const base = {
  id: 1,
  status: "detected",
  created_at: "2026-10-31T00:59:00Z",
  trace: [],
};
const analyzed = {
  ...base,
  status: "awaiting_approval",
  analysis: { severity: "HIGH" },
  analysis_mode: "ollama",
  trace: completed,
  proposal: { id: 1, status: "pending" },
};
test("new incidents do not invent work or a proposal", () => {
  const m = deriveFlow(base);
  assert.deepEqual(m.states, ["done", "wait", "wait", "wait", "wait", "wait"]);
  assert.equal(m.frames.length, 1);
});
test("live state advances only after an invoke_agent record", () => {
  assert.deepEqual(
    deriveFlow({ ...base, status: "analyzing" }).states.slice(1, 4),
    ["active", "wait", "wait"],
  );
  assert.deepEqual(
    deriveFlow({
      ...base,
      status: "analyzing",
      trace: [completed[0]],
    }).states.slice(1, 4),
    ["done", "active", "wait"],
  );
  assert.equal(
    deriveFlow({
      ...base,
      status: "analyzing",
      trace: [
        { agent: "investigation", operation: "execute_tool", status: "ok" },
      ],
    }).states[1],
    "active",
  );
});
test("approval does not imply verification; blocked requires a new request", () => {
  const pending = deriveFlow(analyzed);
  assert.deepEqual(pending.states.slice(4), ["active", "wait"]);
  assert.equal(pending.labels[4], "รอผู้ดูแล");
  assert.deepEqual(
    deriveFlow({ ...analyzed, proposal: { status: "approved" } }).states.slice(
      4,
    ),
    ["done", "wait"],
  );
  assert.deepEqual(
    deriveFlow({
      ...analyzed,
      status: "blocked",
      proposal: { status: "approved" },
    }).states.slice(4),
    ["done", "active"],
  );
  assert.equal(
    deriveFlow({
      ...analyzed,
      status: "verified",
      proposal: { status: "approved" },
    }).states[5],
    "done",
  );
});
test("rejected and expired blocks are not verified", () => {
  assert.deepEqual(
    deriveFlow({
      ...analyzed,
      status: "rejected",
      proposal: { status: "rejected" },
    }).states.slice(4),
    ["fail", "skip"],
  );
  assert.equal(
    deriveFlow({
      ...analyzed,
      status: "closed",
      proposal: { status: "approved" },
    }).states[5],
    "skip",
  );
});
test("fallback retains failed and skipped model stages", () => {
  const m = deriveFlow({
    ...analyzed,
    analysis_mode: "rule_fallback",
    trace: [
      { agent: "investigation", operation: "chat", status: "error" },
      { agent: "rule_fallback", operation: "invoke_agent", status: "fallback" },
    ],
  });
  assert.equal(m.fallback, true);
  assert.deepEqual(m.states.slice(1, 4), ["fail", "skip", "skip"]);
  assert(
    !m.frames.some((f) => f.states[2] === "done" || f.states[3] === "done"),
  );
});
test("successful retries use the final invoke result", () => {
  const m = deriveFlow({
    ...analyzed,
    trace: [
      { agent: "threat_analysis", operation: "chat", status: "invalid_output" },
      ...completed,
    ],
  });
  assert.equal(m.states[2], "done");
});
test("no-action and legacy reports do not invent completed agents", () => {
  const m = deriveFlow({
    ...analyzed,
    status: "monitoring",
    proposal: null,
    trace: [],
  });
  assert.deepEqual(m.states, ["done", "skip", "skip", "skip", "skip", "skip"]);
  assert(m.frames.every((f) => f.states[4] !== "active"));
});
test("history preserves recorded decisions and stops at the latest known state", () => {
  for (const report of [
    analyzed,
    { ...analyzed, status: "rejected", proposal: { status: "rejected" } },
    { ...analyzed, status: "verified", proposal: { status: "approved" } },
  ]) {
    const m = deriveFlow(report);
    assert.deepEqual(m.frames.at(-1).states, m.states);
    assert.deepEqual(deriveFlow(report).states, m.states);
  }
});
test("all packet lanes arrive before a 3.3 second checkpoint change", () => {
  for (let lane = 0; lane < 3; lane++) {
    assert.equal(packetPosition(0, lane), 0);
    assert.equal(packetPosition(2.8, lane), 1);
    let prev = 0;
    for (let t = 0; t < 3.3; t += 0.01) {
      const p = packetPosition(t, lane);
      assert(p >= prev && p <= 1);
      prev = p;
    }
  }
});
