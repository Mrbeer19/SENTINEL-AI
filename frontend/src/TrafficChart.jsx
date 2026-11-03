import React, { useEffect, useId, useRef, useState } from "react";
import { number, time } from "./lib.js";
import AttacksByType from "./AttacksByType.jsx";

export default function TrafficChart({ traffic, now, incidents = [] }) {
  const uid = useId().replace(/:/g, ""),
    box = useRef(null),
    [size, setSize] = useState({ width: 640, height: 300 }),
    [active, setActive] = useState(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(250, entry.contentRect.width),
        height: Math.max(200, entry.contentRect.height),
      }),
    );
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const start = Math.floor(now / 60000) * 60000 - 14 * 60000,
    rows = Array.from({ length: 15 }, () => ({ allowed: 0, denied: 0 }));
  for (const t of traffic) {
    const i = Math.floor((Date.parse(t.created_at) - start) / 60000);
    if (i >= 0 && i < 15)
      rows[i][t.decision === "denied" ? "denied" : "allowed"]++;
  }
  const allowed = rows.reduce((n, r) => n + r.allowed, 0),
    denied = rows.reduce((n, r) => n + r.denied, 0),
    total = allowed + denied,
    peak = Math.max(...rows.map((r) => r.allowed + r.denied)),
    max = Math.max(2, Math.ceil(peak / 2) * 2),
    left = 30,
    right = size.width - 12,
    top = 20,
    bottom = size.height - 30,
    x = (i) => left + (i * (right - left)) / 14,
    y = (n) => bottom - (n / max) * (bottom - top),
    points = (key) =>
      rows
        .map(
          (r, i) =>
            `${x(i)},${y(key === "total" ? r.allowed + r.denied : r.allowed)}`,
        )
        .join(" "),
    hover = active !== null ? rows[active] : null;
  return (
    <div className="traffic">
      <div className="trafficHeader">
        <strong>
          {number(total)}
          <small>คำขอ / 15 นาที</small>
        </strong>
        <span>
          <i className="dot" />
          {number(allowed)} ผ่าน
        </span>
        <span>
          <i className="dot red" />
          {number(denied)} ปฏิเสธ
        </span>
      </div>
      <div className="trafficPlot" ref={box}>
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`คำขอ ${total} รายการใน 15 นาทีล่าสุด ผ่าน ${allowed} ปฏิเสธ ${denied}`}
          onPointerLeave={() => setActive(null)}
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
                opacity=".45"
              />
            </pattern>
            <mask
              id={`${uid}denied`}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={size.width}
              height={size.height}
            >
              <rect
                width={size.width}
                height={size.height}
                fill="var(--mask-visible)"
              />
              <polygon
                points={`${left},${bottom} ${points("allowed")} ${right},${bottom}`}
                fill="var(--mask-hidden)"
              />
            </mask>
          </defs>
          <rect
            x={left}
            y={top}
            width={right - left}
            height={bottom - top}
            fill={`url(#${uid}grid)`}
          />
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <path
                d={`M${left - 4} ${y(max * t)}H${right} M${left} ${y(max * t) - 3}v6`}
                className="plotGrid"
              />
              <text x="0" y={y(max * t) + 4}>
                {Math.round(max * t)}
              </text>
            </g>
          ))}
          <polygon
            points={`${left},${bottom} ${points("total")} ${right},${bottom}`}
            className="plotDeniedArea"
            mask={`url(#${uid}denied)`}
          />
          <polygon
            points={`${left},${bottom} ${points("allowed")} ${right},${bottom}`}
            className="plotArea"
          />
          <polyline points={points("total")} className="plotTotalLine" />
          <polyline points={points("allowed")} className="plotLine" />
          {rows.map((r, i) => (
            <g key={i}>
              <rect
                x={x(i) - (right - left) / 28}
                y={top - 10}
                width={(right - left) / 14}
                height={bottom - top + 20}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
              />
              <circle
                tabIndex="0"
                role="img"
                aria-label={`${time(start + i * 60000)} ผ่าน ${r.allowed} ปฏิเสธ ${r.denied}`}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onPointerEnter={() => setActive(i)}
                cx={x(i)}
                cy={y(r.allowed + r.denied)}
                r={active === i ? 4 : 2.5}
              >
                <title>
                  {time(start + i * 60000)} · ผ่าน {r.allowed} ปฏิเสธ {r.denied}
                </title>
              </circle>
            </g>
          ))}
          {[0, 7, 14].map((i) => (
            <path
              key={`tick-${i}`}
              d={`M${x(i)} ${bottom}v4`}
              className="plotAxisTick"
            />
          ))}
          {[0, 7, 14].map((i) => (
            <text
              key={i}
              x={x(i)}
              y={size.height - 7}
              textAnchor={i === 0 ? "start" : i === 14 ? "end" : "middle"}
            >
              {time(start + i * 60000)}
            </text>
          ))}
          {hover && (
            <g className="trafficTooltip" pointerEvents="none">
              <path
                d={`M${x(active)} ${top}V${bottom}`}
                className="plotCursor"
              />
              <g
                transform={`translate(${Math.max(left, Math.min(right - 160, x(active) - 80))},${top})`}
              >
                <rect width="160" height="55" rx="4" />
                <text x="10" y="20">
                  {time(start + active * 60000)}
                </text>
                <text x="10" y="40">
                  ผ่าน {hover.allowed} · ปฏิเสธ {hover.denied}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>
      <div className="trafficInsights">
        <div>
          <small>สูงสุดต่อนาที</small>
          <b>
            {number(peak)} <em>คำขอ</em>
          </b>
        </div>
        <div>
          <small>อัตราปฏิเสธ</small>
          <b>
            {total ? ((denied / total) * 100).toFixed(1) : "0.0"}
            <em>%</em>
          </b>
        </div>
        <span>
          <i className="legendLine" />
          ผ่าน <i className="legendLine total" />
          ปฏิเสธ (แถบด้านบน)
        </span>
      </div>
      <AttacksByType incidents={incidents} />
    </div>
  );
}
