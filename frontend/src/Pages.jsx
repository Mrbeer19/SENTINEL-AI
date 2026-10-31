import React, { useEffect, useMemo, useState } from "react";
import { useReport } from "./api.js";
import {
  action,
  activeRule,
  analysisOf,
  attentionQueue,
  date,
  duration,
  incidentId,
  isOpenIncident,
  kind,
  kinds,
  number,
  proofFor,
  sourcesOf,
  sortIncidents,
  ruleLifetime,
  statusLabels,
  targetIp,
  time,
} from "./lib.js";
import {
  Badge,
  Confirmation,
  Empty,
  Icon,
  Json,
  Panel,
  Search,
  Table,
  Toggle,
  formatEventPaths,
  isRuleOnly,
  typeKey,
} from "./ui.jsx";
import Topology from "./Topology.jsx";
import TrafficChart from "./TrafficChart.jsx";
import { resolveGeo } from "./geo.js";
import Analysis from "./Analysis.jsx";
import AgentLab from "./AgentLab.jsx";
import { thresholdEvent, ruleCriterion } from "./detectionRules.js";
import { MotionNumber } from "./motion.jsx";
import { MascotEmpty } from "./Mascot.jsx";

export const titles = {
  overview: ["Security overview", "เฝ้าระวังการเชื่อมต่อและเหตุการณ์ของระบบ"],
  incidents: ["Incidents", "ตรวจคัดกรองเหตุการณ์จากหลักฐานที่ระบบบันทึก"],
  incident: [
    "Incident detail",
    "หลักฐาน ผลวิเคราะห์ และการตรวจผลในเหตุการณ์เดียว",
  ],
  trace: ["AI investigation", "สำรวจเส้นทางการวิเคราะห์และเครื่องมือที่ใช้"],
  approvals: ["Approvals", "ตรวจคำแนะนำ · ผู้ดูแลเป็นผู้ตัดสินใจ"],
  rules: ["Protection rules", "จัดการกฎระดับแอปและตรวจผลของคำขอใหม่"],
  reports: [
    "Security reports",
    "เปิดรายงาน ส่งออกหลักฐาน และติดตามการตัดสินใจ",
  ],
};
function ReportState({ loading, error, report }) {
  return loading ? (
    <Empty>กำลังโหลดหลักฐาน…</Empty>
  ) : (
    <div className="notice bad">
      {error || "ไม่พบเหตุการณ์นี้"} <a href="#/incidents">กลับไปรายการ</a>
    </div>
  );
}
const ipsColumn = {
  key: "source_ip",
  label: "SOURCE IP",
  render: (r) => <span className="mono">{r.source_ip}</span>,
};
const statusColumn = {
  key: "status",
  label: "STATUS",
  render: (r) => <Badge value={r.status} />,
};

