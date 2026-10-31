import React from "react";
import { analysisOf, kind, action } from "./lib.js";
import {
  Badge,
  Empty,
  Json,
  isFallback,
  isRuleOnly,
  RuleOnlyNotice,
  FallbackNotice,
} from "./ui.jsx";
export default function Analysis({ report }) {
  const a = analysisOf(report),
    ruleOnly = isRuleOnly(report.kind);
  if (!a)
    return (
      <>
        <RuleOnlyNotice kind={report.kind} />
        <Empty>
          {ruleOnly
            ? "ยังไม่มีผลตรวจจากกฎเฉพาะทาง"
            : "ยังไม่มีผลวิเคราะห์ที่บันทึก"}
        </Empty>
      </>
    );
  const fallback = isFallback(report);
  return (
    <div className="verdict">
      <RuleOnlyNotice kind={report.kind} />
      <FallbackNotice report={report} />
      <div className="verdictHead">
        <div>
          <span className="eyebrow">
            {ruleOnly
              ? "SPECIALIZED RULE DETECTION"
              : fallback
                ? "RULE FALLBACK / ไม่ใช่ผล AI"
                : "AI ASSESSMENT"}
          </span>
          <h3>{kind(a.threat_type || report.kind)}</h3>
        </div>
        <Badge value={a.severity} />
        {!fallback && !ruleOnly && (
          <span className="confidence">
            <b>{Math.round(a.confidence * 100)}%</b>
            <small>ความมั่นใจ</small>
          </span>
        )}
      </div>
      <p>{a.explanation_th}</p>
      <ol className="evidencePoints">
        {a.evidence.map((e, i) => (
          <li key={i}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            {e}
          </li>
        ))}
      </ol>
      <div className="recommendation">
        <small>แนวทางที่เสนอ</small>
        <b>{action(a.recommended_action)}</b>
      </div>
      <Json value={report.analysis} title="ดูผลวิเคราะห์ JSON" />
    </div>
  );
}
