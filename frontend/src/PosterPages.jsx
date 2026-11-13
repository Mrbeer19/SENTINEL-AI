import React, { useEffect, useMemo, useRef, useState } from "react";
import { useReport } from "./api.js";
import {
  Badge,
  Confirmation,
  Empty,
  Icon,
  Panel,
  Search,
  Table,
  Toggle,
  isRuleOnly,
  isAutoApproved,
  formatEventPaths,
} from "./ui.jsx";
import {
  activeRule,
  analysisOf,
  action,
  channelOfKind,
  date,
  duration,
  expiresText,
  incidentId,
  isOpenIncident,
  kind,
  proofFor,
  ruleLifetime,
  sortIncidents,
  targetIp,
  time,
} from "./lib.js";
import { thresholdEvent, ruleCriterion } from "./detectionRules.js";
import { deriveFlow } from "./agentFlowModel.js";

export const titles = {
  overview: ["Security overview", "ภาพรวมความปลอดภัย"],
  incidents: ["Security incidents", "คัดกรองเหตุการณ์และเปิดหลักฐาน"],
  incident: ["Incident detail", "หลักฐานและผลการตอบสนอง"],
  trace: ["Investigation", "ตรวจสอบลำดับและหลักฐานการวิเคราะห์"],
  approvals: ["Response approvals", "ตรวจทานก่อนตัดสินใจ"],
  rules: ["Web protection", "Active blocks and verification"],
  reports: ["Security reports", "รายงานหลักฐานของเหตุการณ์"],
};
export function ApprovalWave({ events }) {
  const rows = events.slice(-24),
    max = Math.max(1, ...rows.map((e) => Number(e.request_count || 1)));
  return (
    <figure
      className="posterApprovalWave"
      aria-label="จำนวนคำขอใน events ที่โหลด"
    >
      <svg viewBox="0 0 600 140" preserveAspectRatio="none">
        <path
          d={`M0 125 ${rows.map((e, i) => `L${(i * 600) / Math.max(1, rows.length - 1)} ${125 - (Number(e.request_count || 1) / max) * 110}`).join(" ")}`}
          fill="none"
          stroke="#c3d4df"
          strokeWidth="1.5"
        />
        {[45, 85, 125].map((y) => (
          <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#73818c33" />
        ))}
      </svg>
      <figcaption>{events.length} stored events · counts per event</figcaption>
    </figure>
  );
}
const ipColumn = {
  key: "source_ip",
  label: "Source IP",
  render: (r) => <span className="mono">{r.source_ip}</span>,
};
function ReportState({ state, ctx }) {
  return state.loading ? (
    <div
      className="evidenceSkeleton"
      role="status"
      aria-label="กำลังโหลดหลักฐาน"
    >
      <i className="skeleton" />
      <i className="skeleton" />
      <i className="skeleton" />
    </div>
  ) : (
    <div className="notice bad" role="alert">
      {state.error || "ไม่พบเหตุการณ์นี้"}{" "}
      <button className="button compact" onClick={() => ctx.refresh(true)}>
        ลองใหม่
      </button>{" "}
      <a href="#/incidents">กลับ Incidents</a>
    </div>
  );
}
export function exportReport(report) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `sentinel-${incidentId(report.id)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ExportButton({ report }) {
  return (
    <button className="button compact" onClick={() => exportReport(report)}>
      <Icon name="download" /> Export JSON
    </button>
  );
}
export function Summary({ report, compact = false }) {
  const a = analysisOf(report),
    rule = isRuleOnly(report.kind),
    fallback = !rule && report.analysis_mode === "rule_fallback";
  return (
    <div className={`posterAnalysis ${compact ? "compact" : ""}`}>
      <div className="analysisOrigin">
        <span className="eyebrow">
          {rule
            ? "SPECIALIZED RULE"
            : fallback
              ? "RULE FALLBACK"
              : "AI ASSESSMENT"}
        </span>
        {!rule && !fallback && a?.confidence != null && (
          <span>{Math.round(a.confidence * 100)}% confidence</span>
        )}
      </div>
      {fallback && <p className="notice">ผลจากกฎสำรอง · ไม่ใช่ผลของโมเดล</p>}
      <p>
        {a?.explanation_th ||
          (report.status === "analyzing"
            ? "กำลังวิเคราะห์หลักฐาน…"
            : "ยังไม่มีผลวิเคราะห์ที่บันทึก")}
      </p>
      {!compact && a?.evidence?.length > 0 && (
        <ol className="posterEvidencePoints">
          {a.evidence.map((text, i) => (
            <li key={i}>
              <small>{String(i + 1).padStart(2, "0")}</small>
              {text}
            </li>
          ))}
        </ol>
      )}
      {a && (
        <div className="recommended">
          <small>Recommended response</small>
          <strong>{action(a.recommended_action)}</strong>
        </div>
      )}
    </div>
  );
}
export function EventChart({ events = [] }) {
  const rows = [...events]
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .slice(-32),
    values = rows.map((e) => Math.max(0, Number(e.request_count ?? 1))),
    max = Math.max(1, ...values);
  const coords = values
    .map(
      (v, i) =>
        `${40 + (i * 650) / Math.max(1, values.length - 1)},${155 - (v / max) * 125}`,
    )
    .join(" ");
  return (
    <figure className="posterEventChart">
      <figcaption>
        Stored request counts{" "}
        <small>
          จำนวนคำขอต่อ event ที่บันทึก · {rows.length} events ล่าสุด
        </small>
      </figcaption>
      {rows.length ? (
        <>
          <svg
            viewBox="0 0 720 190"
            role="img"
            aria-label={`จำนวนคำขอใน ${rows.length} events ค่าสูงสุด ${max}`}
          >
            <defs>
              <linearGradient id="eventFill" x2="0" y2="1">
                <stop stopColor="#ff4058" stopOpacity=".6" />
                <stop offset="1" stopColor="#ff4058" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[30, 70, 110, 155].map((y) => (
              <line key={y} x1="40" x2="700" y1={y} y2={y} stroke="#64727c44" />
            ))}
            <text x="0" y="32" fill="#aeb7c0" fontSize="11">
              {max}
            </text>
            <text x="5" y="158" fill="#aeb7c0" fontSize="11">
              0
            </text>
            <polygon
              points={`40,155 ${coords} 690,155`}
              fill="url(#eventFill)"
            />
            <polyline
              points={coords}
              fill="none"
              stroke="#ff4058"
              strokeWidth="2.5"
            />
            <text x="40" y="181" fill="#aeb7c0" fontSize="11">
              {time(rows[0].timestamp)}
            </text>
            <text x="610" y="181" fill="#aeb7c0" fontSize="11">
              {time(rows.at(-1).timestamp)}
            </text>
          </svg>
        </>
      ) : (
        <Empty>ยังไม่มี event สำหรับกราฟ</Empty>
      )}
    </figure>
  );
}
export function StoredEvents({ events = [], kind: threat }) {
  const web = events.some((e) => e.event_type === "HTTP_REQUEST"),
    port = events.some((e) => e.destination_port != null),
    crossing = thresholdEvent(events, threat)?.id;
  return (
    <>
      <h3 className="posterSubhead">Stored events</h3>
      {ruleCriterion(threat) && <p className="hint">{ruleCriterion(threat)}</p>}
      <Table
        rows={events}
        flagged={crossing}
        columns={[
          { key: "timestamp", label: "Time", render: (e) => time(e.timestamp) },
          { key: "event_type", label: "Type" },
          {
            key: "outcome",
            label: "Result",
            render: (e) => <Badge value={e.outcome} />,
          },
          ...(port ? [{ key: "destination_port", label: "Port" }] : []),
          ...(web
            ? [
                { key: "request_count", label: "Requests" },
                { key: "not_found", label: "404" },
                {
                  key: "paths",
                  label: "Paths",
                  render: (e) => (
                    <span className="eventPaths">
                      {formatEventPaths(e.paths)}
                    </span>
                  ),
                },
              ]
            : [{ key: "username", label: "Account" }]),
          ...(crossing != null
            ? [
                {
                  key: "threshold",
                  label: "Rule",
                  render: (e) => (e.id === crossing ? "ถึงเกณฑ์" : "—"),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
function AuditTrail({ rows = [] }) {
  return rows.length ? (
    <ol className="posterAudit">
      {rows.map((t, i) => (
        <li key={t.id ?? i}>
          <time>{date(t.ts || t.created_at)}</time>
          <strong>{t.actor || t.stage || t.action}</strong>
          <p>
            {typeof t.detail === "string" ? t.detail : JSON.stringify(t.detail)}
          </p>
        </li>
      ))}
    </ol>
  ) : (
    <Empty>ยังไม่มีประวัติการดำเนินการ</Empty>
  );
}
function useParams() {
  return new URLSearchParams(location.hash.split("?")[1] || "");
}
export function Incidents({ ctx }) {
  const params = useParams(),
    [q, setQ] = useState(params.get("q") || ctx.searchQuery || ""),
    [status, setStatus] = useState(params.get("status") || "all"),
    [severity, setSeverity] = useState(params.get("severity") || "all"),
    [threat, setThreat] = useState(params.get("kind") || "all"),
    [channel, setChannel] = useState(params.get("channel") || "all"),
    [sort, setSort] = useState(params.get("sort") || "severity");
  const filtered = ctx.data.incidents.filter(
    (i) =>
      (status === "all" ||
        (status === "open" ? isOpenIncident(i) : i.status === status)) &&
      (severity === "all" || i.severity === severity) &&
      (threat === "all" || i.kind === threat) &&
      (channel === "all" || channelOfKind(i.kind) === channel) &&
      `${incidentId(i.id)} ${i.source_ip} ${kind(i.kind)}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const rows =
    sort === "time"
      ? [...filtered].sort(
          (a, b) =>
            Date.parse(b.updated_at || b.created_at) -
            Date.parse(a.updated_at || a.created_at),
        )
      : sortIncidents(filtered);
  useEffect(() => {
    const p = new URLSearchParams({
      status,
      severity,
      kind: threat,
      channel,
      sort,
    });
    if (q) p.set("q", q);
    history.replaceState(null, "", `#/incidents?${p}`);
  }, [q, status, severity, threat, channel, sort]);
  return (
    <section className="posterIncidentRegister">
      <div className="posterFilterRow">
        <Search value={q} onChange={setQ} placeholder="Search IP or incident" />
        <select
          aria-label="Severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="all">Severity</option>
          {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Threat type"
          value={threat}
          onChange={(e) => setThreat(e.target.value)}
        >
          <option value="all">Threat type</option>
          {[...new Set(ctx.data.incidents.map((i) => i.kind))].map((k) => (
            <option key={k} value={k}>
              {kind(k)}
            </option>
          ))}
        </select>
        <select
          aria-label="Channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
          <option value="all">Channel</option>
          <option value="web">Web</option>
          <option value="ssh">SSH</option>
          <option value="port">Ports</option>
        </select>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Status</option>
          {[
            "open",
            "detected",
            "analyzing",
            "awaiting_approval",
            "blocked",
            "verified",
            "rejected",
            "monitoring",
            "needs_review",
            "closed",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="posterTableMeta">
        <span>
          {rows.length} / {ctx.data.incidents.length} incidents
        </span>
        <select
          aria-label="Sort incidents"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="severity">Severity first</option>
          <option value="time">Latest first</option>
        </select>
        <button
          className="textButton"
          onClick={() => {
            setQ("");
            setStatus("all");
            setSeverity("all");
            setThreat("all");
            setChannel("all");
          }}
        >
          Clear filters
        </button>
      </div>
      <Table
        key={`${q}-${status}-${severity}-${threat}-${channel}-${sort}`}
        rows={rows}
        onSelect={(i) => (location.hash = `/incident/${i.id}`)}
        columns={[
          {
            key: "id",
            label: "Incident",
            render: (i) => (
              <a href={`#/incident/${i.id}`}>{incidentId(i.id)}</a>
            ),
          },
          { key: "kind", label: "Threat", render: (i) => kind(i.kind) },
          ipColumn,
          {
            key: "severity",
            label: "Severity",
            render: (i) => <Badge value={i.severity} />,
          },
          {
            key: "status",
            label: "Status",
            render: (i) => <Badge value={i.status} />,
          },
          {
            key: "updated_at",
            label: "Last seen",
            render: (i) => time(i.updated_at || i.created_at),
          },
          {
            key: "open",
            label: "",
            render: (i) => (
              <a
                aria-label={`เปิด ${incidentId(i.id)}`}
                href={`#/incident/${i.id}`}
              >
                <Icon name="arrow" />
              </a>
            ),
          },
        ]}
      />
    </section>
  );
}
export function Incident({ ctx, id }) {
  const state = useReport(id, ctx.version),
    r = state.report,
    [tab, setTab] = useState("evidence");
  if (!r) return <ReportState state={state} ctx={ctx} />;
  const p = r.proposal,
    rule = p && ctx.data.rules.find((x) => x.proposal_id === p.id),
    proof = rule && proofFor(rule, r.traffic || ctx.data.traffic);
  return (
    <div className="posterCase">
      <div className="posterCaseStrip">
        <Badge value={r.severity} />
        <Badge value={r.status} />
        <span className="mono">{r.source_ip}</span>
        <small>{date(r.created_at)}</small>
        <ExportButton report={r} />
      </div>
      <div className="posterLineTabs">
        <button
          aria-pressed={tab === "evidence"}
          onClick={() => setTab("evidence")}
        >
          Evidence
        </button>
        <button aria-pressed={tab === "audit"} onClick={() => setTab("audit")}>
          Audit trail
        </button>
      </div>
      <div className="posterCaseColumns">
        <section>
          {tab === "audit" ? (
            <AuditTrail rows={r.audit?.length ? r.audit : r.timeline} />
          ) : (
            <>
              <h2 className="posterSectionTitle">
                <Icon name="network" /> TRAFFIC EVIDENCE
              </h2>
              <Summary report={r} />
              <EventChart events={r.events} />
              <StoredEvents events={r.events} kind={r.kind} />
            </>
          )}
        </section>
        <aside>
          <Panel title="Response status">
            <Badge value={p?.status || r.status} />
            {p ? (
              <>
                <div className="posterResponseCard">
                  <Icon name="shield" />
                  <div>
                    <strong>{action(p.action)}</strong>
                    <small>
                      {duration(p.duration_seconds)} · Protected web app only
                    </small>
                  </div>
                </div>
                <p>{p.reason}</p>
                {p.status === "pending" ? (
                  <a className="button primary" href={`#/approvals/${p.id}`}>
                    Review proposal <Icon name="arrow" />
                  </a>
                ) : rule ? (
                  <a className="button" href={`#/rules/${rule.id}`}>
                    View protection <Icon name="arrow" />
                  </a>
                ) : (
                  <p>ข้อเสนอนี้ยังไม่มีกฎที่ทำงาน</p>
                )}
              </>
            ) : (
              <p>ยังไม่มีข้อเสนอสำหรับเคสนี้</p>
            )}
            <p className="hint">
              {proof
                ? `HTTP 403 verified · ${date(proof.created_at)}`
                : rule && activeRule(rule, ctx.now)
                  ? "บล็อกแล้ว · รอคำขอใหม่จาก IP เดิม"
                  : "ยังไม่มีหลักฐานยืนยัน HTTP 403"}
            </p>
          </Panel>
          <h3 className="posterSubhead">Audit timeline</h3>
          <AuditTrail rows={r.timeline} />
          <a className="button" href={`#/trace/${id}`}>
            Open investigation <Icon name="arrow" />
          </a>
          <a className="textButton" href={`#/reports/${id}`}>
            View report
          </a>
          {!analysisOf(r) && r.status === "detected" && (
            <button
              className="button primary"
              disabled={ctx.busy || !!ctx.error}
              onClick={() => ctx.act(`/api/incidents/${id}/analyze`)}
            >
              Run investigation
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
export function Trace({ ctx, id }) {
  const current = id || ctx.data.incidents[0]?.id,
    state = useReport(current, ctx.version),
    r = state.report,
    [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false),
    timer = useRef(null);
  const trace = r?.trace || [];
  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [current]);
  useEffect(() => {
    if (playing && trace.length)
      timer.current = setInterval(
        () =>
          setStep((s) => {
            if (s >= trace.length - 1) {
              setPlaying(false);
              return s;
            }
            return s + 1;
          }),
        1100,
      );
    return () => clearInterval(timer.current);
  }, [playing, trace.length]);
  if (!current)
    return (
      <Empty>
        เลือกเหตุการณ์จาก <a href="#/incidents">Incidents</a>{" "}
        เพื่อดูการวิเคราะห์
      </Empty>
    );
  if (!r) return <ReportState state={state} ctx={ctx} />;
  const rule = isRuleOnly(r.kind),
    a = analysisOf(r),
    threshold = thresholdEvent(r.events || [], r.kind);
  const agentStages = rule ? [] : deriveFlow(r).states.slice(0, 4);
  const activeStage = agentStages.indexOf("active");
  const stages = rule
    ? [
        ["Requests observed", !!r.events?.length],
        ["Threshold exceeded", !!threshold],
        ["Proposal created", !!r.proposal],
        ["Awaiting approval", r.proposal?.status === "pending"],
      ]
    : [
        ["Observed", true],
        ["Investigation", agentStages[1] === "done"],
        ["Threat analysis", agentStages[2] === "done"],
        ["Response planning", agentStages[3] === "done"],
      ];
  return (
    <section className="posterInvestigation">
      <div className="posterCaseStrip">
        <Badge value={r.kind} />
        <span>
          {rule ? "Specialized rule" : r.analysis_mode || "Awaiting analysis"}
        </span>
        <select
          aria-label="เลือกเหตุการณ์วิเคราะห์"
          value={current}
          onChange={(e) => (location.hash = `/trace/${e.target.value}`)}
        >
          {ctx.data.incidents.map((i) => (
            <option key={i.id} value={i.id}>
              {incidentId(i.id)} · {kind(i.kind)}
            </option>
          ))}
        </select>
        <a href={`#/incident/${current}`}>Open evidence ↗</a>
      </div>
      <h2 className="posterTraceStatement">
        {rule
          ? ruleCriterion(r.kind) || "ตรวจด้วยกฎเฉพาะทาง"
          : a?.explanation_th || "รอผลวิเคราะห์จากเซิร์ฟเวอร์"}
      </h2>
      <div className="posterRuleTrace">
        {stages.map(([label, done], i) => (
          <div
            key={label}
            data-done={done}
            data-running={activeStage === i || undefined}
            data-flowing={activeStage === i + 1 || undefined}
            aria-current={activeStage === i ? "step" : undefined}
          >
            <span>
              {done ? <Icon name="check" /> : String(i + 1).padStart(2, "0")}
            </span>
            <strong>{label}</strong>
            <small>
              {activeStage === i
                ? "กำลังวิเคราะห์"
                : done
                  ? "Recorded"
                  : "ยังไม่มีหลักฐานขั้นนี้"}
            </small>
          </div>
        ))}
      </div>
      <div className="posterCaseColumns">
        <section>
          <EventChart events={r.events} />
          {!rule && (
            <>
              <div className="posterSubhead">
                Agent trace{" "}
                <button
                  className="button compact"
                  disabled={!trace.length}
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playing ? "Pause replay" : "Replay history"}
                </button>
              </div>
              {trace.length ? (
                <>
                  <div className="traceSteps">
                    {trace.map((t, i) => (
                      <button
                        key={t.id ?? i}
                        aria-pressed={step === i}
                        onClick={() => {
                          setStep(i);
                          setPlaying(false);
                        }}
                      >
                        {i + 1} · {t.agent || t.tool || t.operation}
                      </button>
                    ))}
                  </div>
                  <div className="traceEvidence">
                    <strong>{trace[step]?.agent || trace[step]?.tool}</strong>
                    <p>
                      {trace[step]?.operation} · {trace[step]?.status} ·{" "}
                      {trace[step]?.duration_ms ?? "—"} ms
                    </p>
                    <pre>{JSON.stringify(trace[step], null, 2)}</pre>
                  </div>
                </>
              ) : (
                <Empty>ยังไม่มี trace ที่บันทึก</Empty>
              )}
            </>
          )}
          <StoredEvents events={r.events} kind={r.kind} />
        </section>
        <Panel title="Detection source">
          <h3 className="mono">{r.source_ip}</h3>
          <Badge value={r.severity} />
          <Summary report={r} />
          <a className="button" href={`#/incident/${current}`}>
            Open incident <Icon name="arrow" />
          </a>
          {r.proposal?.status === "pending" && (
            <a className="button primary" href={`#/approvals/${r.proposal.id}`}>
              Review proposal
            </a>
          )}
          {r.status === "detected" && !a && (
            <button
              className="button primary"
              disabled={ctx.busy || !!ctx.error}
              onClick={() => ctx.act(`/api/incidents/${current}/analyze`)}
            >
              Run investigation
            </button>
          )}
        </Panel>
      </div>
    </section>
  );
}
export function Approvals({ ctx, id }) {
  const route = ctx.data.proposals.find((p) => p.id === id),
    [view, setView] = useState(
      route?.status === "pending" ? "pending" : route ? "history" : "pending",
    ),
    [q, setQ] = useState("");
  useEffect(() => {
    if (route) setView(route.status === "pending" ? "pending" : "history");
  }, [id, route?.status]);
  const rows = ctx.data.proposals
      .filter(
        (p) =>
          (view === "pending"
            ? p.status === "pending"
            : p.status !== "pending") && `${p.id} ${targetIp(p)}`.includes(q),
      )
      .sort((a, b) => b.id - a.id),
    selected = rows.find((p) => p.id === id) || rows[0];
  return (
    <div className="posterApprovalLayout">
      <aside>
        <div className="posterLineTabs">
          <button
            aria-pressed={view === "pending"}
            onClick={() => setView("pending")}
          >
            Pending{" "}
            <b className="countPill">
              {ctx.data.proposals.filter((p) => p.status === "pending").length}
            </b>
          </button>
          <button
            aria-pressed={view === "history"}
            onClick={() => setView("history")}
          >
            History
          </button>
        </div>
        <Search value={q} onChange={setQ} placeholder="Search IP or proposal" />
        <div className="posterProposalQueue">
          {rows.length ? (
            rows.map((p) => {
              const i = ctx.data.incidents.find((i) => i.id === p.incident_id);
              return (
                <a
                  key={p.id}
                  className={`posterProposal ${selected?.id === p.id ? "selected" : ""}`}
                  href={`#/approvals/${p.id}`}
                >
                  <strong>
                    {incidentId(p.incident_id)} <span>{kind(i?.kind)}</span>
                  </strong>
                  <Badge value={i?.severity} />
                  <span className="mono">{targetIp(p)}</span>
                  <small>
                    PROPOSAL-{p.id} · {p.status}
                  </small>
                </a>
              );
            })
          ) : (
            <Empty>
              {view === "pending"
                ? "ไม่มีข้อเสนอรออนุมัติ"
                : "ไม่พบประวัติที่ตรงคำค้น"}
            </Empty>
          )}
        </div>
      </aside>
      {selected ? (
        <ProposalReview key={selected.id} ctx={ctx} proposal={selected} />
      ) : (
        <Panel title="Response review">
          <Empty>เลือกข้อเสนอเพื่ออ่านหลักฐาน</Empty>
        </Panel>
      )}
    </div>
  );
}
function ProposalReview({ ctx, proposal: p }) {
  const state = useReport(p.incident_id, ctx.version),
    r = state.report,
    [confirm, setConfirm] = useState(null),
    can =
      p.status === "pending" && !!r && !state.error && !ctx.error && !ctx.busy;
  useEffect(() => {
    if (p.status !== "pending") setConfirm(null);
  }, [p.status]);
  return (
    <Panel
      title={`${incidentId(p.incident_id)} · ${kind(r?.kind)}`}
      className="posterReview"
      actions={
        <>
          <Badge value={r?.severity} />
          <Badge value={p.status} />
        </>
      }
    >
      <div className="posterTarget">
        <Icon name="incident" />
        <div>
          <strong className="mono">{targetIp(p)}</strong>
          <p>
            {isRuleOnly(r?.kind)
              ? "Detected by specialized web rule"
              : p.source === "rule_fallback"
                ? "Rule fallback proposal"
                : "Model proposal"}
          </p>
        </div>
      </div>
      <div className="posterEvidenceHead">
        <h3>Evidence</h3>
        <a href={`#/incident/${p.incident_id}`}>Open evidence ↗</a>
      </div>
      {r ? (
        <Summary report={r} compact />
      ) : (
        <ReportState state={state} ctx={ctx} />
      )}
      <div className="posterResponseCard">
        <Icon name="shield" />
        <div>
          <strong>{action(p.action)}</strong>
          <small>{duration(p.duration_seconds)} · Protected web app only</small>
        </div>
      </div>
      <p className="hint">
        {p.status === "pending"
          ? "⚠ Not blocked yet"
          : `${p.reviewer || "—"} · ${isAutoApproved(p) ? "Automatic rule decision" : "Recorded decision"}`}
      </p>
      {r && ["ssh", "port"].includes(channelOfKind(r.kind)) && (
        <p className="notice">
          ตรวจจับช่องทาง {channelOfKind(r.kind)} ได้
          การบล็อกนี้มีผลเฉพาะเว็บที่ป้องกัน
        </p>
      )}
      <details className="posterPolicy">
        <summary>Scope and policy</summary>
        <p>{p.reason}</p>
        {p.policy_notes?.map((n, i) => (
          <p key={i}>{n}</p>
        ))}
        <p>Reviewer: {ctx.user} · ไม่เปลี่ยน firewall ของเครื่อง</p>
      </details>
      {p.status === "pending" ? (
        <div className="posterReviewButtons">
          <button
            className="button primary"
            disabled={!can}
            onClick={() => setConfirm("approve")}
          >
            Review and approve <Icon name="arrow" />
          </button>
          <button
            className="button"
            disabled={!can}
            onClick={() => setConfirm("reject")}
          >
            Reject
          </button>
        </div>
      ) : (
        <a className="button" href={`#/incident/${p.incident_id}`}>
          ดูผลการตอบสนอง
        </a>
      )}
      {confirm && (
        <Confirmation
          title={
            confirm === "approve"
              ? "ยืนยันบล็อก IP นี้?"
              : "ยืนยันปฏิเสธข้อเสนอ?"
          }
          confirmLabel={
            confirm === "approve" ? "ยืนยันบล็อก IP" : "ยืนยันปฏิเสธ"
          }
          busy={ctx.busy}
          disabled={p.status !== "pending" || !!ctx.error}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const result = await ctx.act(`/api/proposals/${p.id}/${confirm}`, {
              body: { reviewer: ctx.user },
            });
            if (result) setConfirm(null);
          }}
        >
          <h3 className="mono">{targetIp(p)}</h3>
          <p>
            {confirm === "approve"
              ? `${duration(p.duration_seconds)} · Protected web app only`
              : "ไม่สร้างกฎจากข้อเสนอนี้"}
          </p>
          <p>Reviewer: {ctx.user}</p>
        </Confirmation>
      )}
    </Panel>
  );
}
export function Rules({ ctx, id }) {
  const [view, setView] = useState("active"),
    [q, setQ] = useState(""),
    [confirm, setConfirm] = useState(null);
  useEffect(() => {
    const r = ctx.data.rules.find((r) => r.id === id);
    if (r) setView(activeRule(r, ctx.now) ? "active" : "history");
  }, [id]);
  const rows = ctx.data.rules.filter(
      (r) =>
        (view === "active"
          ? activeRule(r, ctx.now)
          : !activeRule(r, ctx.now)) && `${r.id} ${r.source_ip}`.includes(q),
    ),
    r = rows.find((r) => r.id === id) || rows[0],
    proposal = r && ctx.data.proposals.find((p) => p.id === r.proposal_id),
    proof = r && proofFor(r, ctx.data.traffic),
    life = r && ruleLifetime(r, ctx.now);
  return (
    <section>
      <div className="posterLineTabs">
        <button
          aria-pressed={view === "active"}
          onClick={() => setView("active")}
        >
          Active
        </button>
        <button
          aria-pressed={view === "history"}
          onClick={() => setView("history")}
        >
          History
        </button>
      </div>
      <div className="posterProtectionLayout">
        <div>
          <Search value={q} onChange={setQ} placeholder="Search IP or rule" />
          <Table
            rows={rows}
            selected={r?.id}
            onSelect={(row) => (location.hash = `/rules/${row.id}`)}
            columns={[
              ipColumn,
              {
                key: "incident",
                label: "Incident",
                render: (r) => {
                  const p = ctx.data.proposals.find(
                    (p) => p.id === r.proposal_id,
                  );
                  return p ? (
                    <a href={`#/incident/${p.incident_id}`}>
                      {incidentId(p.incident_id)}
                    </a>
                  ) : (
                    "—"
                  );
                },
              },
              {
                key: "expires_at",
                label: "Time left",
                render: (r) => {
                  const l = ruleLifetime(r, ctx.now);
                  return l?.noExpiry
                    ? "จนกว่าจะปลด"
                    : l
                      ? `${Math.floor(l.seconds / 60)
                          .toString()
                          .padStart(
                            2,
                            "0",
                          )}:${(l.seconds % 60).toString().padStart(2, "0")}`
                      : "—";
                },
              },
              {
                key: "proof",
                label: "Verification",
                render: (r) => (
                  <Badge
                    color={proofFor(r, ctx.data.traffic) ? "good" : "warn"}
                  >
                    {proofFor(r, ctx.data.traffic)
                      ? "HTTP 403 verified"
                      : "รอคำขอใหม่"}
                  </Badge>
                ),
              },
            ]}
          />
          <h3 className="posterSubhead">Recent related incidents</h3>
          <div className="posterRelated">
            {ctx.data.incidents.slice(0, 2).map((i) => (
              <a href={`#/incident/${i.id}`} key={i.id}>
                <strong>{incidentId(i.id)}</strong>
                <Badge value={i.severity} />
                <span>{kind(i.kind)}</span>
                <span className="mono">{i.source_ip}</span>
              </a>
            ))}
          </div>
        </div>
        {r ? (
          <Panel
            title={`RULE-${r.id}${proposal ? ` · ${incidentId(proposal.incident_id)}` : ""}`}
            className="posterRuleDetail"
          >
            <h3 className="mono">{r.source_ip}</h3>
            <p>
              <Icon name="shield" /> Protected web app only
            </p>
            <p>
              {proposal?.reviewer || "ผู้ดำเนินการไม่ได้ระบุ"} ·{" "}
              {isAutoApproved(proposal)
                ? "Automatic rule"
                : "Recorded approval"}
            </p>
            <dl className="facts">
              <div>
                <dt>เริ่มใช้</dt>
                <dd>{date(r.created_at)}</dd>
              </div>
              <div>
                <dt>หมดอายุ</dt>
                <dd>{expiresText(r)}</dd>
              </div>
            </dl>
            <p className={proof ? "verifiedProof" : "hint"}>
              {proof
                ? `✓ HTTP 403 verified · ${date(proof.created_at)}`
                : "ยังไม่มีหลักฐาน HTTP 403 จาก IP เดิม"}
            </p>
            {activeRule(r, ctx.now) && (
              <>
                <small>
                  {life?.noExpiry
                    ? "จนกว่าแอดมินปลดบล็อก"
                    : `เหลือ ${life?.seconds ?? 0} วินาที`}
                </small>
                {!life?.noExpiry && (
                  <progress max="100" value={life?.percent || 0} />
                )}
                <button
                  className="button"
                  disabled={ctx.busy || !!ctx.error}
                  onClick={() => setConfirm(r)}
                >
                  Review unblock <Icon name="arrow" />
                </button>
              </>
            )}
            {proposal && (
              <a
                className="textButton"
                href={`#/incident/${proposal.incident_id}`}
              >
                Open source incident ↗
              </a>
            )}
          </Panel>
        ) : (
          <Panel title="Rule details">
            <Empty>ไม่มีกฎในรายการนี้</Empty>
          </Panel>
        )}
      </div>
      {confirm && (
        <Confirmation
          title="ยืนยันปลดบล็อก IP นี้?"
          confirmLabel="ยืนยันปลดบล็อก"
          danger
          busy={ctx.busy}
          disabled={!!ctx.error || !activeRule(confirm, ctx.now)}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            if (await ctx.act(`/api/rules/${confirm.id}`, { method: "DELETE" }))
              setConfirm(null);
          }}
        >
          <h3 className="mono">{confirm.source_ip}</h3>
          <p>
            ปิดกฎ RULE-{confirm.id} สำหรับเว็บที่ป้องกัน หากมีกฎอื่นของ IP
            เดียวกัน คำขออาจยังถูกบล็อก
          </p>
        </Confirmation>
      )}
    </section>
  );
}
export function Reports({ ctx, id }) {
  const [q, setQ] = useState(""),
    rows = ctx.data.incidents.filter((i) =>
      `${incidentId(i.id)} ${i.source_ip} ${kind(i.kind)}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    ),
    current = (rows.find((i) => i.id === id) || rows[0])?.id,
    state = useReport(current, ctx.version),
    r = state.report;
  const rule =
      r?.proposal &&
      ctx.data.rules.find((rule) => rule.proposal_id === r.proposal.id),
    proof = rule && proofFor(rule, r?.traffic || []);
  return (
    <div className="posterReportsLayout">
      <aside className="noPrint">
        <Panel title="Selected case">
          {r ? (
            <>
              <h3>
                {incidentId(r.id)} · {kind(r.kind)}
              </h3>
              <Badge value={r.severity} />
              <p className="mono">{r.source_ip}</p>
              <p>
                {isRuleOnly(r.kind)
                  ? "Detected by specialized rule"
                  : r.analysis_mode}
              </p>
              <Badge value={r.status} />
            </>
          ) : (
            <Empty>เลือกเคสเพื่อดูรายงาน</Empty>
          )}
        </Panel>
        <Panel title="Report">
          <Search value={q} onChange={setQ} label="ค้นหารายงาน" />
          {r && (
            <>
              <button className="button primary" onClick={() => window.print()}>
                <Icon name="report" /> Print report
              </button>
              <ExportButton report={r} />
              <a href={`#/incident/${r.id}`} className="textButton">
                Open incident ↗
              </a>
            </>
          )}
        </Panel>
        <Panel title="Related cases">
          <div className="reportCaseList">
            {rows.map((i) => (
              <a
                aria-current={i.id === current ? "true" : undefined}
                href={`#/reports/${i.id}`}
                key={i.id}
              >
                <strong>
                  {incidentId(i.id)} · {kind(i.kind)}
                </strong>
                <span className="mono">{i.source_ip}</span>
                <Badge value={i.status} />
              </a>
            ))}
            {!rows.length && <Empty>ไม่พบรายงาน</Empty>}
          </div>
        </Panel>
      </aside>
      {r ? (
        <article className="posterReportPaper">
          <header>
            <b>SENTINEL / AI</b>
            <small>INCIDENT EVIDENCE</small>
          </header>
          <h2>Incident report</h2>
          <div className="reportPaperIdentity">
            <strong>
              {incidentId(r.id)} · {kind(r.kind)}
            </strong>
            <Badge value={r.severity} />
          </div>
          <h3>Incident summary</h3>
          <dl>
            <dt>Incident ID</dt>
            <dd>{incidentId(r.id)}</dd>
            <dt>Source IP</dt>
            <dd>{r.source_ip}</dd>
            <dt>Channel</dt>
            <dd>{channelOfKind(r.kind) || "—"}</dd>
            <dt>Detected</dt>
            <dd>
              {date(r.created_at)} · เวลาของเบราว์เซอร์ (
              {Intl.DateTimeFormat().resolvedOptions().timeZone})
            </dd>
            <dt>Analysis source</dt>
            <dd>
              {isRuleOnly(r.kind)
                ? "Specialized rule"
                : r.analysis_mode || "Pending"}
            </dd>
            <dt>Status</dt>
            <dd>{r.status}</dd>
          </dl>
          <h3>Evidence</h3>
          <Summary report={r} />
          <EventChart events={r.events} />
          <StoredEvents events={r.events} kind={r.kind} />
          <h3>Decision and verification</h3>
          <dl>
            <dt>Proposed action</dt>
            <dd>{action(r.proposal?.action)}</dd>
            <dt>Reviewer</dt>
            <dd>{r.proposal?.reviewer || "ยังไม่มีผู้ตัดสินใจ"}</dd>
            <dt>Scope</dt>
            <dd>Protected web app only</dd>
            <dt>Verification</dt>
            <dd>
              {proof
                ? `HTTP 403 · ${date(proof.created_at)}`
                : "ยังไม่มีหลักฐาน HTTP 403"}
            </dd>
          </dl>
          <h3>Audit</h3>
          <AuditTrail rows={r.timeline} />
        </article>
      ) : current ? (
        <ReportState state={state} ctx={ctx} />
      ) : (
        <Empty>ยังไม่มีรายงาน</Empty>
      )}
    </div>
  );
}
