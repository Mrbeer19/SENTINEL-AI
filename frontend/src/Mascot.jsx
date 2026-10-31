import React from "react";

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

export function ConnectionLoader() {
  return (
    <div className="connectionLoader" role="status">
      <Mascot size={120} loading="eager" className="mascotFloat" />
      <p>กำลังเชื่อมต่อศูนย์ควบคุม…</p>
    </div>
  );
}
