import React, {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  GROUPS,
  topologyOf,
  topologyWindow,
  MAX_VISIBLE_SOURCES,
} from "./topologyModel.js";
import { Badge, Empty, Search, Table, Toggle, typeKey } from "./ui.jsx";
import { time, kind as kindLabel } from "./lib.js";
const GeoMap = lazy(() => import("./GeoMap.jsx"));

export default function Topology({
  data,
  activeRules,
  selectedIp,
  onSelectIp,
  connected,
}) {
  const uid = useId().replace(/:/g, ""),
    model = useMemo(() => topologyOf(data, activeRules), [data, activeRules]);
  const latestIncidents = useMemo(() => {
    const latest = new Map();
    for (const incident of data.incidents) {
      const old = latest.get(incident.source_ip);
      if (!old || Date.parse(incident.created_at) > Date.parse(old.created_at))
        latest.set(incident.source_ip, incident);
    }
    return latest;
  }, [data.incidents]);
  const [group, setGroup] = useState(null),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [view, setView] = useState("map"),
    [canvasSize, setCanvasSize] = useState({ width: 740, height: 460 });
  const viewport = useRef(null);
  useEffect(() => {
    const resize = new ResizeObserver(([entry]) => {
      setCanvasSize({
        width: Math.max(600, entry.contentRect.width),
        height: Math.max(320, entry.contentRect.height),
      });
    });
    resize.observe(viewport.current);
    return () => resize.disconnect();
  }, []);
  const centerX = canvasSize.width / 2,
    centerY = canvasSize.height / 2;
  const slice = topologyWindow(model, { group, query, page }),
    label = GROUPS.find((g) => g.key === group)?.label;
  const selectedIndex = slice.filtered.findIndex((s) => s.ip === selectedIp);
  useEffect(() => {
    if (view !== "world" || !selectedIp) return;
    if (selectedIndex >= 0)
      setPage(Math.floor(selectedIndex / MAX_VISIBLE_SOURCES));
  }, [view, selectedIp, selectedIndex]);
  const reset = () => {
    setGroup(null);
    setPage(0);
    setQuery("");
    onSelectIp(null);
  };
  const drill = (key) => {
    setGroup(key);
    setPage(0);
    onSelectIp(null);
  };
  const nodes = slice.clustered
    ? model.groups.map((g) => ({
        ...g,
        id: g.key,
        label: g.label,
        status: g.key,
        cluster: true,
      }))
    : slice.visible.map((s) => ({
        ...s,
        id: s.ip,
        label: s.ip,
        cluster: false,
        incidentKind: latestIncidents.get(s.ip)?.kind,
      }));
  const host =
      import.meta.env.VITE_PROTECTED_SITE_HOST || "Protected application",
    hostIp = import.meta.env.VITE_PROTECTED_SITE_IP;
  return (
    <div className="networkExplorer">
      <div className="mapTools">
        <Toggle
          label="มุมมองเครือข่าย"
          value={view}
          onChange={setView}
          items={[
            ["map", "MAP"],
            ["sources", "SOURCES"],
            ["world", "WORLD"],
          ]}
        />
        {(model.sources.length > 12 || query || group) && (
          <Search
            label="ค้นหา IP ในแผนผัง"
            placeholder="ค้นหา IP ในข้อมูลที่โหลด…"
            value={query}
            onChange={(q) => {
              setQuery(q);
              setPage(0);
              onSelectIp(null);
            }}
          />
        )}
      </div>
      {(slice.clustered || group || query) && (
        <div className="mapBreadcrumb">
          <button type="button" onClick={reset}>
            ภาพรวม {model.sources.length.toLocaleString()} IP
          </button>
          {group && (
            <>
              <span>/</span>
              <b>{label}</b>
            </>
          )}
          {query && <span>· ค้นหา “{query}”</span>}
          <small>
            {view === "map" && slice.clustered
              ? "รวมกลุ่มอัตโนมัติ · กดวงกลมเพื่อเจาะราย IP"
              : `${slice.filtered.length.toLocaleString()} IP ที่ตรงเงื่อนไข`}
          </small>
        </div>
      )}
      <div className="mapViewport" ref={viewport} data-view={view}>
      {view === "world" ? (
        <Suspense fallback={<Empty>กำลังโหลดแผนที่โลก…</Empty>}>
          <GeoMap
            sources={slice.visible}
            selectedIp={selectedIp}
            onSelectIp={onSelectIp}
          />
        </Suspense>
      ) : view === "sources" ? (
        <Table
          keyField="ip"
          rows={slice.filtered}
          selected={selectedIp}
          onSelect={(s) => onSelectIp(s.ip)}
          columns={[
            {
              key: "ip",
              label: "SOURCE IP",
              render: (s) => <b className="mono">{s.ip}</b>,
            },
            { key: "at", label: "LAST SEEN", render: (s) => time(s.at) },
            {
              key: "status",
              label: "STATUS",
              render: (s) => (
                <Badge
                  color={
                    s.status === "blocked"
                      ? "bad"
                      : s.status === "attention"
                        ? "warn"
                        : "good"
                  }
                >
                  {GROUPS.find((g) => g.key === s.status)?.label}
                </Badge>
              ),
            },
          ]}
        />
      ) : (
        <>
          <div
            className="connectionMap"
            data-clustered={slice.clustered}
            data-visible-nodes={nodes.length}
            data-source-count={model.sources.length}
          >
            <svg
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
              role="group"
              aria-label="แผนผังความสัมพันธ์ต้นทางกับแอปที่ป้องกัน"
            >
              <defs>
                <pattern
                  id={`${uid}grid`}
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M24 0H0V24"
                    fill="none"
                    stroke="var(--line)"
                    strokeWidth=".5"
                  />
                </pattern>
              </defs>
              <rect width={canvasSize.width} height={canvasSize.height} fill={`url(#${uid}grid)`} />
              {[85, 145, 205].map((r) => (
                <circle
                  key={r}
                  cx={centerX}
                  cy={centerY}
                  r={r * Math.min(1, canvasSize.height / 460)}
                  className="connectionOrbit"
                />
              ))}
              {nodes.map((node, i) => {
                const side = i % 2,
                  slot = Math.floor(i / 2),
                  count = Math.ceil((nodes.length - side) / 2),
                  x = side ? canvasSize.width - 124 : 124,
                  y = count === 1 ? centerY : 55 + (slot * (canvasSize.height - 110)) / (count - 1),
                  bend = centerX + (side ? 110 : -110),
                  path = `M${x} ${y}C${bend} ${y},${bend} ${centerY},${centerX} ${centerY}`,
                  selected = !node.cluster && node.ip === selectedIp;
                return (
                  <g
                    key={node.id}
                    className={`connectionSource ${node.status} ${selected ? "selected" : ""}`}
                    data-type={node.incidentKind ? typeKey(node.incidentKind) : undefined}
                  >
                    {node.incidentKind && <title>{node.ip} · {node.incidentKind}</title>}
                    <path
                      id={`${uid}route${i}`}
                      d={path}
                      className="connectionRoute"
                    />
                    {connected && (
                      <circle r="2.5" className="connectionPacket">
                        <animateMotion
                          dur={`${5 + i * 0.3}s`}
                          begin={`${-i * 0.7}s`}
                          repeatCount="indefinite"
                        >
                          <mpath href={`#${uid}route${i}`} />
                        </animateMotion>
                      </circle>
                    )}
                    <g
                      role="button"
                      tabIndex="0"
                      aria-label={
                        node.cluster
                          ? `เจาะกลุ่ม${node.label} ${node.count} IP`
                          : `เลือก IP ${node.ip}`
                      }
                      aria-pressed={selected}
                      onClick={() =>
                        node.cluster ? drill(node.key) : onSelectIp(node.ip)
                      }
                      onKeyDown={(e) => {
                        if (["Enter", " "].includes(e.key)) {
                          e.preventDefault();
                          node.cluster ? drill(node.key) : onSelectIp(node.ip);
                        }
                      }}
                      className="connectionEndpoint"
                    >
                      <circle
                        cx={x}
                        cy={y}
                        r={node.cluster ? 37 : 24}
                        fill="transparent"
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r={node.cluster ? 32 : selected ? 15 : 11}
                        className="connectionFocus"
                      />
                      {node.cluster ? (
                        <>
                          <text
                            x={x}
                            y={y + 6}
                            textAnchor="middle"
                            className="clusterCount"
                          >
                            {node.count.toLocaleString()}
                          </text>
                          <text
                            x={x}
                            y={y - 46}
                            textAnchor="middle"
                            className="clusterLabel"
                          >
                            {node.label}
                          </text>
                          <text
                            x={x}
                            y={y + 52}
                            textAnchor="middle"
                            className="connectionNodeState"
                          >
                            IP · กดเพื่อเจาะข้อมูล
                          </text>
                        </>
                      ) : (
                        <>
                          <circle cx={x} cy={y} r="5" fill="var(--data)" />
                          <text x={x} y={y - 19} textAnchor="middle">
                            {node.ip}
                          </text>
                          <text
                            x={x}
                            y={y + 27}
                            textAnchor="middle"
                            className="connectionNodeState"
                          >
                            {GROUPS.find((g) => g.key === node.status)?.short}
                          </text>
                          {node.incidentKind && <text x={x} y={y + 44} textAnchor="middle" className="connectionTypeLabel">{kindLabel(node.incidentKind)}</text>}
                        </>
                      )}
                    </g>
                  </g>
                );
              })}
              <g className="connectionHub">
                <circle cx={centerX} cy={centerY} r="50" />
                <circle cx={centerX} cy={centerY} r="37" fill="var(--data)" />
                <path
                  d="M359 220h22v8h-22zM359 233h22v8h-22zM363 224h1m-1 13h1"
                  transform={`translate(${centerX - 370} ${centerY - 230})`}
                  fill="none"
                  stroke="var(--text-dim)"
                  strokeWidth="1.5"
                />
                <text x={centerX} y={centerY + 66} textAnchor="middle">
                  {host.length > 32 ? host.slice(0, 30) + "…" : host}
                </text>
                <text
                  x={centerX}
                  y={centerY + 82}
                  textAnchor="middle"
                  className="connectionNodeState"
                >
                  {hostIp || "APPLICATION NODE"}
                </text>
              </g>
            </svg>
            {!slice.clustered && nodes.length > 0 && (
              <div className="mapMobileList" aria-label="IP ในแผนผังชุดนี้">
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    aria-label={`เลือก IP ${node.ip}`}
                    aria-pressed={node.ip === selectedIp}
                    onClick={() => onSelectIp(node.ip)}
                  >
                    <b className="mono">{node.ip}</b>
                    <Badge
                      color={
                        node.status === "blocked"
                          ? "bad"
                          : node.status === "attention"
                            ? "warn"
                            : "good"
                      }
                    >
                      {GROUPS.find((g) => g.key === node.status)?.label}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
            {!nodes.length && (
              <Empty>
                {query
                  ? "ไม่พบ IP ที่ตรงกับคำค้นหา"
                  : "ยังไม่มี IP ที่ระบบบันทึก"}
              </Empty>
            )}
          </div>
        </>
      )}
      </div>
      {view !== "sources" &&
        (view === "world" || !slice.clustered) &&
        slice.filtered.length > MAX_VISIBLE_SOURCES && (
          <div className="mapPagination">
            <span>
              แสดง {slice.page * MAX_VISIBLE_SOURCES + 1}–
              {Math.min(
                (slice.page + 1) * MAX_VISIBLE_SOURCES,
                slice.filtered.length,
              )}{" "}
              จาก {slice.filtered.length.toLocaleString()} IP
            </span>
            <div>
              <button
                className="button compact"
                disabled={slice.page === 0}
                onClick={() => {
                  setPage(slice.page - 1);
                  onSelectIp(null);
                }}
              >
                ชุดก่อนหน้า
              </button>
              <button
                className="button compact"
                disabled={slice.page === slice.pages - 1}
                onClick={() => {
                  setPage(slice.page + 1);
                  onSelectIp(null);
                }}
              >
                ชุดถัดไป
              </button>
            </div>
          </div>
        )}
      <div className="connectionMapFooter">
        <span>
          {selectedIp ? (
            <>
              <i className="dot" />
              <b className="mono">{selectedIp}</b>
            </>
          ) : view === "world" ? (
            "เลือก IP หรือหมุดเพื่อดูตำแหน่ง"
          ) : view === "sources" ? (
            "เลือกรายการเพื่อสำรวจ IP"
          ) : slice.clustered ? (
            "ภาพรวมแบบกลุ่ม — จำกัดจำนวนเส้นเพื่อให้อ่านง่าย"
          ) : (
            "เลือกจุดเพื่อสำรวจ IP"
          )}
        </span>
        <small>
          {view === "world"
            ? "GeoIP ประเทศ / เมืองโดยประมาณ"
            : "จากข้อมูลที่โหลดล่าสุด · ไม่ใช่พิกัดภูมิศาสตร์"}
        </small>
      </div>
    </div>
  );
}
