import React, { useState } from "react";
import { Badge, Empty, Icon, Panel, Table, Toggle } from "./ui.jsx";
import { activeRule, incidentId, kind, time } from "./lib.js";
import { useReducedMotion } from "./motion.jsx";
export default function PosterExplorer({ view, sources, ctx }) {
  const [sourceView, setSourceView] = useState("timeline");
  const [page, setPage] = useState(0),
    [paused, setPaused] = useState(false),
    reduced = useReducedMotion();
  const pages = Math.max(1, Math.ceil(sources.length / 8)),
    current = Math.min(page, pages - 1),
    shown = sources.slice(current * 8, current * 8 + 8);
  const selected = sources.find((s) => s.ip === ctx.selectedIp),
    cases = ctx.data.incidents.filter((i) => i.source_ip === ctx.selectedIp),
    rules = ctx.data.rules.filter((r) => activeRule(r, ctx.now));
  const status = (ip) =>
    rules.some((r) => r.source_ip === ip)
      ? "blocked"
      : ctx.data.incidents.some(
            (i) =>
              i.source_ip === ip &&
              [
                "awaiting_approval",
                "detected",
                "analyzing",
                "needs_review",
              ].includes(i.status),
          )
        ? "Needs review"
        : "Observed";
  return (
    <div className="posterSourceLayout">
      <section className="posterSourceMain">
        {view === "sources" ? (
          <Panel
            title="Source activity"
            actions={
              <Toggle
                label="Source display"
                value={sourceView}
                onChange={setSourceView}
                items={[
                  ["timeline", "Timeline"],
                  ["table", "Table"],
                ]}
              />
            }
          >
            <p className="hint">
              ต้นทางจากข้อมูลที่โหลด · รวม IP ที่ไม่มีพิกัด
            </p>
            {sourceView === "timeline" ? (
              <SourceTimeline sources={sources} ctx={ctx} status={status} />
            ) : (
              <Table
                keyField="ip"
                rows={sources}
                selected={ctx.selectedIp}
                onSelect={(s) => ctx.setSelectedIp(s.ip)}
                columns={[
                  {
                    key: "ip",
                    label: "Source IP",
                    render: (s) => (
                      <button
                        className="textButton mono"
                        onClick={() => ctx.setSelectedIp(s.ip)}
                      >
                        {s.ip}
                      </button>
                    ),
                  },
                  {
                    key: "channels",
                    label: "Channel",
                    render: (s) =>
                      s.channels
                        .map((c) =>
                          c === "port" ? "Ports" : c === "web" ? "Web" : "SSH",
                        )
                        .join(" / "),
                  },
                  {
                    key: "status",
                    label: "Status",
                    render: (s) => <Badge value={status(s.ip)} />,
                  },
                  { key: "at", label: "Last seen", render: (s) => time(s.at) },
                  {
                    key: "geo",
                    label: "Location",
                    render: (s) =>
                      ctx.locations[s.ip]?.latitude !== undefined
                        ? `${ctx.locations[s.ip].city}, ${ctx.locations[s.ip].country}`
                        : "ไม่มีพิกัด",
                  },
                ]}
              />
            )}
          </Panel>
        ) : (
          <div className="posterTopology">
            <svg
              viewBox="0 0 1000 560"
              role="img"
              aria-label="ความสัมพันธ์ต้นทางกับ VPS ที่เฝ้าระวัง"
            >
              <defs>
                <radialGradient id="topologyGlow">
                  <stop stopColor="#c8ff17" stopOpacity=".17" />
                  <stop offset="1" stopColor="#c8ff17" stopOpacity="0" />
                </radialGradient>
              </defs>
              <ellipse
                cx="500"
                cy="300"
                rx="440"
                ry="215"
                fill="none"
                stroke="#6c7e8c55"
              />
              {[330, 240, 145].map((r) => (
                <ellipse
                  key={r}
                  cx="500"
                  cy="300"
                  rx={r}
                  ry={r * 0.49}
                  fill="none"
                  stroke="#788a9540"
                />
              ))}
              <ellipse
                cx="500"
                cy="300"
                rx="260"
                ry="170"
                fill="url(#topologyGlow)"
              />
              {shown.map((s, i) => {
                const angle =
                    -Math.PI * 0.8 +
                    (i * Math.PI * 2) / Math.max(shown.length, 1),
                  x = 500 + Math.cos(angle) * 365,
                  y = 280 + Math.sin(angle) * 165,
                  web = s.channels.includes("web");
                return (
                  <g key={s.ip}>
                    <path
                      id={`edge-${i}`}
                      d={`M${x},${y} Q500,260 500,300`}
                      fill="none"
                      stroke={ctx.selectedIp === s.ip ? "#c8ff17" : "#afc1cc"}
                      strokeWidth={ctx.selectedIp === s.ip ? 2.5 : 1.3}
                      strokeDasharray={web ? undefined : "7 7"}
                      opacity=".8"
                    />
                    {!paused && !reduced && (
                      <circle
                        r="4"
                        fill={ctx.selectedIp === s.ip ? "#c8ff17" : "#eef5fa"}
                      >
                        <animateMotion
                          dur={`${2 + i * 0.16}s`}
                          repeatCount="indefinite"
                          path={`M${x},${y} Q500,260 500,300`}
                        />
                      </circle>
                    )}
                  </g>
                );
              })}
              <path
                d="M500 208 576 249 500 290 424 249Z"
                fill="#6b7f8840"
                stroke="#e3eef3"
              />
              <path
                d="M424 249v64l76 42v-65M576 249v64l-76 42"
                fill="#26383fc0"
                stroke="#d6e5ed"
              />
              <path
                d="m481 253 13 13 27-30"
                fill="none"
                stroke="#c8ff17"
                strokeWidth="5"
              />
              <text
                x="500"
                y="390"
                fill="white"
                textAnchor="middle"
                fontSize="22"
                fontWeight="600"
              >
                Monitored VPS
              </text>
              <text
                x="500"
                y="416"
                fill="#aeb7c0"
                textAnchor="middle"
                fontSize="13"
              >
                Observed relationship · Web protection only
              </text>
            </svg>
            {shown.map((s, i) => {
              const a =
                  -Math.PI * 0.8 +
                  (i * Math.PI * 2) / Math.max(shown.length, 1),
                x = 500 + Math.cos(a) * 365,
                y = 280 + Math.sin(a) * 165;
              return (
                <button
                  key={s.ip}
                  className="topologySource"
                  aria-pressed={ctx.selectedIp === s.ip}
                  style={{ left: `${x / 10}%`, top: `${y / 5.6}%` }}
                  onClick={() => ctx.setSelectedIp(s.ip)}
                >
                  <span
                    className={`nodeDot ${status(s.ip) === "blocked" ? "protected" : status(s.ip) === "Needs review" ? "review" : ""}`}
                  />
                  <strong className="mono">{s.ip}</strong>
                  <small>
                    {s.channels
                      .map((c) => (c === "port" ? "Ports" : c.toUpperCase()))
                      .join(" / ")}{" "}
                    · {status(s.ip)}
                  </small>
                </button>
              );
            })}
            {!shown.length && (
              <div className="topologyEmpty">
                <Empty>ไม่มีต้นทางที่ตรงตัวกรอง</Empty>
              </div>
            )}
            <div className="topologyLegend">
              <span>━━ Web</span>
              <span>┄┄ SSH / Ports</span>
            </div>
            <div className="topologyTools">
              <button
                className="button compact"
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? "Play motion" : "Pause motion"}
              </button>
              {pages > 1 && (
                <>
                  <button
                    className="button compact"
                    disabled={!current}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ←
                  </button>
                  <small>
                    {current + 1}/{pages}
                  </small>
                  <button
                    className="button compact"
                    disabled={current >= pages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    →
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </section>
      <Panel title="Selected source" className="posterSourceInspector">
        {selected ? (
          <>
            <h2 className="mono">{selected.ip}</h2>
            <Badge value={status(selected.ip)} />
            <p>{selected.channels.join(" / ")}</p>
            <p>
              {ctx.locations[selected.ip]?.latitude !== undefined
                ? `${ctx.locations[selected.ip].city}, ${ctx.locations[selected.ip].country}`
                : ctx.locations[selected.ip]?.note || "ยังไม่มีพิกัด"}
            </p>
            <small>Last seen {time(selected.at)}</small>
            <div className="sourceCases">
              {cases.map((i) => (
                <a
                  key={i.id}
                  className="button primary"
                  href={`#/incident/${i.id}`}
                >
                  {incidentId(i.id)} · {kind(i.kind)} <Icon name="arrow" />
                </a>
              ))}
              {!cases.length && (
                <a
                  className="button"
                  href={`#/incidents?q=${encodeURIComponent(selected.ip)}`}
                >
                  ค้นหาเหตุการณ์ของ IP นี้
                </a>
              )}
            </div>
          </>
        ) : (
          <Empty>เลือกต้นทางเพื่อดูรายละเอียด</Empty>
        )}
      </Panel>
    </div>
  );
}

function SourceTimeline({ sources, ctx, status }) {
  const [page, setPage] = useState(0),
    pages = Math.max(1, Math.ceil(sources.length / 20)),
    current = Math.min(page, pages - 1),
    rows = sources.slice(current * 20, current * 20 + 20);
  const stamps = sources.map((s) => Date.parse(s.at)).filter(Number.isFinite),
    earliest = Math.min(...stamps, ctx.now),
    latest = Math.max(...stamps, ctx.now);
  return (
    <div className="sourceTimeline">
      <div className="timelineAxis">
        <span>Source signals over time (last seen)</span>
        <small>
          {time(new Date(earliest).toISOString())} —{" "}
          {time(new Date(latest).toISOString())}
        </small>
      </div>
      {rows.map((s) => (
        <button
          key={s.ip}
          className="sourceTimelineRow"
          aria-pressed={ctx.selectedIp === s.ip}
          onClick={() => ctx.setSelectedIp(s.ip)}
        >
          <strong className="mono">{s.ip}</strong>
          <span>
            {s.channels
              .map((c) => (c === "port" ? "Ports" : c.toUpperCase()))
              .join(" / ")}
          </span>
          <Badge value={status(s.ip)} />
          <span className="sourceTimeTrack">
            <i
              style={{
                left: `${5 + Math.max(0, Math.min(1, (Date.parse(s.at) - earliest) / Math.max(1, latest - earliest))) * 90}%`,
              }}
            />
            <small>{time(s.at)}</small>
          </span>
        </button>
      ))}
      {!rows.length && <Empty>ไม่พบต้นทาง</Empty>}
      {pages > 1 && (
        <div className="timelinePagination">
          <button
            className="button compact"
            disabled={!current}
            onClick={() => setPage((p) => p - 1)}
          >
            ←
          </button>
          <small>
            {current + 1} / {pages}
          </small>
          <button
            className="button compact"
            disabled={current >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
