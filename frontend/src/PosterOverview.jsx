import React, { useEffect, useMemo, useState } from "react";
import {
  sourcesOf,
  activeRule,
  isOpenIncident,
  incidentId,
  kind,
  time,
  attentionQueue,
  channelLabel,
} from "./lib.js";
import { Badge, Empty, Icon, Panel, Search } from "./ui.jsx";
import PosterExplorer from "./PosterExplorer.jsx";

export default function PosterOverview({ ctx }) {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const [view, setView] = useState(params.get("view") || "globe"),
    [query, setQuery] = useState(params.get("q") || ""),
    [channel, setChannel] = useState(params.get("channel") || "all"),
    [range, setRange] = useState(params.get("range") || "15m");
  const sources = useMemo(() => sourcesOf(ctx.data), [ctx.data]);
  const pending = ctx.data.proposals.filter((p) => p.status === "pending");
  const items = attentionQueue(
    ctx.data.incidents,
    ctx.data.proposals,
    ctx.data.rules,
    ctx.data.events,
  );
  const selected = sources.find((s) => s.ip === ctx.selectedIp);
  const incidents = ctx.data.incidents.filter(
    (i) => i.source_ip === ctx.selectedIp,
  );
  const geo = ctx.locations[ctx.selectedIp];
  const filtered = sources.filter(
    (s) =>
      s.ip.toLowerCase().includes(query.toLowerCase()) &&
      (channel === "all" || s.channels.includes(channel)) &&
      (range === "all" ||
        Date.parse(s.at) >= ctx.now - (range === "1h" ? 3600000 : 900000)),
  );
  useEffect(() => {
    const q = new URLSearchParams({ view, range });
    if (query) q.set("q", query);
    if (channel !== "all") q.set("channel", channel);
    history.replaceState(null, "", `#/overview?${q}`);
  }, [view, range, query, channel]);
  useEffect(() => {
    const p = new URLSearchParams(ctx.routeQuery || "");
    setView(p.get("view") || "globe");
  }, [ctx.routeQuery]);
  useEffect(() => ctx.setOverviewView(view), [view]);
  const filteredKey = filtered.map((s) => s.ip).join("|");
  useEffect(() => {
    ctx.setGlobeSourceIps(filtered.map((s) => s.ip));
    if (ctx.selectedIp && !filtered.some((s) => s.ip === ctx.selectedIp))
      ctx.setSelectedIp(null);
  }, [filteredKey, ctx.selectedIp]);
  const choose = (ip) => ctx.setSelectedIp(ip);
  return (
    <div className="posterOverview">
      <div className="posterMetrics fadeOnZoom">
        <a href="#/overview?view=sources">
          <strong>{sources.length.toString().padStart(2, "0")}</strong>
          <span>Observed sources</span>
        </a>
        <a href="#/incidents?status=open">
          <strong>
            {ctx.data.incidents
              .filter(isOpenIncident)
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <span>Open incidents</span>
        </a>
        <a href="#/approvals">
          <strong>{pending.length.toString().padStart(2, "0")}</strong>
          <span>Awaiting decision</span>
        </a>
        <small>จำนวนจากข้อมูลที่โหลด · งานรอตัดสินใจเป็นค่าปัจจุบัน</small>
      </div>
      <div
        className="posterTabs fadeOnZoom"
        role="group"
        aria-label="มุมมอง Overview"
      >
        {[
          ["globe", "Globe", "overview"],
          ["sources", "Sources", "report"],
          ["network", "Network", "network"],
        ].map(([id, label, icon]) => (
          <button
            key={id}
            aria-pressed={view === id}
            onClick={() => setView(id)}
          >
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </div>
      {view === "globe" ? (
        <>
          <section className="posterGlobeStage">
            <aside className="sourceDossier instrument fadeOnZoom">
              <span className="eyebrow">SELECTED SOURCE</span>
              {selected ? (
                <>
                  <h2>
                    {incidents[0]
                      ? kind(incidents[0].kind)
                      : "Observed traffic"}
                  </h2>
                  {incidents[0] && <Badge value={incidents[0].severity} />}
                  <h3 className="mono">{selected.ip}</h3>
                  <p>
                    {geo?.latitude !== undefined
                      ? `${geo.city}, ${geo.country}`
                      : geo?.note || "กำลังค้นหาตำแหน่ง…"}
                  </p>
                  <small>
                    {geo?.sample
                      ? "พิกัดสาธิต"
                      : geo?.latitude !== undefined
                        ? "GeoIP โดยประมาณ"
                        : "ไม่มีการสร้างหมุดแทนพิกัดที่ไม่ทราบ"}
                  </small>
                  <p>{selected.channels.map(channelLabel).join(" · ")}</p>
                  <small>พบล่าสุด {time(selected.at)}</small>
                  <div className="sourceCases">
                    {incidents.map((i) => (
                      <a
                        className="button"
                        key={i.id}
                        href={`#/incident/${i.id}`}
                      >
                        {incidentId(i.id)} · เปิดหลักฐาน <Icon name="arrow" />
                      </a>
                    ))}
                  </div>
                  {!incidents.length && (
                    <a
                      className="button"
                      href={`#/incidents?q=${encodeURIComponent(selected.ip)}`}
                    >
                      ค้นเหตุการณ์ของ IP นี้
                    </a>
                  )}
                </>
              ) : (
                <>
                  <h2>Explore sources</h2>
                  <p>เลือกหมุดบนลูกโลกหรือ IP ในรายการเพื่อดูหลักฐาน</p>
                  <small>IP ที่ไม่มีพิกัดยังอ่านได้ใน Sources</small>
                </>
              )}
            </aside>
            <aside className="posterDecisions fadeOnZoom">
              <Panel
                title="Needs your decision"
                actions={
                  <b className="countPill">
                    {pending.length.toString().padStart(2, "0")}
                  </b>
                }
              >
                {items.length ? (
                  items.slice(0, 3).map((item) => (
                    <a
                      className="posterDecision"
                      key={item.key}
                      href={
                        item.proposal
                          ? `#/approvals/${item.proposal.id}`
                          : `#/incident/${item.incident.id}`
                      }
                    >
                      <Badge value={item.incident.severity} />
                      <strong>{kind(item.incident.kind)}</strong>
                      <span className="mono">{item.incident.source_ip}</span>
                    </a>
                  ))
                ) : (
                  <Empty>ไม่มีงานรอตัดสินใจ</Empty>
                )}
                <a className="button primary" href="#/approvals">
                  Review proposals <Icon name="arrow" />
                </a>
              </Panel>
              <Panel title="Sources on globe">
                <div className="globeSourceList">
                  {filtered.slice(0, 20).map((s) => (
                    <button
                      key={s.ip}
                      aria-pressed={ctx.selectedIp === s.ip}
                      onClick={() => choose(s.ip)}
                    >
                      <i
                        className={`dot ${ctx.data.incidents.some((i) => i.source_ip === s.ip) ? "red" : ""}`}
                      />
                      <span className="mono">{s.ip}</span>
                      <small>
                        {ctx.locations[s.ip]?.latitude !== undefined
                          ? "⌖"
                          : "—"}
                      </small>
                    </button>
                  ))}
                  {!filtered.length && <Empty>ไม่พบต้นทางที่ตรงตัวกรอง</Empty>}
                </div>
                <small>
                  พิกัดโดยประมาณ ·{" "}
                  <a href="#/overview?view=sources">ดูต้นทางทั้งหมด →</a>
                </small>
              </Panel>
            </aside>
            <div className="posterGlobeControls">
              <button
                aria-label="รีเซ็ตลูกโลก"
                onClick={() => ctx.globeRef.current?.reset()}
              >
                <Icon name="refresh" />
              </button>
              <button
                aria-label="ซูมออก"
                onClick={() => ctx.globeRef.current?.zoom(-0.12)}
              >
                −
              </button>
              <button
                aria-label="ซูมเข้า"
                onClick={() => ctx.globeRef.current?.zoom(0.12)}
              >
                +
              </button>
              <select
                aria-label="ช่วงเวลาของต้นทาง"
                value={range}
                onChange={(e) => setRange(e.target.value)}
              >
                <option value="15m">15 min</option>
                <option value="1h">1 hour</option>
                <option value="all">Loaded data</option>
              </select>
              <button
                aria-label="เล่นหรือหยุดหมุนลูกโลก"
                onClick={() => ctx.globeRef.current?.toggle()}
              >
                Ⅱ / ▶
              </button>
            </div>
          </section>
          <PosterLiveSummary ctx={ctx} sources={sources} />
        </>
      ) : (
        <div className="posterExplorer">
          <div className="filterBar">
            <Search value={query} onChange={setQuery} label="ค้นหาต้นทาง" />
            <select
              aria-label="กรองช่องทาง"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="all">ทุกช่องทาง</option>
              <option value="web">Web</option>
              <option value="ssh">SSH</option>
              <option value="port">Ports</option>
            </select>
            <select
              aria-label="ช่วงเวลา"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="15m">15 min</option>
              <option value="1h">1 hour</option>
              <option value="all">Loaded data</option>
            </select>
          </div>
          <PosterExplorer view={view} sources={filtered} ctx={ctx} />
        </div>
      )}
    </div>
  );
}

function PosterLiveSummary({ ctx, sources }) {
  const rows = ctx.data.traffic,
    denied = rows.filter((t) => t.decision === "denied").length,
    located = sources.filter(
      (s) => ctx.locations[s.ip]?.latitude !== undefined,
    ).length;
  const bins = Array.from({ length: 15 }, () => 0),
    start = ctx.now - 900000;
  for (const t of rows) {
    const i = Math.floor((Date.parse(t.created_at) - start) / 60000);
    if (i >= 0 && i < 15) bins[i]++;
  }
  const max = Math.max(1, ...bins),
    points = bins
      .map((n, i) => `${(i * 300) / 14},${40 - (n / max) * 30}`)
      .join(" ");
  return (
    <div className="posterLiveSummary fadeOnZoom">
      <div>
        <strong>
          {located} / {sources.length} located
        </strong>
        <small>GeoIP โดยประมาณ · จำนวนจากข้อมูลที่โหลด</small>
      </div>
      <svg
        viewBox="0 0 300 48"
        role="img"
        aria-label="คำขอที่โหลดในช่วง 15 นาที"
      >
        <polyline
          points={points}
          fill="none"
          stroke="#dbe8ef"
          strokeWidth="1.5"
        />
      </svg>
      <div>
        <strong>{rows.length}</strong> loaded requests / <b>{denied}</b> denied
      </div>
      <a href="#/incidents">View activity ↓</a>
    </div>
  );
}