export function Overview({ ctx }) {
  const { data } = ctx,
    [selected, setSelected] = useState(null),
    [feed, setFeed] = useState("requests"),
    [activityView, setActivityView] = useState("signals");
  const sources = useMemo(() => sourcesOf(data), [data]),
    rules = data.rules.filter((r) => activeRule(r, ctx.now)),
    pending = data.proposals.filter((p) => p.status === "pending"),
    attention = attentionQueue(data.incidents, data.proposals);
  const src = selected && sources.find((s) => s.ip === selected);
  useEffect(() => {
    if (selected && !sources.some((s) => s.ip === selected)) setSelected(null);
  }, [selected, sources]);
  const feedRows =
    feed === "requests"
      ? data.traffic.map((t) => ({
          ...t,
          at: t.created_at,
          result: t.decision,
        }))
      : data.events
          .filter((e) => ["HTTP_AUTH", "SSH_AUTH"].includes(e.event_type))
          .map((e) => ({ ...e, at: e.timestamp, result: e.outcome }));
  return (
    <div className="overviewPage">
      <div className="metricStrip">
        {[
          ["OBSERVED SOURCES", sources.length, "IP ต้นทางที่บันทึก"],
          [
            "OPEN INCIDENTS",
            data.incidents.filter(isOpenIncident).length,
            "เหตุการณ์ที่ยังเปิดอยู่",
          ],
          ["AWAITING DECISION", pending.length, "ข้อเสนอที่ต้องตรวจ"],
          ["ACTIVE PROTECTION", rules.length, "กฎบล็อกที่ทำงาน"],
        ].map(([label, n, th], i) => (
          <div key={label}>
            <div className="metricTop">
              <span className="metricIcon">
                <Icon
                  name={["network", "incident", "check", "shield"][i]}
                  size={18}
                />
              </span>
              <small>{label}</small>
            </div>
            <MotionNumber value={n} className={i === 2 && n ? "actionableKpi" : undefined} />
            <p>{th}</p>
          </div>
        ))}
      </div>
      <div className="observatoryGrid">
        <Panel title="Network map" code="02" className="topologyPanel">
          <Topology
            data={data}
            activeRules={rules}
            connected={ctx.connected && !ctx.error}
            selectedIp={selected}
            onSelectIp={setSelected}
          />
          <div className="mapLegend">
            <span>
              <i className="dot" />
              บันทึกแล้ว
            </span>
            <span>
              <i className="dot amber" />
              ต้องตรวจ
            </span>
            <span>
              <i className="dot red" />
              บล็อกอยู่
            </span>
          </div>
        </Panel>
        <aside className="signalColumn">
          {src ? (
            <Panel
              title="Source details"
              code="03"
              actions={
                <button
                  aria-label="ปิดรายละเอียด IP"
                  onClick={() => setSelected(null)}
                >
                  <Icon name="close" size={15} />
                </button>
              }
            >
              <h3 className="sourceTitle mono">{src.ip}</h3>
              <Geo ip={src.ip} />
              <dl className="facts">
                <div>
                  <dt>พบล่าสุด</dt>
                  <dd>{time(src.at)}</dd>
                </div>
                <div>
                  <dt>เหตุการณ์</dt>
                  <dd>
                    {
                      data.incidents.filter((i) => i.source_ip === src.ip)
                        .length
                    }
                  </dd>
                </div>
              </dl>
              {data.incidents
                .filter((i) => i.source_ip === src.ip)
                .map((i) => (
                  <a
                    key={i.id}
                    className="signalCard"
                    href={`#/incident/${i.id}`}
                  >
                    <small>{incidentId(i.id)}</small>
                    <b>{kind(i.kind)}</b>
                    <Badge value={i.status} />
                  </a>
                ))}
            </Panel>
          ) : (
            <Panel title="Requires attention" code="03">
              {attention.length ? (
                attention.slice(0, 3).map((item) => {
                  const i = item.incident,
                    approval = item.type === "approval";
                  return (
                    <a
                      className={`signalCard attention ${approval ? "" : "needsAnalysis"}`}
                      key={item.key}
                      href={approval ? `#/approvals/${item.proposal.id}` : `#/incident/${i.id}`}
                    >
                      <small>
                        <i className={`dot ${approval ? "amber" : "red"}`} />
                        {approval ? "รออนุมัติ" : "รอวิเคราะห์"}
                        {i?.severity && <Badge value={i.severity} />}
                      </small>
                      <b>{kind(i?.kind)}</b>
                      <span className="mono">{approval ? targetIp(item.proposal) : i.source_ip}</span>
                      <footer>
                        {approval ? `บล็อก ${duration(item.proposal.duration_seconds)}` : "เปิดหลักฐานและเริ่มวิเคราะห์"}
                        <Icon name="arrow" size={15} />
                      </footer>
                    </a>
                  );
                })
              ) : (
                <Empty>ไม่มีงานค้าง · ทุกอย่างอยู่ในการควบคุม</Empty>
              )}
            </Panel>
          )}
          <Panel
            title="Activity"
            code="04"
            actions={
              <Toggle
                label="มุมมองกิจกรรม"
                value={activityView}
                onChange={setActivityView}
                items={[
                  ["signals", "ล่าสุด"],
                  ["profile", "ประเภท"],
                ]}
              />
            }
          >
            {activityView === "profile" ? (
              <>
                <Radar incidents={data.incidents} />
                <a className="textButton" href="#/incidents">
                  เปิดรายการเหตุการณ์ <Icon name="arrow" size={14} />
                </a>
              </>
            ) : data.incidents.length ? (
              data.incidents.slice(0, 4).map((i) => (
                <a
                  className="signalLine"
                  data-type={typeKey(i.kind)}
                  key={i.id}
                  href={`#/incident/${i.id}`}
                >
                  <Badge value={i.severity} />
                  <span>
                    <span className="typeName">{kind(i.kind)}</span>
                    <small className="mono">{i.source_ip}</small>
                  </span>
                  <Icon name="arrow" size={13} />
                </a>
              ))
            ) : (
              <Empty>รอเหตุการณ์ใหม่</Empty>
            )}
          </Panel>
          <a className="operatorHint" href="#/trace">
            <Icon name="shield" size={40} />
            <div>
              <b>RESPONSE CONTROL</b>
              <p>AI ตรวจหลักฐาน · ผู้ดูแลตัดสินใจ</p>
            </div>
            <Icon name="arrow" size={15} />
          </a>
        </aside>
      </div>
      <div className="telemetryRow">
        <Panel
          className="trafficPanel"
          title="Application traffic"
          code="05"
          actions={<span className="micro">LAST 15 MINUTES</span>}
        >
          <TrafficChart traffic={data.traffic} now={ctx.now} incidents={data.incidents} />
        </Panel>
        <Panel
          className="recordsPanel"
          title="Live records"
          code="06"
          actions={
            <Toggle
              label="ประเภทบันทึก"
              items={[
                ["requests", "คำขอ"],
                ["logins", "ล็อกอิน"],
              ]}
              value={feed}
              onChange={setFeed}
            />
          }
        >
          <Table
            key={feed}
            paginate={false}
            maxVisibleRows={10}
            liveRows
            rows={feedRows
              .slice()
              .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))}
            columns={[
              { key: "at", label: "TIME", render: (r) => time(r.at) },
              ipsColumn,
              {
                key: "result",
                label: "RESULT",
                render: (r) => <Badge value={r.result} />,
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
function Radar({ incidents }) {
  const keys = Object.keys(kinds),
    counts = keys.map((k) => incidents.filter((i) => i.kind === k).length),
    max = Math.max(1, ...counts),
    p = (i, r) => [
      110 + Math.cos(-Math.PI / 2 + (i * Math.PI * 2) / 5) * r,
      110 + Math.sin(-Math.PI / 2 + (i * Math.PI * 2) / 5) * r,
    ],
    names = ["HTTP", "SSH", "PORTS", "TRAFFIC", "LOGIN"];
  return (
    <figure className="radar">
      <svg
        viewBox="0 0 220 225"
        role="img"
        aria-label={names.map((n, i) => `${n} ${counts[i]}`).join(", ")}
      >
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <polygon
            key={r}
            className="radarGrid"
            points={keys.map((_, i) => p(i, r * 70).join(",")).join(" ")}
          />
        ))}
        {keys.map((k, i) => {
          const [x, y] = p(i, 70),
            [tx, ty] = p(i, 96);
          return (
            <g key={k}>
              <path d={`M110 110L${x} ${y}`} className="radarGrid" />
              <text x={tx} y={ty} textAnchor="middle">
                {names[i]}
                <tspan dy="13" x={tx}>
                  {counts[i]}
                </tspan>
              </text>
            </g>
          );
        })}
        <polygon
          className="radarShape"
          points={counts
            .map((n, i) => p(i, (n / max) * 70).join(","))
            .join(" ")}
        />
        {counts.map((n, i) => {
          const [x, y] = p(i, (n / max) * 70);
          return <circle key={i} cx={x} cy={y} r="2.5" />;
        })}
      </svg>
      <figcaption>จำนวนเหตุการณ์ตามประเภท · จากบันทึกจริง</figcaption>
    </figure>
  );
}
function Geo({ ip }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let canceled = false;
    setState(null);
    resolveGeo(ip)
      .then((r) => {
        if (!canceled) setState(r);
      })
      .catch(() => {
        if (!canceled) setState({ note: "โหลดตำแหน่งไม่ได้" });
      });
    return () => {
      canceled = true;
    };
  }, [ip]);
  return (
    <div className="geo">
      {state ? (
        <>
          <b>{state.country || state.note}</b>
          {state.country && (
            <p>
              {[state.city, state.region].filter(Boolean).join(", ")}
              <small>ตำแหน่ง IP โดยประมาณ</small>
            </p>
          )}
        </>
      ) : (
        <p>กำลังค้นหาตำแหน่ง…</p>
      )}
    </div>
  );
}

