import React, { useEffect, useRef, useState } from "react";

const stillMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Login card that tilts toward the pointer, lights its edge under the cursor
// and answers a press with a ripple. Purely visual; the form inside is unchanged.
export function TiltStage({ children }) {
  const stage = useRef(null),
    [ripples, setRipples] = useState([]),
    [pressed, setPressed] = useState(false);
  useEffect(() => {
    const node = stage.current;
    if (!node || stillMotion()) return;
    let frame = 0,
      last = null;
    const apply = () => {
      frame = 0;
      if (!last) return;
      const r = node.getBoundingClientRect(),
        x = (last.clientX - r.left) / r.width,
        y = (last.clientY - r.top) / r.height,
        cx = Math.max(-1, Math.min(1, x * 2 - 1)),
        cy = Math.max(-1, Math.min(1, y * 2 - 1));
      node.style.setProperty("--ry", `${(cx * 8).toFixed(2)}deg`);
      node.style.setProperty("--rx", `${(-cy * 8).toFixed(2)}deg`);
      node.style.setProperty("--px", cx.toFixed(3));
      node.style.setProperty("--py", cy.toFixed(3));
      node.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      node.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    };
    const move = (e) => {
      if (e.pointerType === "touch") return;
      last = e;
      frame ||= requestAnimationFrame(apply);
    };
    const reset = () => {
      last = null;
      for (const p of ["--rx", "--ry"]) node.style.setProperty(p, "0deg");
      for (const p of ["--px", "--py"]) node.style.setProperty(p, "0");
    };
    window.addEventListener("pointermove", move);
    document.documentElement.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
    };
  }, []);
  const poke = (e) => {
    setPressed(true);
    if (stillMotion()) return;
    const r = e.currentTarget.getBoundingClientRect(),
      id = `${e.timeStamp}-${e.clientX}`;
    setRipples((list) => [
      ...list.slice(-3),
      { id, x: e.clientX - r.left, y: e.clientY - r.top },
    ]);
  };
  const release = () => setPressed(false);
  return (
    <div
      className="loginStage"
      ref={stage}
      data-pressed={pressed || undefined}
      onPointerDown={poke}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
    >
      <i className="loginCorner topLeft" aria-hidden="true" />
      <i className="loginCorner bottomRight" aria-hidden="true" />
      {children}
      <span className="loginFx" aria-hidden="true">
        {ripples.map((p) => (
          <i
            key={p.id}
            className="loginRipple"
            style={{ left: p.x, top: p.y }}
            onAnimationEnd={() =>
              setRipples((list) => list.filter((q) => q.id !== p.id))
            }
          />
        ))}
      </span>
    </div>
  );
}

// Drifting network of nodes behind the login. Nodes near the pointer step aside
// and link to it; a click sends out a scan ring that pushes them away.
export function NetworkBackdrop() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas.getContext("2d"),
      still = stillMotion(),
      pointer = { x: -9999, y: -9999 },
      rings = [];
    let w = 0,
      h = 0,
      nodes = [],
      frame = 0,
      colors = {};
    const readColors = () => {
      const cs = getComputedStyle(canvas);
      colors = {
        node: cs.getPropertyValue("--net-node").trim() || "#b7a4f4",
        line: cs.getPropertyValue("--net-line").trim() || "#8f7cff",
        hot: cs.getPropertyValue("--net-hot").trim() || "#f2eeff",
      };
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.max(36, Math.min(130, (w * h) / 11000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.6 + 1.2,
        hub: Math.random() < 0.09,
      }));
      if (still) draw();
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const link = Math.min(150, Math.max(100, w / 10));
      for (const ring of rings) ring.r += 6;
      while (rings.length && rings[0].r > Math.max(w, h)) rings.shift();
      for (const n of nodes) {
        if (!still) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > w) n.vx *= -1;
          if (n.y < 0 || n.y > h) n.vy *= -1;
        }
        const dx = n.x - pointer.x,
          dy = n.y - pointer.y,
          d = Math.hypot(dx, dy);
        if (d > 0 && d < 110) {
          n.x += (dx / d) * 0.9;
          n.y += (dy / d) * 0.9;
        }
        for (const ring of rings) {
          const rx = n.x - ring.x,
            ry = n.y - ring.y,
            rd = Math.hypot(rx, ry);
          if (rd > 0 && Math.abs(rd - ring.r) < 14) {
            n.x += (rx / rd) * 3;
            n.y += (ry / rd) * 3;
          }
        }
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j],
            d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < link) {
            ctx.globalAlpha = (1 - d / link) * 0.7;
            ctx.strokeStyle = colors.line;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        const dp = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        if (dp < 190) {
          ctx.globalAlpha = (1 - dp / 190) * 0.85;
          ctx.strokeStyle = colors.hot;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
      }
      for (const n of nodes) {
        ctx.globalAlpha = n.hub ? 1 : 0.9;
        ctx.fillStyle = n.hub ? colors.hot : colors.node;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.hub ? n.r + 1.8 : n.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const ring of rings) {
        ctx.globalAlpha = Math.max(0, 1 - ring.r / 420) * 0.8;
        ctx.strokeStyle = colors.hot;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      frame = still || document.hidden ? 0 : requestAnimationFrame(draw);
    };
    const move = (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (still) draw();
    };
    const away = () => {
      pointer.x = pointer.y = -9999;
    };
    const ping = (e) => {
      if (!still && !e.target.closest(".loginStage, button, a, input"))
        rings.push({ x: e.clientX, y: e.clientY, r: 0 });
    };
    const wake = () => {
      if (!document.hidden && !still && !frame) frame = requestAnimationFrame(draw);
    };
    readColors();
    const sizer = new ResizeObserver(resize),
      themer = new MutationObserver(() => {
        readColors();
        if (still) draw();
      });
    sizer.observe(canvas);
    themer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", ping);
    document.documentElement.addEventListener("pointerleave", away);
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      cancelAnimationFrame(frame);
      sizer.disconnect();
      themer.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", ping);
      document.documentElement.removeEventListener("pointerleave", away);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  return <canvas className="loginNetwork" ref={ref} aria-hidden="true" />;
}
