import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { analysisOf, statusLabels, tone } from "./lib.js";
import { useRowSignals } from "./motion.jsx";
const TYPE_KEYS = Object.freeze({
  HTTP_AUTH_BRUTE_FORCE: "http-brute",
  SSH_BRUTE_FORCE: "ssh-brute",
  PORT_SCAN: "port-scan",
  TRAFFIC_ANOMALY: "anomaly",
  SUSPICIOUS_LOGIN: "login",
});
export const typeKey = (kind) => Object.hasOwn(TYPE_KEYS, kind) ? TYPE_KEYS[kind] : "login";
const paths = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  network: "M12 4v5M5 17l7-8 7 8M3 17h4v4H3zM17 17h4v4h-4zM10 2h4v4h-4z",
  incident: "M12 3L22 21H2zM12 9v5M12 17v1",
  trace: "M4 5h5v5H4zM15 14h5v5h-5zM9 7h7v7",
  check: "M5 12l4 4L19 6",
  shield: "M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z",
  report: "M5 3h10l4 4v14H5zM9 11h6M9 15h6",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  close: "M5 5l14 14M19 5L5 19",
  refresh: "M20 11a8 8 0 1 0-2 6M20 4v7h-7",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  moon: "M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10z",
  logout: "M9 4H4v16h5M14 8l5 4-5 4M8 12h11",
  play: "M7 4l13 8-13 8z",
  pause: "M8 4v16M16 4v16",
  expand: "M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11v6M12 7v1",
  download: "M12 3v12M7 10l5 5 5-5M4 20h16",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2",
  filter: "M4 5h16M7 12h10M10 19h4",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
};
export const RULE_ONLY_KINDS = Object.freeze([
  "HTTP_FLOOD",
  "WEB_SCAN",
  "HONEYPOT",
]);
export const isRuleOnly = (kind) => RULE_ONLY_KINDS.includes(kind);
export const isFallback = (report) =>
  !isRuleOnly(report?.kind) &&
  (report?.analysis_mode === "rule_fallback" ||
    analysisOf(report)?.confidence === null);
export function FallbackNotice({ report }) {
  return isFallback(report) ? (
    <div className="notice warn" role="status">
      ผลนี้มาจาก rule fallback ไม่ใช่ผลวิเคราะห์ของ AI
    </div>
  ) : null;
}
export function RuleOnlyNotice({ kind }) {
  return isRuleOnly(kind) ? (
    <div className="notice ruleOnlyNotice" role="status">
      ภัยเว็บตรวจด้วยกฎเฉพาะทาง · ยังต้องให้แอดมินอนุมัติ
    </div>
  ) : null;
}
export function formatEventPaths(value) {
  if (value == null || value === "") return "—";
  let paths = value;
  if (typeof paths === "string") {
    try {
      paths = JSON.parse(paths);
    } catch {
      return paths;
    }
  }
  if (Array.isArray(paths))
    return (
      paths
        .map((path) => (typeof path === "string" ? path : JSON.stringify(path)))
        .join("\n") || "—"
    );
  return typeof paths === "string" ? paths : JSON.stringify(paths);
}