export function Incidents({ ctx }) {
  const [q, setQ] = useState(ctx.searchQuery || ""),
    [filter, setFilter] = useState("all"),
    rows = sortIncidents(ctx.data.incidents.filter(
      (i) =>
        (filter === "all" ||
          (filter === "open" ? isOpenIncident(i) : i.status === filter)) &&
        `${incidentId(i.id)} ${i.source_ip} ${kind(i.kind)}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    ));
  useEffect(() => setQ(ctx.searchQuery || ""), [ctx.searchQuery]);
  return (
    <Panel
      title="Incident register"
      code="01"
      actions={
        <a className="button compact" href="#/trace">
          <Icon name="trace" size={15} />
          AI investigation
        </a>
      }
    >
      <div className="filterBar">
        <Search value={q} onChange={setQ} />
        <Toggle
          label="สถานะเหตุการณ์"
          value={filter}
          onChange={setFilter}
          items={[
            ["open", "ยังเปิดอยู่"],
            ["awaiting_approval", "รออนุมัติ"],
            ["verified", "ยืนยันผล"],
            ["all", "ทั้งหมด"],
          ]}
        />
      </div>
      <p className="tableMeta">
        {rows.length} จาก {ctx.data.incidents.length} เหตุการณ์ ·
        เลือกรายการเพื่อเปิดหลักฐาน
      </p>
      <Table
        rows={rows}
        typeRows
        emptyContent={!ctx.data.incidents.length ? <MascotEmpty title="ท้องฟ้าปลอดโปร่ง">ยังไม่พบภัยคุกคามในช่วงเวลานี้</MascotEmpty> : undefined}
        columns={[
          {
            key: "id",
            label: "INCIDENT",
            render: (i) => (
              <a href={`#/incident/${i.id}`}>{incidentId(i.id)}</a>
            ),
          },
          { key: "kind", label: "DETECTION", render: (i) => <span className="typeName">{kind(i.kind)}</span> },
          ipsColumn,
          {
            key: "severity",
            label: "SEVERITY",
            render: (i) => <Badge value={i.severity} />,
          },
          statusColumn,
          {
            key: "created_at",
            label: "DETECTED",
            render: (i) => time(i.created_at),
          },
        ]}
        onSelect={(i) => (location.hash = `/incident/${i.id}`)}
      />
    </Panel>
  );
}

