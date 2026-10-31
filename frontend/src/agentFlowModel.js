// Server records determine state. Animation never completes a stage or approves a proposal.
export const FLOW_STAGES = [
  {
    key: "detection",
    title: "Detection",
    th: "ตรวจพบเหตุการณ์",
    icon: "alert",
    note: "ตรวจเงื่อนไขจากเหตุการณ์ที่รับเข้าระบบ",
  },
  {
    key: "investigation",
    title: "Investigator",
    th: "สืบค้นหลักฐาน",
    icon: "search",
    note: "อ่านบันทึกและกิจกรรมที่เกี่ยวข้อง · เครื่องมืออ่านอย่างเดียว",
  },
  {
    key: "threat_analysis",
    title: "Threat Analyst",
    th: "วิเคราะห์ภัย",
    icon: "brain",
    note: "จัดประเภทและประเมินความรุนแรงจากหลักฐาน",
  },
  {
    key: "defense_planning",
    title: "Defense Planner",
    th: "วางแผนป้องกัน",
    icon: "shield",
    note: "จัดทำคำแนะนำจากฟิลด์ที่กำหนด โดยไม่เห็นข้อความ log",
  },
  {
    key: "approval",
    title: "Human approval",
    th: "ผู้ดูแลตัดสินใจ",
    icon: "check",
    note: "ข้อเสนอจะไม่ดำเนินการจนกว่าผู้ดูแลจะยืนยัน",
  },
  {
    key: "verification",
    title: "Verification",
    th: "ตรวจผลการป้องกัน",
    icon: "shield",
    note: "รอหลักฐานจากคำขอใหม่หลังอนุมัติ ไม่ถือว่าอนุมัติแล้วเท่ากับพิสูจน์ผล",
  },
];
export const badTrace = (row) =>
  !!row.status && !["ok", "fallback"].includes(row.status);
export const STATE_TEXT = {
  done: "เสร็จแล้ว",
  active: "กำลังทำงาน",
  wait: "รอขั้นก่อนหน้า",
  skip: "ข้ามขั้นตอน",
  fail: "ไม่ผ่าน",
};

export function deriveFlow(report) {
  const trace = report.trace || [],
    final = !!report.analysis;
  const fallback =
    report.analysis_mode === "rule_fallback" ||
    trace.some((t) => t.agent === "rule_fallback");
  const rows = FLOW_STAGES.map((s) => trace.filter((t) => t.agent === s.key));
  let open = false,
    stopped = fallback;
  const states = ["done"];
  for (let i = 1; i <= 3; i++) {
    const run = rows[i].filter((t) => t.operation === "invoke_agent").at(-1);
    const failed = rows[i].some(badTrace);
    if (run) {
      states.push(badTrace(run) ? "fail" : "done");
      stopped ||= badTrace(run);
    } else if (failed && (final || fallback)) {
      states.push("fail");
      stopped = true;
    } else if (report.status === "analyzing" && !stopped && !open) {
      states.push("active");
      open = true;
    } else
      states.push(
        final || fallback || report.status === "closed" ? "skip" : "wait",
      );
  }
  const p = report.proposal;
  states.push(
    p
      ? p.status === "pending"
        ? "active"
        : p.status === "rejected"
          ? "fail"
          : p.status === "approved"
            ? "done"
            : "wait"
      : final || report.status === "closed"
        ? "skip"
        : "wait",
  );
  states.push(
    report.status === "verified"
      ? "done"
      : report.status === "blocked"
        ? "active"
        : p?.status === "rejected" ||
            (final && !p) ||
            report.status === "closed"
          ? "skip"
          : "wait",
  );
  const labels = states.map((s) => STATE_TEXT[s]);
  if (p?.status === "pending") labels[4] = "รอผู้ดูแล";
  if (p?.status === "rejected") labels[4] = "ปฏิเสธแล้ว";
  if (p?.status === "approved") labels[4] = "อนุมัติแล้ว";
  if (states[5] === "active") labels[5] = "รอคำขอใหม่";
  if (states[5] === "done") labels[5] = "ยืนยันผลแล้ว";
  const active = states.indexOf("active");
  const focus =
    active >= 0
      ? active
      : states.reduce(
          (last, s, i) => (["done", "fail"].includes(s) ? i : last),
          0,
        );
  const frames = [
    {
      states: ["done", "wait", "wait", "wait", "wait", "wait"],
      stage: 0,
      label: "ตรวจพบเหตุการณ์",
      at: report.created_at,
    },
  ];
  const add = (snapshot, stage, label, at) =>
    frames.push({ states: [...snapshot], stage, label, at });
  const recorded = [...frames[0].states];
  for (let i = 1; i <= 3; i++) {
    if (!rows[i].length) continue;
    recorded[i] = "active";
    add(
      recorded,
      i,
      `${FLOW_STAGES[i].title} · เริ่มขั้นตอน`,
      rows[i][0].created_at,
    );
    if (["done", "fail"].includes(states[i])) {
      recorded[i] = states[i];
      add(
        recorded,
        i,
        `${FLOW_STAGES[i].title} · ${STATE_TEXT[states[i]]}`,
        rows[i].at(-1).created_at,
      );
    }
  }
  if (fallback || final) for (let i = 1; i <= 3; i++) recorded[i] = states[i];
  if (fallback)
    add(
      recorded,
      focus < 4 ? focus : 3,
      "Rule fallback · ไม่ใช่ผลวิเคราะห์ AI",
      trace.find((t) => t.agent === "rule_fallback")?.created_at,
    );
  if (p) {
    recorded[4] = "active";
    add(recorded, 4, "ข้อเสนอรอผู้ดูแล", p.created_at);
    if (p.status !== "pending") {
      recorded[4] = states[4];
      recorded[5] = states[5] === "skip" ? "skip" : "wait";
      add(
        recorded,
        4,
        labels[4],
        report.timeline?.find((t) =>
          ["approved", "rejected", "blocked"].includes(t.stage),
        )?.created_at,
      );
    }
  }
  if (states[5] === "active" || states[5] === "done") {
    recorded[5] = states[5];
    add(
      recorded,
      5,
      labels[5],
      report.timeline?.find(
        (t) =>
          t.stage === (report.status === "verified" ? "verified" : "blocked"),
      )?.created_at,
    );
  } else if (final && !p)
    add(
      states,
      focus,
      "สิ้นสุดการวิเคราะห์ · ไม่มีข้อเสนอบล็อก",
      report.updated_at,
    );
  return { states, labels, rows, fallback, focus, frames };
}

// Cosmetic travel only. Period is elapsed seconds rather than a fraction per display frame.
export function packetPosition(seconds, lane = 0) {
  return Math.max(0, Math.min(1, (seconds / 2.8 - 0.06 - lane * 0.055) / 0.7));
}
