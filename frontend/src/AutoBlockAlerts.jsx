import React, { useState } from "react";
import { duration, incidentId, kind, time } from "./lib.js";
import { Icon, isAutoApproved } from "./ui.jsx";
import { useReducedMotion } from "./motion.jsx";

// --dur-state in motion.css: the row fades out before the request, so the list does not jump.
const LEAVE_MS = 220;

// Blocks the rule approved without a human stay on screen until an admin acknowledges them
// (POST /api/proposals/{id}/acknowledge records who and when in the audit log).
export const unacknowledgedAutoBlocks = (proposals = []) =>
  proposals.filter((p) => isAutoApproved(p) && p.status === "approved" && !p.acknowledged_at);

export const acknowledgeCall = (proposal, reviewer) => [
  `/api/proposals/${proposal.id}/acknowledge`,
  { body: { reviewer } },
];

export default function AutoBlockAlerts({ ctx }) {
  const reduced = useReducedMotion(),
    [leaving, setLeaving] = useState(() => new Set());
  const items = unacknowledgedAutoBlocks(ctx.data.proposals);
  if (!items.length) return null;
  const incidents = new Map(ctx.data.incidents.map((i) => [i.id, i]));
  const reviewer = (ctx.user || "").trim();
  const acknowledge = async (p) => {
    setLeaving((old) => new Set([...old, p.id]));
    if (!reduced) await new Promise((done) => setTimeout(done, LEAVE_MS));
    const result = await ctx.act(...acknowledgeCall(p, reviewer));
    if (!result) setLeaving((old) => { const next = new Set(old); next.delete(p.id); return next; });
  };
  return (
    <section className="autoBlockAlerts" role="alert" aria-label="การบล็อกที่ระบบอนุมัติเองซึ่งรอรับทราบ">
      <header>
        <Icon name="shield" size={16} />
        <b>ระบบบล็อกเองโดยไม่รอผู้ดูแล · รอรับทราบ {items.length} รายการ</b>
      </header>
      {items.map((p, index) => {
        const incident = incidents.get(p.incident_id);
        return (
          <div
            className={`autoBlockAlert${leaving.has(p.id) ? " leaving" : ""}`}
            key={p.id}
            style={{ "--alert-index": Math.min(index, 5) }}
          >
            <span>
              บล็อก <b className="mono">{p.target_ip || p.source_ip}</b> ชั่วคราว {duration(p.duration_seconds)}
              {" · "}
              <a href={`#/incident/${p.incident_id}`}>
                {incidentId(p.incident_id)}
                {incident ? ` ${kind(incident.kind)}` : ""}
              </a>
              {" · "}
              <small>
                กฎตัดสินเอง · system (auto) · {time(p.created_at)} · ปลดบล็อกได้ที่ Protection
              </small>
            </span>
            <button
              className="button compact"
              disabled={ctx.busy || leaving.has(p.id) || reviewer.length < 2}
              onClick={() => acknowledge(p)}
            >
              <Icon name="check" size={14} />
              รับทราบ
            </button>
          </div>
        );
      })}
    </section>
  );
}
