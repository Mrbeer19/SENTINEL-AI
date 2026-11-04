import React from "react";
import { duration, incidentId, kind, time } from "./lib.js";
import { Icon, isAutoApproved } from "./ui.jsx";

// Blocks the rule approved without a human stay on screen until an admin acknowledges them
// (POST /api/proposals/{id}/acknowledge records who and when in the audit log).
export const unacknowledgedAutoBlocks = (proposals = []) =>
  proposals.filter((p) => isAutoApproved(p) && p.status === "approved" && !p.acknowledged_at);

export default function AutoBlockAlerts({ ctx }) {
  const items = unacknowledgedAutoBlocks(ctx.data.proposals);
  if (!items.length) return null;
  const incidents = new Map(ctx.data.incidents.map((i) => [i.id, i]));
  const reviewer = (ctx.user || "").trim();
  return (
    <section className="autoBlockAlerts" role="alert" aria-label="การบล็อกที่ระบบอนุมัติเองซึ่งรอรับทราบ">
      <header>
        <Icon name="shield" size={16} />
        <b>ระบบบล็อกเองโดยไม่รอผู้ดูแล · รอรับทราบ {items.length} รายการ</b>
      </header>
      {items.map((p) => {
        const incident = incidents.get(p.incident_id);
        return (
          <div className="autoBlockAlert" key={p.id}>
            <span>
              บล็อก <b className="mono">{p.target_ip || p.source_ip}</b> ชั่วคราว {duration(p.duration_seconds)}
              {" · "}
              <a href={`#/incident/${p.incident_id}`}>
                {incidentId(p.incident_id)}
                {incident ? ` ${kind(incident.kind)}` : ""}
              </a>
              {" · "}
              <small>
                กฎตัดสินเอง (system (auto)) เมื่อ {time(p.created_at)} · ปลดบล็อกได้ที่ Protection
              </small>
            </span>
            <button
              className="button compact"
              disabled={ctx.busy || reviewer.length < 2}
              onClick={() =>
                ctx.act(`/api/proposals/${p.id}/acknowledge`, { body: { reviewer } })
              }
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
