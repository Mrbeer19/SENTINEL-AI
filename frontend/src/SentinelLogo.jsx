import React from "react";
export function SentinelMark() {
  return (
    <svg className="sentinelMark" viewBox="0 0 80 48" aria-hidden="true">
      <ellipse
        cx="38"
        cy="24"
        rx="34"
        ry="12"
        transform="rotate(-22 38 24)"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle cx="65" cy="14" r="5" fill="var(--accent)" />
    </svg>
  );
}
export default function SentinelLogo() {
  return (
    <svg
      className="sentinelLogo"
      viewBox="0 0 310 55"
      role="img"
      aria-label="SENTINEL / AI"
    >
      <ellipse
        cx="38"
        cy="27"
        rx="34"
        ry="11"
        transform="rotate(-22 38 27)"
        fill="none"
        stroke="#e3eaf0"
        strokeWidth="3"
      />
      <circle cx="65" cy="17" r="5" fill="var(--accent)" />
      <text
        x="87"
        y="36"
        fill="var(--ink)"
        fontFamily="Arial,sans-serif"
        fontSize="27"
        fontWeight="700"
      >
        SENTINEL / AI
      </text>
    </svg>
  );
}
