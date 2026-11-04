import React, { useEffect, useRef, useState } from "react";
import { isOpenIncident, kind, targetIp } from "./lib.js";

const poses = {
  pilot: { file: "sentinel-pilot", alt: "มาสคอตนักบิน Sentinel บนยานสำรวจ" },
  laptop: { file: "sentinel-laptop", alt: "มาสคอต Sentinel กำลังทำงานกับแล็ปท็อป" },
};

export default function Mascot({ pose = "pilot", size = 96, mood = "idle", loading = "lazy", className = "" }) {
  const asset = poses[pose] || poses.pilot;
  const edge = Math.max(1, Math.min(220, Number(size) || 96));
  const state = ["idle", "happy", "offline"].includes(mood) ? mood : "idle";
  return (
    <span className={`mascot mascot--${state} ${className}`} style={{ "--mascot-size": `${edge}px` }}>
      <img
        src={`/assets/${asset.file}-256.webp`}
        srcSet={`/assets/${asset.file}-256.webp 256w, /assets/${asset.file}-512.webp 512w`}
        sizes={`${edge}px`}
        width={edge}
        height={edge}
        loading={loading}
        decoding="async"
        alt={state === "offline" ? `${asset.alt} ระหว่างรอเชื่อมต่อเซิร์ฟเวอร์` : state === "happy" ? `${asset.alt} แสดงผลสำเร็จ` : asset.alt}
      />
    </span>
  );
}

