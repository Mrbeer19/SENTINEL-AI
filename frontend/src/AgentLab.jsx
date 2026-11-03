import React, { useEffect, useMemo, useRef, useState } from "react";
import { deriveFlow, FLOW_STAGES, STATE_TEXT } from "./agentFlowModel.js";
import { action, duration, targetIp, time, analysisOf } from "./lib.js";
import { Badge, Empty, Icon, Json, Toggle, FallbackNotice } from "./ui.jsx";
import Analysis from "./Analysis.jsx";
import Mascot from "./Mascot.jsx";

export default function AgentLab({ report, stale }) {
  const model = useMemo(() => deriveFlow(report), [report]),
    host = useRef(null),
    engine = useRef(null),
    playback = useRef(null);
  const [selected, choose] = useState(model.focus),
    [follow, setFollow] = useState(true),
    [tab, setTab] = useState("flow"),
    [ready, setReady] = useState("loading"),
    [attempt, retry] = useState(0),
    [freeze, setFreeze] = useState(false),
    [replay, setReplay] = useState(null),
    [reduced, setReduced] = useState(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  const selectRef = useRef(null);
  selectRef.current = (i) => {
    choose(i);
    setFollow(false);
  };
  useEffect(() => {
    if (follow && !replay) choose(model.focus);
  }, [model.focus, follow, replay]);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)"),
      change = () => setReduced(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    let canceled = false,
      scene;
    setReady("loading");
    import("./agentFlowScene.js")
      .then(({ createAgentScene }) => {
        if (canceled) return;
        scene = createAgentScene(host.current, {
          onSelect: (i) => selectRef.current(i),
          onFailure: () => {
            setReady("fallback");
            scene?.destroy();
            engine.current = null;
          },
        });
        engine.current = scene;
        setReady("ready");
      })
      .catch(() => {
        if (!canceled) setReady("fallback");
      });
    return () => {
      canceled = true;
      scene?.destroy();
      engine.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    engine.current?.setView({
      states: replay ? replay.frames[replay.index].states : model.states,
      selected,
      paused: freeze || stale,
      reduced,
      orbit: false,
      replay: !!replay,
      leg: replay ? replay.frames[replay.index].stage - 1 : -1,
      seconds: () => playback.current?.seconds || 0,
    });
  });
  useEffect(() => {
    let frame,
      last = performance.now(),
      paint = last;
    const tick = (now) => {
      const r = playback.current,
        delta = Math.min(0.12, (now - last) / 1000);
      last = now;
      if (r?.playing && !document.hidden) {
        r.seconds += delta;
        if (r.seconds >= 3.3) {
          r.seconds = 3.3;
          if (r.index < r.frames.length - 1) {
            r.index++;
            r.seconds = 0;
            choose(r.frames[r.index].stage);
          } else r.playing = false;
        }
        if (now - paint > 80 || !r.playing) {
          setReplay({ ...r });
          paint = now;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const hidden = () => {
      if (document.hidden && playback.current) {
        playback.current.playing = false;
        setReplay({ ...playback.current });
      }
    };
    frame = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  const live = () => {
    playback.current = null;
    setReplay(null);
    setFollow(true);
    choose(model.focus);
  };
  const play = () => {
    setFreeze(false);
    if (
      !replay ||
      (replay.index === replay.frames.length - 1 && replay.seconds >= 3.3)
    ) {
      const r = { frames: model.frames, index: 1, seconds: 0, playing: true };
      playback.current = r;
      setReplay({ ...r });
      choose(r.frames[1].stage);
      setFollow(false);
    } else {
      playback.current.playing = !playback.current.playing;
      setReplay({ ...playback.current });
    }
  };
  const states = replay ? replay.frames[replay.index].states : model.states,
    s = FLOW_STAGES[selected],
    p = report.proposal,
    rows = model.rows[selected];
  const label = (i) =>
    replay
      ? i === 4 && states[i] === "active"
        ? "รอผู้ดูแล"
        : i === 5 && states[i] === "active"
          ? "รอคำขอใหม่"
          : STATE_TEXT[states[i]]
      : model.labels[i];
  return (
    <section className="agentLab">
      <div className="labHead">
        <Toggle
          label="ข้อมูลการวิเคราะห์"
          value={tab}
          onChange={setTab}
          items={[
            ["flow", "เส้นทาง Agent"],
            ["analysis", "ผลวิเคราะห์"],
            ["tools", `เครื่องมือ / ${report.trace?.length || 0}`],
          ]}
        />
        <Badge color={stale ? "warn" : replay ? "warn" : "good"}>
          {stale ? "ข้อมูลที่บันทึกล่าสุด" : replay ? "REPLAY" : "SERVER TRACE"}
        </Badge>
      </div>
      {tab !== "analysis" && <FallbackNotice report={report} />}
      <div hidden={tab !== "flow"}>
        <div className="stageRail" role="group" aria-label="เลือกขั้นตอน">
          {FLOW_STAGES.map((s, i) => (
            <button
              key={s.key}
              aria-pressed={selected === i}
              className={states[i]}
              onClick={() => selectRef.current(i)}
            >
              <small>0{i + 1}</small>
              <b>{s.title}</b>
              <span>{label(i)}</span>
            </button>
          ))}
        </div>
        <div className="labBody">
          <div className="labViewport">
            <div
              className="labCanvas"
              ref={host}
              role="img"
              aria-label="กราฟลูกบอลสามมิติ แสดงการส่งต่อระหว่าง Agent"
            />
            {ready === "loading" && (
              <span className="canvasStatus">กำลังโหลด 3D…</span>
            )}
            {ready === "fallback" && (
              <div className="canvasStatus">
                <p>เปิด 3D ไม่ได้ ใช้รายการขั้นตอนด้านบนเพื่อตรวจข้อมูลได้</p>
                <button className="button" onClick={() => retry((n) => n + 1)}>
                  ลองเปิดใหม่
                </button>
              </div>
            )}
            <div className="canvasActions">
              <button
                className="button compact"
                onClick={() => engine.current?.resetCamera(false)}
                aria-label="คืนมุมกล้อง"
              >
                <Icon name="refresh" size={14} />
              </button>
              <button
                className="button compact"
                onClick={() => engine.current?.resetCamera(true)}
              >
                มองด้านหน้า
              </button>
              <button
                className="button compact"
                aria-pressed={freeze}
                onClick={() => {
                  setFreeze(!freeze);
                  if (playback.current) {
                    playback.current.playing = false;
                    setReplay({ ...playback.current });
                  }
                }}
              >
                {freeze ? "เปิดการเคลื่อนไหว" : "หยุดภาพ"}
              </button>
            </div>
            <small className="canvasCaption">
              ส่งต่อจากซ้ายไปขวา · ลากเพื่อหมุน · เลื่อนเพื่อซูม
            </small>
          </div>
          <aside className="stageDetail">
            <div className="eyebrow">STAGE / 0{selected + 1}</div>
            <h2>{s.title}</h2>
            <Badge
              color={
                states[selected] === "done"
                  ? "good"
                  : states[selected] === "fail"
                    ? "bad"
                    : states[selected] === "active"
                      ? "warn"
                      : "quiet"
              }
            >
              {label(selected)}
            </Badge>
            {selected === 4 && tab === "flow" && analysisOf(report)?.explanation_th ? (
              <div className="agentSpeech">
                <header><Mascot pose="laptop" size={80} /><h3>AI assessment</h3></header>
                <p className="speechBubble">{analysisOf(report).explanation_th}</p>
              </div>
            ) : <p>{s.note}</p>}
            {replay && (
              <p className="hint">
                สถานะในกราฟเป็นจุดย้อนหลัง รายละเอียดคือหลักฐานฉบับล่าสุด
              </p>
            )}
            {selected === 0 ? (
              <dl className="facts">
                <div>
                  <dt>ต้นทาง</dt>
                  <dd className="mono">{report.source_ip}</dd>
                </div>
                <div>
                  <dt>จำนวนเหตุการณ์</dt>
                  <dd>{report.event_count}</dd>
                </div>
                <div>
                  <dt>ตรวจพบ</dt>
                  <dd>{time(report.created_at)}</dd>
                </div>
              </dl>
            ) : selected < 4 ? (
              <div className="traceSnippets">
                {rows.length ? (
                  rows.slice(-5).map((r, i) => (
                    <div key={r.id ?? i}>
                      <span>
                        {r.operation === "chat"
                          ? "model call"
                          : r.operation === "invoke_agent"
                            ? "จบขั้นตอน"
                            : r.tool}
                      </span>
                      <small>
                        {r.status} · {r.duration_ms ?? "—"} ms
                      </small>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    {states[selected] === "skip"
                      ? "ไม่ได้ใช้ในรอบนี้"
                      : "รอบันทึกจากเซิร์ฟเวอร์"}
                  </p>
                )}
              </div>
            ) : selected === 4 ? (
              <>
                {p ? (
                  <>
                    <dl className="facts">
                      <div>
                        <dt>ข้อเสนอ</dt>
                        <dd>{action(p.action)}</dd>
                      </div>
                      <div>
                        <dt>เป้าหมาย</dt>
                        <dd className="mono">{targetIp(p)}</dd>
                      </div>
                      <div>
                        <dt>ระยะเวลา</dt>
                        <dd>{duration(p.duration_seconds)}</dd>
                      </div>
                    </dl>
                    <a className="button primary" href={`#/approvals/${p.id}`}>
                      {p.status === "pending"
                        ? "ตรวจและตัดสินใจ"
                        : "ดูการตัดสินใจ"}
                      <Icon name="arrow" size={15} />
                    </a>
                  </>
                ) : (
                  <Empty>ไม่มีข้อเสนอบล็อก</Empty>
                )}
              </>
            ) : (
              <p>
                {model.states[5] === "done"
                  ? "มีคำขอใหม่ถูกปฏิเสธด้วยกฎป้องกันแล้ว"
                  : model.states[5] === "active"
                    ? "บล็อกแล้ว รอคำขอใหม่จาก IP นี้เพื่อยืนยันผล"
                    : "ยังไม่มีหลักฐานยืนยันผลการบล็อก"}
              </p>
            )}
            <button className="textButton follow" onClick={live}>
              {replay
                ? "กลับสถานะปัจจุบัน"
                : follow
                  ? "กำลังติดตามขั้นตอนล่าสุด"
                  : "ติดตามขั้นตอนล่าสุด"}
              <Icon name="arrow" size={14} />
            </button>
          </aside>
        </div>
        <div className="playback">
          <button
            className="button"
            disabled={model.frames.length < 2}
            onClick={play}
          >
            <Icon name={replay?.playing ? "pause" : "play"} size={14} />
            {replay?.playing
              ? "หยุดชั่วคราว"
              : replay
                ? "เล่นต่อ"
                : "เล่นย้อนหลัง"}
          </button>
          <label>
            <span className="sr">จุดบันทึกย้อนหลัง</span>
            <input
              type="range"
              min="0"
              max={Math.max(1, (replay?.frames || model.frames).length - 1)}
              value={replay?.index || 0}
              disabled={!replay}
              onChange={(e) => {
                const r = {
                  ...playback.current,
                  index: Number(e.target.value),
                  seconds: 0,
                  playing: false,
                };
                playback.current = r;
                setReplay({ ...r });
                choose(r.frames[r.index].stage);
              }}
            />
          </label>
          <span>
            {replay
              ? `${replay.index + 1} / ${replay.frames.length}`
              : `${model.frames.length} จุดบันทึก`}
          </span>
          {replay && (
            <button className="textButton" onClick={live}>
              LIVE
            </button>
          )}
        </div>
        <p className="labFootnote">
          {replay
            ? replay.frames[replay.index].label
            : "สถานะจากเซิร์ฟเวอร์ · ไม่ใช้เวลาเคลื่อนไหวตัดสินว่างานเสร็จ"}
          <small>
            Replay ไม่ส่งคำสั่งวิเคราะห์หรืออนุมัติ ·
            จังหวะเคลื่อนไหวเป็นภาพประกอบ
          </small>
        </p>
      </div>
      {tab === "analysis" && (
        <div className="labTabContent">
          <Analysis report={report} />
        </div>
      )}
      {tab === "tools" && (
        <div className="labTabContent">
          {report.trace?.length ? (
            report.trace.map((t, i) => (
              <article className="toolRecord" key={t.id ?? i}>
                <header>
                  <b>{t.tool || t.agent}</b>
                  <Badge value={t.status} />
                  <time>{time(t.created_at)}</time>
                  <span>{t.duration_ms} ms</span>
                </header>
                <Json title="Input" value={t.input} />
                <Json title="Output" value={t.output} />
              </article>
            ))
          ) : (
            <Empty>ยังไม่มีการเรียกเครื่องมือ</Empty>
          )}
        </div>
      )}
    </section>
  );
}