export function Trace({ ctx, id }) {
  const current =
    id ||
    ctx.data.incidents.find((i) => i.status === "analyzing")?.id ||
    ctx.data.incidents[0]?.id;
  const { report, error, loading } = useReport(current, ctx.version);
  return (
    <>
      <div className="workContext">
        <label>
          เหตุการณ์ที่ตรวจ{" "}
          <select
            aria-label="เลือกเหตุการณ์วิเคราะห์"
            value={current || ""}
            onChange={(e) => (location.hash = `/trace/${e.target.value}`)}
          >
            {ctx.data.incidents.map((i) => (
              <option key={i.id} value={i.id}>
                {incidentId(i.id)} · {kind(i.kind)} · {i.source_ip}
              </option>
            ))}
          </select>
        </label>
        {report && (
          <span className="micro">
            {isRuleOnly(report.kind)
              ? "ตรวจด้วยกฎเฉพาะทาง"
              : report.analysis_mode === "rule_fallback"
                ? "RULE FALLBACK / ไม่ใช่ AI"
                : ctx.data.health?.model || "รอโมเดล"}
          </span>
        )}
      </div>
      {!current ? (
        <Empty>ยังไม่มีเหตุการณ์ให้ตรวจเส้นทาง</Empty>
      ) : report ? (
        isRuleOnly(report.kind) ? (
          <Panel title="Specialized rule detection">
            <Analysis report={report} />
            <h3 className="subhead">หลักฐาน HTTP Request · ถึงเกณฑ์ตอนไหน</h3>
            <EventTable events={report.events || []} kind={report.kind} />
          </Panel>
        ) : (
          <AgentLab
            key={report.id}
            report={report}
            stale={!!ctx.error || !!error}
          />
        )
      ) : (
        <ReportState loading={loading} error={error} />
      )}
    </>
  );
}