export function Icon({ name, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.info} />
    </svg>
  );
}
export function Badge({ value, children, color }) {
  return (
    <span className={`tag ${color || tone(value)}`} data-status={value}>
      <i />
      {children || statusLabels[value] || value || "—"}
    </span>
  );
}
export function Panel({ title, code, actions, children, className = "" }) {
  return (
    <section className={`instrument ${className}`}>
      <header>
        <h2>
          <small>{code || "//"} </small>
          {title}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  );
}
export function Empty({ children = "ยังไม่มีข้อมูลในส่วนนี้" }) {
  return (
    <div className="empty">
      <Icon name="network" size={26} />
      <p>{children}</p>
    </div>
  );
}
export function Search({
  value,
  onChange,
  placeholder = "ค้นหา IP หมายเลข หรือประเภท…",
  label = "ค้นหารายการ",
}) {
  return (
    <label className="search">
      <Icon name="search" size={15} />
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          aria-label="ล้างการค้นหา"
          onClick={() => onChange("")}
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </label>
  );
}
export function Toggle({ items, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {items.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
export function Json({ value, title = "ข้อมูลฉบับเต็ม" }) {
  const [message, setMessage] = useState("");
  return (
    <details className="raw">
      <summary>{title}</summary>
      <button
        type="button"
        className="button compact"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              typeof value === "string"
                ? value
                : JSON.stringify(value, null, 2),
            );
            setMessage("คัดลอกแล้ว");
          } catch {
            setMessage("คัดลอกไม่ได้ เลือกข้อความด้านล่างเพื่อคัดลอก");
          }
        }}
      >
        คัดลอก
      </button>
      <span role="status">{message}</span>
      <pre>
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
export function Confirmation({
  title,
  children,
  confirmLabel = "ยืนยัน",
  danger = false,
  busy = false,
  disabled = false,
  onConfirm,
  onClose,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current.showModal();
    return () => prev?.focus?.();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirmDialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <header>
        <span>HUMAN CONFIRMATION</span>
        <button aria-label="ปิดหน้าตรวจทาน" disabled={busy} onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <h2 id="confirm-title">{title}</h2>
      <div className="confirmBody">{children}</div>
      <footer>
        <button className="button" disabled={busy} onClick={onClose}>
          กลับไปตรวจทาน
        </button>
        <button
          className={`button ${danger ? "danger" : "primary"}`}
          disabled={busy || disabled}
          onClick={onConfirm}
        >
          {busy ? "กำลังบันทึก…" : confirmLabel}
          <Icon name="arrow" size={16} />
        </button>
      </footer>
    </dialog>
  );
}
export function Table({
  rows,
  columns,
  onSelect,
  selected,
  flagged,
  keyField = "id",
  paginate = true,
  maxVisibleRows = 0,
  liveRows = false,
  emptyContent,
  typeRows = false,
}) {
  const [page, setPage] = useState(1);
  const viewport = useRef(null);
  const [arrivals, finishArrival] = useRowSignals(rows, keyField, liveRows);
  const signature = rows.map((r) => r[keyField]).join("|");
  useEffect(() => setPage(1), [signature]);
  const pages = Math.max(1, Math.ceil(rows.length / 20)),
    current = Math.min(page, pages),
    visible = paginate ? rows.slice((current - 1) * 20, current * 20) : rows;
  useLayoutEffect(() => {
    const container = viewport.current;
    if (!maxVisibleRows || !container) return;
    const table = container.querySelector("table");
    const fitRows = () => {
      const style = getComputedStyle(container),
        borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth),
        scrollbar = Math.max(0, container.offsetHeight - container.clientHeight - borders),
        bodyRows = [...table.tBodies[0].rows].slice(0, maxVisibleRows),
        height = table.tHead.getBoundingClientRect().height +
          bodyRows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
      container.style.maxHeight = `${Math.ceil(height + borders + scrollbar)}px`;
    };
    const observer = new ResizeObserver(fitRows);
    observer.observe(table);
    fitRows();
    return () => observer.disconnect();
  }, [maxVisibleRows, signature, current, visible.length]);
  return (
    <>
      {rows.length ? (
        <div
          className="dataScroll"
          ref={viewport}
          tabIndex={maxVisibleRows ? 0 : undefined}
          aria-label={maxVisibleRows ? "รายการบันทึก เลื่อนเพื่อดูเพิ่มเติม" : undefined}
        >
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr
                  key={r[keyField] ?? i}
                  className={selected === r[keyField] ? "selected" : ""}
                  data-threshold={
                    (flagged != null && flagged === r[keyField]) || undefined
                  }
                  data-result={r.result || r.decision || r.outcome}
                  data-type={typeRows ? typeKey(r.kind) : undefined}
                  data-arriving={arrivals.has(r[keyField]) || undefined}
                  onAnimationEnd={(e) => {
                    if (e.target === e.currentTarget && e.animationName === "recordIn") finishArrival(r[keyField]);
                  }}
                  tabIndex={onSelect ? 0 : undefined}
                  aria-selected={
                    onSelect ? selected === r[keyField] : undefined
                  }
                  onClick={onSelect ? () => onSelect(r) : undefined}
                  onKeyDown={(e) => {
                    if (
                      onSelect &&
                      e.target === e.currentTarget &&
                      ["Enter", " "].includes(e.key)
                    ) {
                      e.preventDefault();
                      onSelect(r);
                    }
                  }}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={
                        c.mono ||
                        [
                          "source_ip",
                          "ip",
                          "at",
                          "timestamp",
                          "created_at",
                          "expires_at",
                        ].includes(c.key)
                          ? "mono"
                          : undefined
                      }
                    >
                      {c.render ? c.render(r) : (r[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        emptyContent || <Empty>ไม่พบรายการที่ตรงกับเงื่อนไข</Empty>
      )}
      {paginate && rows.length > 20 && (
        <div className="pagination">
          <span>
            {rows.length} รายการ · หน้า {current} / {pages}
          </span>
          <div>
            <button
              className="button compact"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              ก่อนหน้า
            </button>
            <button
              className="button compact"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}
    </>
  );
}
