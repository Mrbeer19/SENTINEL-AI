import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { number } from "./lib.js";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)"), change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return reduced;
}

export function MotionNumber({ value, className }) {
  const reduced = useReducedMotion(), first = useRef(true), previous = useRef(value), shown = useRef(value);
  const [display, setDisplay] = useState(value), [signal, setSignal] = useState(0);
  useEffect(() => {
    const old = previous.current;
    previous.current = value;
    if (first.current || reduced || old === value) {
      first.current = false;
      shown.current = value;
      setDisplay(value);
      return;
    }
    const from = shown.current,
      duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dur-count")) || 400;
    let frame, start;
    setSignal((s) => s + 1);
    const tick = (now) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / duration);
      shown.current = Math.round(from + (value - from) * (1 - Math.pow(1 - progress, 3)));
      setDisplay(shown.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  const formatted = number(display).padStart(2, "0");
  return (
    <strong className={`motionNumber ${className || ""}`} aria-label={number(value).padStart(2, "0")}>
      <span className="motionActual">{number(value).padStart(2, "0")}</span>
      <span aria-hidden="true">{formatted}</span>
      {!reduced && signal > 0 && <span key={signal} className="numberFlash" aria-hidden="true">{formatted}</span>}
    </strong>
  );
}

export function useNavIndicator(active) {
  const rail = useRef(null);
  useLayoutEffect(() => {
    const node = rail.current;
    if (!node) return;
    const item = node.querySelector('[aria-current="page"]');
    if (!item) return;
    const position = () => {
      node.style.setProperty("--nav-x", `${item.offsetLeft}px`);
      node.style.setProperty("--nav-y", `${item.offsetTop}px`);
      node.style.setProperty("--nav-height", `${item.offsetHeight}px`);
      node.dataset.indicatorReady = "true";
    };
    const observer = new ResizeObserver(position);
    observer.observe(node);
    observer.observe(item);
    position();
    return () => observer.disconnect();
  }, [active]);
  return rail;
}

export function RefreshMotion({ busy, children }) {
  const [turn, setTurn] = useState(0), previous = useRef(false);
  useEffect(() => {
    if (busy && !previous.current) setTurn((v) => v + 1);
    previous.current = busy;
  }, [busy]);
  return <span key={turn} className={turn ? "refreshMotion" : "refreshIdle"} aria-hidden="true">{children}</span>;
}

export function useRowSignals(rows, keyField, enabled) {
  const reduced = useReducedMotion(), known = useRef(null);
  const [arrivals, setArrivals] = useState(new Set());
  const signature = rows.map((r) => r[keyField]).join("|");
  useLayoutEffect(() => {
    const current = new Set(rows.map((r) => r[keyField]));
    if (known.current && enabled && !reduced) {
      const fresh = [...current].filter((id) => !known.current.has(id));
      if (fresh.length) setArrivals((old) => new Set([...old, ...fresh]));
    }
    if (reduced || !enabled) setArrivals((old) => old.size ? new Set() : old);
    known.current = current;
  }, [signature, enabled, reduced]);
  const finish = (id) => setArrivals((old) => {
    if (!old.has(id)) return old;
    const next = new Set(old);
    next.delete(id);
    return next;
  });
  return [arrivals, finish];
}
