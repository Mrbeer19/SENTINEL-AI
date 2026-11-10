import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { resolveGeo } from "./geo.js";

export default forwardRef(function PosterGlobe(
  {
    page = "overview",
    sources = [],
    selectedIp,
    onSelect,
    onZoom = () => {},
    onLocations = () => {},
  },
  ref,
) {
  const canvas = useRef(null),
    host = useRef(null),
    engine = useRef(null),
    callbacks = useRef({ onZoom, onSelect, onLocations });
  callbacks.current = { onZoom, onSelect, onLocations };
  const [points, setPoints] = useState([]),
    [locations, setLocations] = useState({}),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [cluster, setCluster] = useState(null);
  const sourceRef = useRef(sources);
  sourceRef.current = sources;
  const ids = [
    ...new Set(
      [...sources.slice(0, 24).map((s) => s.ip), selectedIp].filter(Boolean),
    ),
  ].join("|");
  useEffect(() => {
    let canceled = false;
    for (const ip of ids.split("|").filter(Boolean))
      resolveGeo(ip).then((geo) => {
        if (!canceled) setLocations((old) => ({ ...old, [ip]: geo }));
      });
    return () => {
      canceled = true;
    };
  }, [ids]);
  useEffect(() => {
    callbacks.current.onLocations(locations);
  }, [locations]);
  useEffect(() => {
    let canceled = false,
      observer;
    import("./posterGlobeScene.js")
      .then(({ createPosterGlobe }) => {
        if (canceled) return;
        try {
          engine.current = createPosterGlobe(canvas.current, {
            onMarkers: setPoints,
            onZoom: (value) => callbacks.current.onZoom(value),
            onSpin: () => {},
            onFailure: () => {
              engine.current?.destroy();
              engine.current = null;
              setFailed(true);
            },
          });
          observer = new ResizeObserver(([entry]) => {
            if (entry.contentRect.width > 0)
              engine.current?.resize(
                entry.contentRect.width,
                entry.contentRect.height,
              );
          });
          observer.observe(host.current);
          setReady(true);
        } catch {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      canceled = true;
      observer?.disconnect();
      engine.current?.destroy();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.pose(page);
  }, [page, ready]);
  useEffect(() => {
    engine.current?.markers(
      [
        ...new Map(
          [...sources.slice(0, 23), sources.find((s) => s.ip === selectedIp)]
            .filter(Boolean)
            .map((s) => [s.ip, s]),
        ).values(),
      ]
        .filter((s) => locations[s.ip]?.latitude !== undefined)
        .map((s) => ({ ...s, ...locations[s.ip] })),
    );
  }, [sources, locations, selectedIp, ready]);
  useEffect(() => {
    if (page === "overview") engine.current?.focus(locations[selectedIp]);
  }, [page, selectedIp, locations[selectedIp], ready]);
  useImperativeHandle(
    ref,
    () => ({
      zoom: (delta) => engine.current?.zoom(delta),
      reset: () => engine.current?.reset(),
      toggle: () => engine.current?.toggle(),
      diagnostics: () => engine.current?.diagnostics(),
    }),
    [],
  );
  const hidden = page === "approvals";
  const groups = new Map();
  for (const p of points.filter((p) => p.visible)) {
    const key = `${p.latitude.toFixed(3)}:${p.longitude.toFixed(3)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return (
    <div
      ref={host}
      className={`posterWorld ${page === "overview" ? "isOverview" : ""} ${page === "login" ? "isLogin" : ""} ${hidden ? "isHidden" : ""}`}
      aria-hidden={hidden || undefined}
    >
      {!failed ? (
        <canvas
          ref={canvas}
          tabIndex={hidden ? -1 : 0}
          aria-label="ลูกโลกสามมิติ ลากเพื่อหมุน ใช้ลูกศรหรือปุ่มบวกลบเพื่อซูม"
        />
      ) : (
        <div className="globeFallback">
          มุมมอง 3D ไม่พร้อม · เลือกอ่านต้นทางใน Sources ได้
        </div>
      )}
      {page === "overview" &&
        [...groups.entries()].map(([key, group]) => {
          const p = group[0];
          return (
            <div
              key={key}
              className="worldPinGroup"
              style={{ left: p.x, top: p.y }}
            >
              <button
                type="button"
                className={`worldPin ${group.some((p) => p.incident) ? "threat" : ""} ${group.some((p) => selectedIp === p.ip) ? "selected" : ""}`}
                onClick={() =>
                  group.length === 1
                    ? callbacks.current.onSelect?.(p.ip)
                    : setCluster(cluster === key ? null : key)
                }
                aria-label={
                  group.length > 1
                    ? `เลือกกลุ่ม ${group.length} ต้นทางที่ ${p.city || p.country}`
                    : `เลือกต้นทาง ${p.ip} ${p.city || p.country}`
                }
              >
                <i />
                {group.length > 1 ? `${group.length} sources` : p.ip}
              </button>
              {cluster === key && group.length > 1 && (
                <div className="worldCluster">
                  {group.map((p) => (
                    <button
                      key={p.ip}
                      onClick={() => {
                        callbacks.current.onSelect?.(p.ip);
                        setCluster(null);
                      }}
                    >
                      {p.ip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
});