export function Incident({ ctx, id }) {
  const { report: r, error, loading } = useReport(id, ctx.version);
  if (!r) return <ReportState loading={loading} error={error} />;
  const a = analysisOf(r),
    p = r.proposal,
    rule = p && ctx.data.rules.find((x) => x.proposal_id === p.id),
    proof = rule && proofFor(rule, r.traffic || []);
  return (
    <div className="dossier">
      <div className="dossierHeader">
        <div>
          <a className="micro" href="#/incidents">
            INCIDENTS /
          </a>
          <h2>
            {incidentId(id)}
            <span>{kind(r.kind)}</span>
          </h2>
          <p className="mono">
            {r.source_ip} <span>· {date(r.created_at)}</span>
          </p>
        </div>
        <span className="dossierBadges">
          {r.severity && <Badge value={r.severity} />}
          <Badge value={r.status} />
        </span>
        <div className="dossierActions">
          <a className="button" href={`#/trace/${id}`}>
            <Icon name="trace" />
            เปิด AI investigation
          </a>
          <a
            className="button"
            href={`/api/reports/${id}`}
            download={`sentinel-${incidentId(id)}.json`}
          >
            <Icon name="download" />
            JSON
          </a>
        </div>
      </div>
      <div className="dossierGrid">
        <Panel title="Analysis & evidence" code="01">
          {a ? (
            <Analysis report={r} />
          ) : (
            <>
              <Empty>
                {r.status === "analyzing"
                  ? "กำลังรอผลวิเคราะห์จากเซิร์ฟเวอร์"
                  : "ยังไม่มีผลวิเคราะห์"}
              </Empty>
              {r.status === "detected" && (
                <button
                  className="button primary"
                  disabled={ctx.busy || !!ctx.error}
                  onClick={() => ctx.act(`/api/incidents/${id}/analyze`)}
                >
                  เริ่มวิเคราะห์
                </button>
              )}
            </>
          )}
        </Panel>
        <Panel title="Response status" code="02">
          <dl className="facts">
            <div>
              <dt>จำนวนเหตุการณ์</dt>
              <dd>{r.event_count}</dd>
            </div>
            <div>
              <dt>ข้อเสนอ</dt>
              <dd>{p ? action(p.action) : "ไม่มีข้อเสนอบล็อก"}</dd>
            </div>
            {p && (
              <>
                <div>
                  <dt>ระยะเวลา</dt>
                  <dd>{duration(p.duration_seconds)}</dd>
                </div>
                <div>
                  <dt>ผู้ตัดสินใจ</dt>
                  <dd>{p.reviewer || "รอผู้ดูแล"}</dd>
                </div>
              </>
            )}
          </dl>
          {p && (
            <a
              className={`button ${p.status === "pending" ? "primary" : ""}`}
              href={`#/approvals/${p.id}`}
            >
              {p.status === "pending"
                ? "ตรวจข้อเสนอและตัดสินใจ"
                : "ดูการตัดสินใจ"}
              <Icon name="arrow" size={15} />
            </a>
          )}
          <div className={`proof ${proof ? "good" : ""}`}>
            <Icon name={proof ? "check" : "clock"} />
            <b>
              {proof
                ? "มีคำขอใหม่ถูกปฏิเสธแล้ว"
                : rule
                  ? "รอหลักฐานจากคำขอใหม่"
                  : "ยังไม่มีหลักฐานยืนยันการบล็อก"}
            </b>
            <small>
              {proof
                ? `${time(proof.created_at)} · HTTP 403`
                : "การอนุมัติอย่างเดียวไม่ถือว่ายืนยันผล"}
            </small>
          </div>
        </Panel>
      </div>
      <Panel title="Stored events" code="03">
        <EventTable events={r.events || []} kind={r.kind} />
      </Panel>
      <Panel title="Audit timeline" code="04">
        <Timeline rows={r.timeline || []} />
      </Panel>
    </div>
  );
}
export function EventTable({ events, kind }) {
  const web = events.some((e) => e.event_type === "HTTP_REQUEST"),
    other = events.some((e) => e.event_type !== "HTTP_REQUEST"),
    hasPort = events.some((e) => e.destination_port != null && e.destination_port !== "");
  const thresholdId = kind ? thresholdEvent(events, kind)?.id : null;
  return (
    <>
      {ruleCriterion(kind) && (
        <p className="eventCriterion">ถึงเกณฑ์ตอนไหน · {ruleCriterion(kind)}</p>
      )}
      <Table
        rows={events}
        flagged={thresholdId}
        columns={[
          { key: "timestamp", label: "TIME", render: (e) => time(e.timestamp) },
          { key: "event_type", label: "TYPE" },
          ipsColumn,
          {
            key: "outcome",
            label: "RESULT",
            render: (e) => <Badge value={e.outcome} />,
          },
          ...(hasPort ? [{ key: "destination_port", label: "PORT", mono: true }] : []),
          ...(other
            ? [
                { key: "username", label: "ACCOUNT" },
              ]
            : []),
          ...(web
            ? [
                {
                  key: "request_count",
                  label: "REQUESTS",
                  mono: true,
                  render: (e) =>
                    e.event_type === "HTTP_REQUEST"
                      ? (e.request_count ?? "—")
                      : "—",
                },
                {
                  key: "not_found",
                  label: "404",
                  mono: true,
                  render: (e) =>
                    e.event_type === "HTTP_REQUEST" ? (e.not_found ?? "—") : "—",
                },
                {
                  key: "paths",
                  label: "PATHS",
                  mono: true,
                  render: (e) => (
                    <span className="eventPaths">
                      {e.event_type === "HTTP_REQUEST"
                        ? formatEventPaths(e.paths)
                        : "—"}
                    </span>
                  ),
                },
              ]
            : []),
          ...(thresholdId != null
            ? [
                {
                  key: "threshold",
                  label: "CRITERIA",
                  render: (e) =>
                    e.id === thresholdId ? (
                      <span className="thresholdLabel">ถึงเกณฑ์ตรวจจับ</span>
                    ) : (
                      "—"
                    ),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
function Timeline({ rows }) {
  return rows.length ? (
    <ol className="timeline">
      {rows.map((t, i) => (
        <li key={t.id ?? i}>
          <time>{time(t.created_at)}</time>
          <b>{t.stage}</b>
          <p>{t.detail}</p>
        </li>
      ))}
    </ol>
  ) : (
    <Empty>ยังไม่มี timeline</Empty>
  );
}

export function Approvals({ ctx, id }) {
  const [filter, setFilter] = useState("pending"),
    [q, setQ] = useState("");
  const rows = ctx.data.proposals.filter(
    (p) =>
      (filter === "pending"
        ? p.status === "pending"
        : p.status !== "pending") && `${p.id} ${targetIp(p)}`.includes(q),
  );
  const routeP = ctx.data.proposals.find((p) => p.id === id);
  useEffect(() => {
    if (routeP) setFilter(routeP.status === "pending" ? "pending" : "history");
  }, [id, routeP?.status]);
  const p = rows.find((p) => p.id === id) || rows[0];
  return (
    <div className="decisionLayout">
      <Panel title="Decision queue" code="01">
        <Toggle
          label="คิวการตัดสินใจ"
          value={filter}
          onChange={setFilter}
          items={[
            ["pending", "รออนุมัติ"],
            ["history", "ตัดสินใจแล้ว"],
          ]}
        />
        <Search value={q} onChange={setQ} label="ค้นหาข้อเสนอ" />
        {rows.length ? (
          <div className="queue">
            {rows.map((p) => (
              <a
                key={p.id}
                aria-current={p.id === id}
                className={`queueCard ${p.id === id ? "selected" : ""}`}
                href={`#/approvals/${p.id}`}
              >
                <small>PROPOSAL / {p.id}</small>
                <b className="mono">{targetIp(p)}</b>
                <Badge value={p.status} />
                <span>{duration(p.duration_seconds)}</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="hint">{filter === "pending" ? "ไม่มีข้อเสนอรอตัดสินใจ" : "ไม่มีข้อเสนอในรายการนี้"}</p>
        )}
      </Panel>
      {p ? (
        <Decision key={p.id} ctx={ctx} p={p} />
      ) : (
        <div className="decisionClear">
          <MascotEmpty title="ไม่มีข้อเสนอรอตัดสินใจ" />
          <p>เมื่อมีข้อเสนอจากการวิเคราะห์ จะแสดงให้ผู้ดูแลตรวจหลักฐานที่นี่</p>
          <a className="button" href="#/incidents">
            ดูเหตุการณ์
          </a>
        </div>
      )}
    </div>
  );
}
function Decision({ ctx, p }) {
  const { report, error, loading } = useReport(p.incident_id, ctx.version),
    reviewer = ctx.user || "",
    [confirm, setConfirm] = useState(null),
    pending = p.status === "pending",
    can =
      pending && report && !error && !ctx.error && reviewer.trim().length >= 2;
  const decide = async () => {
    const result = await ctx.act(`/api/proposals/${p.id}/${confirm}`, {
      body: { reviewer: reviewer.trim() },
    });
    if (result) {
      setConfirm(null);
      location.hash = `/approvals/${p.id}`;
    }
  };
  return (
    <Panel
      className="reviewPanel"
      title={`Review / Proposal ${p.id}`}
      code="02"
      actions={<span key={p.status} className={p.status === "approved" ? "approvalConfirmed" : undefined}>{p.status === "approved" && <Icon name="check" />}<Badge value={p.status} /></span>}
    >
      <div className="targetStrip">
        <Icon name="shield" size={22} />
        <div>
          <small>TARGET SOURCE</small>
          <strong className="mono">{targetIp(p)}</strong>
        </div>
        <span>{duration(p.duration_seconds)}</span>
      </div>
      <div className="reviewGrid">
        <div className="reviewEvidence">
          {report ? (
            <Analysis report={report} />
          ) : (
            <ReportState loading={loading} error={error} />
          )}
        </div>
        <aside className="reviewActions">
          <details className="policy">
            <summary>ขอบเขตและนโยบายที่ต้องตรวจ</summary>
            <p>
              เพิ่มเฉพาะกฎระดับแอป ไม่เปลี่ยน firewall ของเครื่อง
              ต้องตรวจว่าเป้าหมายตรงกับต้นทาง และเป็น IP ที่นโยบายอนุญาต
            </p>
            <p>
              {p.duration_seconds
                ? `กฎหมดอายุหลัง ${duration(p.duration_seconds)}`
                : "กฎทำงานจนกว่าแอดมินจะปลดบล็อก"}
            </p>
            {p.policy_notes?.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
            <a href={`#/incident/${p.incident_id}`}>เปิดหลักฐานทั้งหมด</a>
          </details>
          {pending ? (
            <>
              <div className="field reviewerField">
                ผู้ตรวจทาน
                <output aria-label="ผู้ตรวจทาน (บัญชีที่ล็อกอิน)">
                  <Icon name="lock" size={13} />
                  {reviewer}
                </output>
                <small>บันทึกจากบัญชีที่ล็อกอินอยู่ แก้ไขไม่ได้</small>
              </div>
              <div className="decisionButtons">
                <button
                  className="button primary"
                  disabled={!can || ctx.busy}
                  onClick={() => setConfirm("approve")}
                >
                  <Icon name="check" />
                  อนุมัติข้อเสนอ
                </button>
                <button
                  className="button"
                  disabled={!can || ctx.busy}
                  onClick={() => setConfirm("reject")}
                >
                  ปฏิเสธ
                </button>
              </div>
              <p className="hint">
                ยังไม่มีการบล็อกจนกว่าคุณจะยืนยันในขั้นถัดไป
              </p>
            </>
          ) : (
            <p className="notice">
              บันทึกโดย {p.reviewer || "ผู้ดูแล"} ·{" "}
              <a href={`#/incident/${p.incident_id}`}>ดูผลการป้องกัน</a>
            </p>
          )}
        </aside>
      </div>
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
          danger={confirm === "reject"}
          busy={ctx.busy}
          disabled={!can}
          onConfirm={decide}
          onClose={() => setConfirm(null)}
        >
          <p className="mono large">{targetIp(p)}</p>
          <p>
            {confirm === "approve"
              ? `แอปที่ป้องกันจะปฏิเสธคำขอจาก IP นี้ ${duration(p.duration_seconds)} ต้องมีคำขอใหม่เพื่อยืนยันผลภายหลัง`
              : "ไม่สร้างกฎจากข้อเสนอนี้ และบันทึกผู้ตัดสินใจ"}
          </p>
          <small>ผู้ตรวจทาน · {reviewer}</small>
        </Confirmation>
      )}
    </Panel>
  );
}

export function Rules({ ctx, id }) {
  const [view, setView] = useState("active"),
    [q, setQ] = useState(""),
    [confirm, setConfirm] = useState(null),
    rows = ctx.data.rules.filter(
      (r) =>
        (view === "active"
          ? activeRule(r, ctx.now)
          : !activeRule(r, ctx.now)) && `${r.id} ${r.source_ip}`.includes(q),
    ),
    selected = rows.find((r) => r.id === id) || rows[0];
  useEffect(() => {
    const r = ctx.data.rules.find((r) => r.id === id);
    if (r) setView(activeRule(r, ctx.now) ? "active" : "history");
  }, [id]);
  return (
    <div className={`rulesLayout ${rows.length <= 3 ? "fewRules" : ""}`}>
      <Panel title="App-level rules" code="01">
        <div className="filterBar">
          <Search value={q} onChange={setQ} />
          <Toggle
            label="สถานะกฎ"
            value={view}
            onChange={setView}
            items={[
              ["active", "ทำงานอยู่"],
              ["history", "ประวัติ"],
            ]}
          />
        </div>
        <Table
          rows={rows}
          selected={selected?.id}
          emptyContent={view === "active" && !ctx.data.rules.some((r) => activeRule(r, ctx.now)) ? <MascotEmpty title="ยังไม่มีกฎบล็อกที่ทำงาน" /> : undefined}
          onSelect={(r) => (location.hash = `/rules/${r.id}`)}
          columns={[
            { key: "id", label: "RULE", render: (r) => `RULE-${r.id}` },
            ipsColumn,
            {
              key: "expires_at",
              label: "EXPIRES",
              render: (r) => date(r.expires_at),
            },
            {
              key: "proof",
              label: "EVIDENCE",
              render: (r) => (
                <Badge color={proofFor(r, ctx.data.traffic) ? "good" : "quiet"}>
                  {proofFor(r, ctx.data.traffic)
                    ? "ยืนยัน 403 แล้ว"
                    : "ยังไม่ยืนยันผล"}
                </Badge>
              ),
            },
          ]}
        />
      </Panel>
      {selected && <Panel title="Rule details" code="02" className="ruleInspector">
        <div className="ruleDetails">
          {selected ? (
            <>
              <h2>RULE-{selected.id}</h2>
              <dl className="facts">
                <div>
                  <dt>ต้นทาง</dt>
                  <dd className="mono">{selected.source_ip}</dd>
                </div>
                <div>
                  <dt>เริ่มใช้</dt>
                  <dd>{date(selected.created_at)}</dd>
                </div>
                <div>
                  <dt>หมดอายุ</dt>
                  <dd>{date(selected.expires_at)}</dd>
                </div>
              </dl>
              {activeRule(selected, ctx.now) && (
                <>
                  <RuleCountdown rule={selected} now={ctx.now} />
                  <button
                    className="button dangerOutline"
                    disabled={ctx.busy || !!ctx.error}
                    onClick={() => setConfirm(selected)}
                  >
                    ตรวจทานและปลดบล็อก
                  </button>
                </>
              )}
              <div className="proof">
                <b>
                  {proofFor(selected, ctx.data.traffic)
                    ? "มีหลักฐานคำขอถูกปฏิเสธแล้ว"
                    : "ยังไม่มีคำขอใหม่ยืนยันผล"}
                </b>
              </div>
            </>
          ) : (
            <Empty>ไม่มีกฎในรายการนี้</Empty>
          )}
        </div>
        <details className="policy">
          <summary>ที่อยู่ที่ห้ามบล็อก</summary>
          <p>
            Loopback และที่อยู่ที่ระบบกำหนดให้ป้องกัน จะถูกตรวจซ้ำที่ backend
            ก่อนอนุมัติ
          </p>
        </details>
      </Panel>}
      {confirm && (
        <Confirmation
          title="ปลดบล็อก IP นี้?"
          confirmLabel="ยืนยันปลดบล็อก"
          danger
          busy={ctx.busy}
          disabled={!!ctx.error}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const r = await ctx.act(`/api/rules/${confirm.id}`, {
              method: "DELETE",
            });
            if (r) setConfirm(null);
          }}
        >
          <p className="mono large">{confirm.source_ip}</p>
          <p>
            ปิดกฎ RULE-{confirm.id} หากมีกฎอื่นของ IP เดียวกัน
            คำขออาจยังถูกบล็อก
          </p>
        </Confirmation>
      )}
    </div>
  );
}

export function RuleCountdown({ rule, now }) {
  const lifetime = ruleLifetime(rule, now);
  if (!lifetime) return null;
  const minutes = Math.floor(lifetime.seconds / 60),
    seconds = lifetime.seconds % 60;
  return (
    <div className="countdown">
      <small>TIME REMAINING</small>
      <strong>
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        <em> min:sec</em>
      </strong>
      <progress
        max="100"
        value={lifetime.percent ?? undefined}
        aria-label="เวลาที่เหลือของกฎบล็อก"
        aria-valuetext={`เหลือ ${minutes} นาที ${seconds} วินาที`}
      />
    </div>
  );
}

export function Reports({ ctx, id }) {
  const [q, setQ] = useState(""),
    rows = ctx.data.incidents.filter((i) =>
      `${incidentId(i.id)} ${i.source_ip} ${kind(i.kind)}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    ),
    current = (rows.find((i) => i.id === id) || rows[0])?.id;
  return (
    <div className="archiveLayout">
      <Panel title="Evidence library" code="01" className="noPrint">
        <Search value={q} onChange={setQ} label="ค้นหารายงาน" />
        {rows.length ? (
          <div className="queue">
            {rows.map((i) => (
              <a
                className={`queueCard ${i.id === current ? "selected" : ""}`}
                data-type={typeKey(i.kind)}
                key={i.id}
                href={`#/reports/${i.id}`}
              >
                <small>{incidentId(i.id)}</small>
                <b className="typeName">{kind(i.kind)}</b>
                <span className="mono">{i.source_ip}</span>
                <Badge value={i.status} />
              </a>
            ))}
          </div>
        ) : (
          <Empty>ไม่พบรายงาน</Empty>
        )}
      </Panel>
      {current ? (
        <ReportView ctx={ctx} id={current} />
      ) : (
        <Empty>ยังไม่มีรายงาน</Empty>
      )}
    </div>
  );
}
function ReportView({ ctx, id }) {
  const { report, error, loading } = useReport(id, ctx.version);
  if (!report) return <ReportState loading={loading} error={error} />;
  return (
    <Panel
      title={incidentId(id)}
      code="02"
      actions={
        <div className="inlineActions noPrint">
          <a
            className="button compact"
            href={`/api/reports/${id}`}
            download={`sentinel-${incidentId(id)}.json`}
          >
            <Icon name="download" size={14} />
            JSON
          </a>
          <button className="button compact" onClick={() => window.print()}>
            พิมพ์
          </button>
        </div>
      }
    >
      <div className="reportIdentity">
        <h2>{kind(report.kind)}</h2>
        <Badge value={report.status} />
        <span className="mono">{report.source_ip}</span>
        <small>{date(report.created_at)}</small>
      </div>
      <div className="reportContent">
        <div className="reportAnalysis">
          <Analysis report={report} />
          <h3 className="subhead">บันทึกการดำเนินการ</h3>
          <Timeline rows={report.timeline || []} />
        </div>
        <div className="reportEvidence">
          <h3 className="subhead">หลักฐานที่รับเข้า</h3>
          <EventTable events={report.events || []} kind={report.kind} />
        </div>
      </div>
      <Json
        title="รายงานทั้งหมด รวม trace / traffic / proposal"
        value={report}
      />
    </Panel>
  );
}
