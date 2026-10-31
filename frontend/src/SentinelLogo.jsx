import React from "react";

export default function SentinelLogo() {
  return (
    <svg
      className="sentinelLogo"
      viewBox="0 0 270 66"
      role="img"
      aria-label="Sentinel AI"
    >
      <g fill="none" stroke="var(--accent)" strokeWidth="2.5">
        <circle cx="32" cy="32" r="17" />
        <ellipse
          cx="32"
          cy="32"
          rx="28"
          ry="10"
          transform="rotate(-32 32 32)"
        />
      </g>
      <path d="m29 19 10 1-12 14 9 1-13 13 5-13-7-1z" fill="var(--accent)" />
      <circle cx="54" cy="19" r="3.5" fill="var(--accent)" />
      <text
        x="73"
        y="34"
        fill="var(--text)"
        fontFamily="var(--font-ui)"
        fontWeight="600"
        fontSize="25"
        letterSpacing="1"
      >
        SENTINEL<tspan fill="var(--accent)"> AI</tspan>
      </text>
      <text
        x="74"
        y="50"
        fill="var(--text-dim)"
        fontFamily="var(--font-mono)"
        fontSize="8"
        letterSpacing="2.1"
      >
        SECURITY OPERATIONS
      </text>
    </svg>
  );
}
