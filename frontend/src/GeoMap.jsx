import React, { useEffect, useId, useRef, useState } from "react";
import land from "./assets/land-110m.json";
import { resolveGeo } from "./geo.js";
import { clampMapPan, geoPins, projectWorld } from "./geoModel.js";
import { Badge } from "./ui.jsx";

const landPath = land
  .map(
    (ring) =>
      ring
        .map(([lon, lat], i) => {
          const p = projectWorld(lat, lon);
          return `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join("") + "Z",
  )
  .join("");

export default function GeoMap({ sources, selectedIp, onSelectIp }) {
  const uid = useId().replace(/:/g, ""),
    key = sources.map((s) => s.ip).join("|"),
    drag = useRef(null);
  const [locations, setLocations] = useState({}),
    [focused, setFocused] = useState(null),
    [camera, setCamera] = useState({ zoom: 1, x: 0, y: 0 });
  useEffect(() => {
    let canceled = false;
    setFocused(null);
    for (const ip of key.split("|").filter(Boolean))
      resolveGeo(ip).then((geo) => {
        if (!canceled) setLocations((old) => ({ ...old, [ip]: geo }));
      });
    return () => {
      canceled = true;
    };
  }, [key]);
  const rows = sources.map((s) => ({ ...s, geo: locations[s.ip] })),
    pins = geoPins(rows),
    located = rows.filter((r) => r.geo?.latitude !== undefined).length,
    pending = rows.filter((r) => !r.geo).length,
    selectedGeo = locations[selectedIp];
  const focusGeo = (geo) => {
    if (geo?.latitude === undefined) return;
    const p = projectWorld(geo.latitude, geo.longitude),
      zoom = 2;
    setCamera({
      zoom,
      ...clampMapPan(500 - p.x * zoom, 250 - p.y * zoom, zoom),
    });
  };
  useEffect(() => {
    focusGeo(selectedGeo);
    setFocused(null);
  }, [selectedIp, selectedGeo]);
  const zoomBy = (delta) =>
    setCamera((c) => {
      const zoom = Math.max(1, Math.min(4, c.zoom + delta)),
        ratio = zoom / c.zoom;
      return {
        zoom,
        ...clampMapPan(
          500 + (c.x - 500) * ratio,
          250 + (c.y - 250) * ratio,
          zoom,
        ),
      };
    });
  const panBy = (x, y) =>
    setCamera((c) => ({ ...c, ...clampMapPan(c.x + x, c.y + y, c.zoom) }));
  const fit = () => {
    setCamera({ zoom: 1, x: 0, y: 0 });
    setFocused(null);
  };
  const visibleRows = focused
    ? rows.filter(
        (r) =>
          focused ===
          `${r.geo?.latitude?.toFixed(3)}:${r.geo?.longitude?.toFixed(3)}`,
      )
    : rows;
  return (
    <div className="geoExplorer">
      <div className="geoSummary" role="status">
        <b>
          {located} / {rows.length} IP มีพิกัด
        </b>
        <span>
          {pending
            ? `กำลังค้นหา ${pending} IP…`
            : `ระบุตำแหน่งไม่ได้ ${rows.length - located} IP`}
        </span>
      </div>
      <div className="geoContent">
        <div className="geoStage">
          <svg
            className="geoWorld"
            viewBox="0 0 1000 500"
            role="group"
            aria-label="แผนที่โลกตำแหน่ง IP โดยประมาณ ลากเพื่อเลื่อน ใช้ปุ่มบวกลบเพื่อซูม"
            tabIndex="0"
            data-zoom={camera.zoom}
            onPointerDown={(e) => {
              if (e.target.closest("[data-pin]")) return;
              drag.current = { x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const scale = e.currentTarget.getScreenCTM()?.a || 1;
              panBy(
                (e.clientX - drag.current.x) / scale,
                (e.clientY - drag.current.y) / scale,
              );
              drag.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              const moves = {
                ArrowLeft: [80, 0],
                ArrowRight: [-80, 0],
                ArrowUp: [0, 60],
                ArrowDown: [0, -60],
              };
              if (moves[e.key]) {
                e.preventDefault();
                panBy(...moves[e.key]);
              }
              if (["+", "=", "-", "Home"].includes(e.key)) {
                e.preventDefault();
                e.key === "Home" ? fit() : zoomBy(e.key === "-" ? -0.5 : 0.5);
              }
            }}
          >
            <defs>
              <clipPath id={`${uid}clip`}>
                <rect x="0" y="0" width="1000" height="500" rx="6" />
              </clipPath>
            </defs>
            <rect width="1000" height="500" rx="6" fill="var(--surface-2)" />
            <g clipPath={`url(#${uid}clip)`}>
              <g
                className="worldCamera"
                transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}
              >
                {[-60, -30, 0, 30, 60].map((lat) => (
                  <path
                    key={lat}
                    className="geoGrid"
                    d={`M20 ${projectWorld(lat, 0).y}H980`}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {[-180, -120, -60, 0, 60, 120, 180].map((lon) => (
                  <path
                    key={lon}
                    className="geoGrid"
                    d={`M${projectWorld(0, lon).x} 10V490`}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <path
                  d={landPath}
                  className="geoLand"
                  vectorEffect="non-scaling-stroke"
                />
                {pins.map((pin) => {
                  const p = projectWorld(pin.latitude, pin.longitude),
                    selected = pin.sources.some((s) => s.ip === selectedIp),
                    isFocused = focused === pin.key;
                  const activate = () => {
                    setFocused(pin.key);
                    if (pin.sources.length === 1) {
                      onSelectIp(pin.sources[0].ip);
                      focusGeo(pin);
                    }
                  };
                  return (
                    <g
                      key={pin.key}
                      data-pin="true"
                      data-latitude={pin.latitude}
                      data-longitude={pin.longitude}
                      role="button"
                      tabIndex="0"
                      className={`geoPin ${pin.sources.some((s) => s.status === "blocked") ? "blocked" : pin.sources.some((s) => s.status === "attention") ? "attention" : ""} ${selected || isFocused ? "selected" : ""}`}
                      aria-label={`ตำแหน่ง ${pin.country} ${pin.sources.length} IP`}
                      aria-pressed={selected || isFocused}
                      onClick={activate}
                      onKeyDown={(e) => {
                        if (["Enter", " "].includes(e.key)) {
                          e.preventDefault();
                          activate();
                        }
                      }}
                    >
                      <title>
                        {pin.country} ·{" "}
                        {pin.sources.map((s) => s.ip).join(", ")}
                      </title>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={18 / camera.zoom}
                        fill="transparent"
                      />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={(selected || isFocused ? 11 : 7) / camera.zoom}
                        className="geoPinHalo"
                        vectorEffect="non-scaling-stroke"
                      />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={3 / camera.zoom}
                        fill="var(--teal)"
                      />
                      {pin.sources.length > 1 && (
                        <text
                          style={{ fontSize: 12 / camera.zoom }}
                          x={p.x + 12 / camera.zoom}
                          y={p.y - 8 / camera.zoom}
                        >
                          {pin.sources.length}
                        </text>
                      )}
                      {(selected || isFocused) && (
                        <text
                          className="geoPinCountry"
                          style={{
                            fontSize: 13 / camera.zoom,
                            strokeWidth: 3 / camera.zoom,
                          }}
                          x={p.x + (p.x > 800 ? -16 : 16) / camera.zoom}
                          y={p.y + 17 / camera.zoom}
                          textAnchor={p.x > 800 ? "end" : "start"}
                        >
                          {pin.country}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
          <div className="geoControls" aria-label="ควบคุมแผนที่โลก">
            <span>ลากเพื่อเลื่อน · {camera.zoom.toFixed(1)}×</span>
            <button
              className="button compact"
              aria-label="ซูมแผนที่เข้า"
              disabled={camera.zoom >= 4}
              onClick={() => zoomBy(0.5)}
            >
              +
            </button>
            <button
              className="button compact"
              aria-label="ซูมแผนที่ออก"
              disabled={camera.zoom <= 1}
              onClick={() => zoomBy(-0.5)}
            >
              −
            </button>
            <button className="button compact" onClick={fit}>
              ดูทั้งโลก
            </button>
          </div>
          {located === 0 && !pending && (
            <p className="geoNote">
              ไม่มีพิกัดในชุดนี้ · IP ภายในหรือ IP ทดสอบจะไม่แสดงหมุด
            </p>
          )}
        </div>
        <div className="geoListSection">
          <div className="geoListHeader">
            <span>เลือก IP เพื่อดูตำแหน่ง</span>
            {focused && (
              <button className="textButton" onClick={() => setFocused(null)}>
                ดูทั้งชุด
              </button>
            )}
          </div>
          <div className="geoIpList">
            {visibleRows.map((row) => (
              <button
                type="button"
                key={row.ip}
                aria-label={`ดูตำแหน่ง IP ${row.ip}`}
                aria-pressed={selectedIp === row.ip}
                onClick={() => {
                  onSelectIp(row.ip);
                  setFocused(null);
                  focusGeo(row.geo);
                }}
              >
                <b className="mono">{row.ip}</b>
                <span>
                  {row.geo ? row.geo.country || row.geo.note : "กำลังค้นหา…"}
                  {row.geo?.country && (
                    <small>
                      {row.geo.sample
                        ? "พิกัดสาธิต"
                        : row.geo.city || "ตำแหน่งโดยประมาณ"}
                    </small>
                  )}
                </span>
                <Badge
                  color={row.geo?.latitude !== undefined ? "good" : "quiet"}
                >
                  {row.geo?.latitude !== undefined
                    ? "มีพิกัด"
                    : row.geo
                      ? "ไม่มีพิกัด"
                      : "กำลังโหลด"}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="geoNote">
        GeoIP เป็นตำแหน่งประเทศ / เมืองโดยประมาณ ·
        พิกัดเดียวกันรวมหมุดแล้วกดเจาะราย IP ได้
      </p>
    </div>
  );
}
