import React from "react";
import { kind, number } from "./lib.js";
import { typeKey } from "./ui.jsx";

export default function AttacksByType({ incidents }) {
  const counts = new Map();
  for (const incident of incidents)
    counts.set(incident.kind, (counts.get(incident.kind) || 0) + 1);
  let x = 0;
  return (
    <section className="attacksByType" aria-label="Attacks by type">
      <header><h3>Attacks by type</h3><small>จำนวนเหตุการณ์ที่โหลด · {number(incidents.length)}</small></header>
      <svg viewBox="0 0 1000 14" preserveAspectRatio="none" role="img" aria-label={incidents.length ? [...counts].map(([name, count]) => `${kind(name)} ${count}`).join(" · ") : "ยังไม่มีเหตุการณ์"}>
        <rect width="1000" height="14" className="typeBarTrack" />
        {[...counts].map(([name, count]) => {
          const width = count / incidents.length * 1000, left = x;
          x += width;
          return <rect key={name} x={left} y="0" width={width} height="14" data-type={typeKey(name)} className="typeBarSegment"><title>{kind(name)} · {count}</title></rect>;
        })}
      </svg>
      {incidents.length ? <ul>{[...counts].map(([name, count]) => <li key={name} data-type={typeKey(name)}><i aria-hidden="true" /><span className="typeName">{kind(name)}</span><b>{number(count)}</b></li>)}</ul> : <p>ยังไม่มีเหตุการณ์ในข้อมูลที่โหลด</p>}
    </section>
  );
}