export function MascotEmpty({ title, children, size = 120 }) {
  return (
    <div className="mascotEmpty">
      <Mascot size={size} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

const severe = (i) => ["CRITICAL", "HIGH"].includes(i.severity);

// Mascot that sits under the sidebar: it watches the pointer, hops on hover, and on
// click does a little jump-spin and reads out a tip from the live data. When a new
// pending proposal or HIGH/CRITICAL incident arrives, or the connection drops or
// returns, it jumps on its own and announces it. Items present at first load are
// treated as already seen, so opening the dashboard does not trigger alerts.
export function RailBuddy({ incidents = [], proposals = [], offline = false, onAsk, thinking = false }) {
  const root = useRef(null),
    [index, setIndex] = useState(0),
    [spin, setSpin] = useState(0),
    [talking, setTalking] = useState(false),
    [alert, setAlert] = useState(null),
    hush = useRef(null),
    seen = useRef(null),
    wasOffline = useRef(offline);
  const pending = proposals.filter((p) => p.status === "pending").length,
    open = incidents.filter(isOpenIncident).length;
  const speak = (ms) => {
    setTalking(true);
    clearTimeout(hush.current);
    hush.current = setTimeout(() => {
      setTalking(false);
      setAlert(null);
    }, ms);
  };
  const announce = (next) => {
    setAlert(next);
    setSpin((n) => n + 1);
    speak(8000);
  };
  useEffect(() => {
    const byId = new Map(incidents.map((i) => [i.id, i])),
      waiting = proposals.filter((p) => p.status === "pending"),
      serious = incidents.filter(severe),
      keys = [...waiting.map((p) => `p${p.id}`), ...serious.map((i) => `i${i.id}`)];
    if (!seen.current) {
      seen.current = new Set(keys);
      return;
    }
    const fresh = [
      ...waiting
        .filter((p) => !seen.current.has(`p${p.id}`))
        .map((p) => ({
          text: `${kind(byId.get(p.incident_id)?.kind)} จาก ${targetIp(p)} รอคุณตัดสินใจ`,
          href: `#/approvals/${p.id}`,
          link: "ตัดสินใจเลย",
          tone: "approval",
        })),
      ...serious
        .filter((i) => !seen.current.has(`i${i.id}`))
        .map((i) => ({
          text: `เจอ ${kind(i.kind)} จาก ${i.source_ip} · ${i.severity}`,
          href: `#/incident/${i.id}`,
          link: "เปิดหลักฐาน",
          tone: i.severity === "CRITICAL" ? "critical" : "high",
        })),
    ];
    keys.forEach((k) => seen.current.add(k));
    if (fresh.length) announce({ ...fresh[0], more: fresh.length - 1 });
  }, [incidents, proposals]);
  useEffect(() => {
    if (offline === wasOffline.current) return;
    wasOffline.current = offline;
    announce(
      offline
        ? { text: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ผมกำลังรอสัญญาณอยู่…", tone: "critical" }
        : { text: "กลับมาเชื่อมต่อแล้ว ข้อมูลเป็นชุดล่าสุด", tone: "ok" },
    );
  }, [offline]);
  const tips = offline
    ? [{ text: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ผมกำลังรอสัญญาณอยู่…" }]
    : [
        pending
          ? { text: `มี ${pending} ข้อเสนอรอคุณตัดสินใจ`, href: "#/approvals", link: "ไปที่ Approvals" }
          : { text: "ไม่มีข้อเสนอค้าง ทุกอย่างสงบดี" },
        open
          ? { text: `เหตุการณ์ที่ยังเปิดอยู่ ${open} รายการ`, href: "#/incidents", link: "เปิด Incidents" }
          : { text: "ยังไม่มีเหตุการณ์เปิดอยู่ ผมเฝ้าให้นะ" },
        { text: "ข้อเสนอจะยังไม่บล็อกใคร จนกว่าคุณจะกดอนุมัติ" },
        { text: "ค้นหา IP ได้จากช่องด้านบน แล้วกด ↵" },
      ];
  const tip = alert || tips[index % tips.length];
  useEffect(() => {
    const node = root.current;
    if (!node || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0,
      last = null;
    const look = () => {
      frame = 0;
      const r = node.getBoundingClientRect(),
        dx = last.clientX - (r.left + r.width / 2),
        dy = last.clientY - (r.top + r.height / 2),
        tilt = Math.max(-1, Math.min(1, dx / 500));
      node.style.setProperty("--look", `${(tilt * 12).toFixed(1)}deg`);
      node.style.setProperty("--look-x", `${(tilt * 6).toFixed(1)}px`);
      node.style.setProperty("--look-y", `${Math.max(-1, Math.min(1, dy / 500)) * 4}px`);
    };
    const move = (e) => {
      last = e;
      frame ||= requestAnimationFrame(look);
    };
    window.addEventListener("pointermove", move);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
    };
  }, []);
  useEffect(() => () => clearTimeout(hush.current), []);
  const poke = () => {
    // With Ask me on, the mascot opens the panel; alerts keep showing in the bubble and its link.
    if (onAsk) {
      setSpin((n) => n + 1);
      onAsk();
      return;
    }
    // Collapsed rail shows no bubble, so a click on an alert goes straight to it.
    if (alert?.href && !root.current?.closest(".nRail")?.hasAttribute("data-open")) {
      location.hash = alert.href.slice(1);
      setAlert(null);
      setTalking(false);
      return;
    }
    setSpin((n) => n + 1);
    if (alert) setAlert(null);
    else setIndex((n) => n + 1);
    speak(4500);
  };
  return (
    <div
      className="railBuddy"
      ref={root}
      data-talking={talking || undefined}
      data-thinking={thinking || undefined}
      data-alert={alert?.tone}
    >
      <div className="buddyCore">
      <div className="buddyBubble" role="status" aria-live="polite">
        {alert && <small className="buddyTag">{alert.tone === "ok" ? "อัปเดต" : "แจ้งเตือนใหม่"}</small>}
        <span>
          {tip.text}
          {tip.more > 0 && ` (+${tip.more} รายการ)`}
        </span>
        {tip.href && <a href={tip.href}>{tip.link} →</a>}
      </div>
      <button
        type="button"
        className="buddyButton"
        aria-label={
          onAsk
            ? `มาสคอต Sentinel · กดเพื่อเปิด Ask me${alert ? ` · ${alert.text}` : ""}`
            : alert
              ? `มาสคอต Sentinel · ${alert.text}`
              : "มาสคอต Sentinel · กดเพื่อฟังคำแนะนำถัดไป"
        }
        onClick={poke}
      >
        {alert && alert.tone !== "ok" && <span className="buddyBadge" aria-hidden="true" />}
        <span className="buddyLook">
          <span key={spin} className={spin ? "buddySpin" : undefined}>
            <span className="buddyBob">
              <Mascot pose={thinking ? "pilot" : "laptop"} size={176} loading="eager" mood={offline ? "offline" : pending ? "idle" : "happy"} />
            </span>
          </span>
        </span>
        <span className="buddyShadow" aria-hidden="true" />
      </button>
      </div>
    </div>
  );
}

// Placeholder layout while the first data load is in flight.
export function PageSkeleton() {
  return (
    <div className="pageSkeleton" role="status" aria-live="polite">
      <div className="skeletonStatus">
        <Mascot size={56} loading="eager" className="mascotFloat" />
        <span>กำลังโหลดข้อมูลศูนย์ควบคุม…</span>
      </div>
      <i className="skeleton skeletonHero" />
      <div className="skeletonKpis">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className="skeleton" />
        ))}
      </div>
      <div className="skeletonMain">
        <i className="skeleton" />
        <div>
          <i className="skeleton" />
          <i className="skeleton" />
        </div>
      </div>
    </div>
  );
}

export function ConnectionLoader() {
  return (
    <div className="connectionLoader" role="status">
      <Mascot size={120} loading="eager" className="mascotFloat" />
      <p>กำลังเชื่อมต่อศูนย์ควบคุม…</p>
    </div>
  );
}
