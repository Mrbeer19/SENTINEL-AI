import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Icon, fmtTime, incId, kindName, actionLabel, durationText, targetIp } from '../ui.jsx'
import { FLOW_STAGES, STATE_TEXT, deriveFlow } from './agentFlowModel.js'
import './agent-flow-3d.css'

const duration = n => n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`
const CHECKPOINT_SECONDS = 3.3
const historyLabel = (state, i) => i === 4 && state === 'active' ? 'รอผู้ดูแล' : i === 4 && state === 'done' ? 'อนุมัติแล้ว' : i === 4 && state === 'fail' ? 'ปฏิเสธแล้ว' : i === 5 && state === 'active' ? 'รอคำขอใหม่' : i === 5 && state === 'done' ? 'ยืนยันผลแล้ว' : STATE_TEXT[state]

export default function AgentFlow3D({ report, stale = false }) {
  const model = useMemo(() => deriveFlow(report), [report])
  const host = useRef(null), engine = useRef(null), playback = useRef(null)
  const motionPaused = useRef(false)
  const [selected, setSelected] = useState(model.focus), [follow, setFollow] = useState(true)
  const [viewMode, setViewMode] = useState('3d'), [camera, setCamera] = useState('perspective')
  const [status, setStatus] = useState('loading'), [attempt, setAttempt] = useState(0)
  const [paused, setPaused] = useState(false), [orbit, setOrbit] = useState(false)
  const [replay, setReplay] = useState(null), [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  motionPaused.current = paused
  const select = i => { setSelected(i); setFollow(false) }
  const selectRef = useRef(select); selectRef.current = select
  useEffect(() => { if (follow && !replay) setSelected(model.focus) }, [model.focus, follow, replay])
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)'), update = () => setReduced(preference.matches)
    preference.addEventListener('change', update); return () => preference.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    let cancelled = false, scene
    setStatus('loading')
    import('./agentFlowScene.js').then(({ createAgentScene }) => {
      if (cancelled) return
      scene = createAgentScene(host.current, { onSelect: i => selectRef.current(i), onFailure: () => { setStatus('fallback'); setViewMode('list'); scene?.destroy(); engine.current = null } })
      engine.current = scene; setStatus('ready')
    }).catch(() => { if (!cancelled) { setStatus('fallback'); setViewMode('list') } })
    return () => { cancelled = true; scene?.destroy(); engine.current = null }
  }, [attempt])
  useEffect(() => {
    engine.current?.setView({ states: replay ? replay.frames[replay.index].states : model.states, selected, paused: paused || stale, orbit, reduced,
      replay: !!replay, leg: replay ? replay.frames[replay.index].stage - 1 : -1, seconds: () => playback.current?.seconds || 0 })
  })
  useEffect(() => {
    let frame, last = performance.now(), paintAt = last
    function tick(now) {
      const r = playback.current, dt = Math.min(.12, (now - last) / 1000); last = now
      if (r?.playing && !document.hidden && !motionPaused.current) {
        r.seconds += dt
        if (r.seconds >= CHECKPOINT_SECONDS) {
          r.seconds = CHECKPOINT_SECONDS
          if (r.index < r.frames.length - 1) { r.index++; r.seconds = 0; setSelected(r.frames[r.index].stage) }
          else r.playing = false
        }
        if (now - paintAt > 90 || !r.playing) { setReplay({ ...r }); paintAt = now }
      }
      frame = requestAnimationFrame(tick)
    }
    const hidden = () => { if (document.hidden && playback.current) { playback.current.playing = false; setReplay({ ...playback.current }) } }
    document.addEventListener('visibilitychange', hidden); frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', hidden) }
  }, [])
  const startReplay = () => {
    const r = { frames: model.frames, index: 1, seconds: 0, playing: !reduced && !paused }
    playback.current = r; setReplay({ ...r }); setSelected(r.frames[1].stage); setFollow(false)
  }
  const backToLive = () => { playback.current = null; setReplay(null); setFollow(true); setSelected(model.focus) }
  const togglePlay = () => {
    if (!replay) { startReplay(); return }
    if (replay.index === replay.frames.length - 1 && replay.seconds >= CHECKPOINT_SECONDS) { startReplay(); return }
    setPaused(false); playback.current.playing = !playback.current.playing; setReplay({ ...playback.current })
  }
  const seek = index => {
    playback.current = { ...playback.current, index, seconds: 0, playing: false }
    setReplay({ ...playback.current }); setSelected(replay.frames[index].stage)
  }
  const changeCamera = mode => { setCamera(mode); engine.current?.resetCamera(mode === 'front') }
  const stage = FLOW_STAGES[selected], states = replay ? replay.frames[replay.index].states : model.states
  const rows = model.rows[selected], run = rows.filter(t => t.operation === 'invoke_agent').at(-1)
  const label = replay ? historyLabel(states[selected], selected) : model.labels[selected]
  const state = states[selected], p = report.proposal
  const liveTitle = model.focus === 4 && p?.status === 'pending' ? 'รอผู้ดูแลตัดสินใจ' : model.focus === 5 && model.states[5] === 'active' ? 'รอคำขอใหม่เพื่อยืนยันผล' : model.states[model.focus] === 'active' ? `กำลังทำงาน · ${FLOW_STAGES[model.focus].title}` : 'สถานะล่าสุดจากเซิร์ฟเวอร์'

  return <section className="agentSpatial" aria-label="เส้นทางการวิเคราะห์สามมิติ">
    <div className="spatialWorkspace">
      <article className="spatialGraphCard">
        <header className="spatialHead"><div><Icon name="trace" size={19} artwork={false}/><h2>เส้นทางการวิเคราะห์<small>Agent process flow</small></h2></div><Badge tone={stale ? 'warn' : replay ? 'info' : 'good'}>{replay ? 'เล่นย้อนหลัง' : stale ? 'ข้อมูลเดิม' : 'ข้อมูลจริง'}</Badge></header>
        <div className="spatialToolbar">
          <div className="spatialButtonGroup" role="group" aria-label="รูปแบบการแสดงผล"><button type="button" aria-pressed={viewMode === '3d'} onClick={() => setViewMode('3d')} disabled={status === 'fallback'}>มุมสามมิติ</button><button type="button" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}>รายการขั้นตอน</button></div>
          {viewMode === '3d' && <div className="spatialCamera"><button type="button" onClick={() => changeCamera(camera === 'front' ? 'perspective' : 'front')} aria-pressed={camera === 'front'}>มองด้านหน้า</button><button type="button" onClick={() => changeCamera('perspective')} aria-label="คืนมุมกล้อง"><Icon name="refresh" size={15} artwork={false}/></button><label><input type="checkbox" checked={orbit} onChange={e => setOrbit(e.target.checked)} disabled={reduced}/>หมุนช้า ๆ</label></div>}
        </div>
        <div className={`spatialModeNote ${replay ? 'history' : ''}`} role="status">{replay ? <><b>เล่นย้อนหลัง · {replay.frames[replay.index].label}</b><span>จากบันทึกของเหตุการณ์นี้ · จังหวะเคลื่อนไหวเป็นภาพประกอบ ไม่ใช่เวลาประมวลผลจริง</span></> : <><b>{stale ? 'การเชื่อมต่อขัดข้อง · แสดงสถานะที่รับได้ล่าสุด' : liveTitle}</b><span>จุดแทนกลุ่มหลักฐาน · ไม่ใช่ neuron หรือเปอร์เซ็นต์การคิดของโมเดล</span></>}</div>
        <div className="spatialCanvasWrap" hidden={viewMode !== '3d'}>
          <div className="spatialCanvas" ref={host} role="img" aria-label="กราฟสามมิติของ 6 ขั้นตอน เลือกขั้นตอนด้วยปุ่มด้านล่างได้"/>
          {status === 'loading' && <p className="spatialLoading" role="status">กำลังโหลดกราฟสามมิติ…</p>}
        </div>
        {status === 'fallback' && <div className="spatialFallback" role="status"><Icon name="info" size={20} artwork={false}/><span>เปิดกราฟสามมิติไม่ได้ ดูข้อมูลทั้งหมดจากรายการขั้นตอนได้</span><button type="button" className="btn ghost sm" onClick={() => { setViewMode('3d'); setAttempt(n => n + 1) }}>ลองเปิด 3D ใหม่</button></div>}
        {viewMode === 'list' && <ol className="spatialList">{FLOW_STAGES.map((s, i) => <li key={s.key}><button type="button" aria-pressed={i === selected} onClick={() => select(i)}><span className={`spatialStateDot spatialStateDot--${states[i]}`}>{String(i + 1).padStart(2, '0')}</span><span><b>{s.title}</b><small>{s.th}</small></span><span>{replay ? historyLabel(states[i], i) : model.labels[i]}</span></button></li>)}</ol>}
        <div className="spatialLegend"><span><i className="spatialStateDot--done"/>เสร็จแล้ว</span><span><i className="spatialStateDot--active"/>กำลังทำงาน / รอผู้ดูแล</span><span><i className="spatialStateDot--fail"/>ไม่ผ่าน / ปฏิเสธ</span><small>{viewMode === '3d' ? 'ลากเพื่อหมุน · Scroll เพื่อซูม · กดจุดเพื่อดูขั้นตอน' : 'เลือกขั้นตอนเพื่อดูหลักฐาน'}</small></div>
        <div className="spatialStages" role="group" aria-label="เลือกขั้นตอนการวิเคราะห์">{FLOW_STAGES.map((s, i) => <button key={s.key} type="button" aria-pressed={i === selected} className={`spatialStage spatialStage--${states[i]}`} onClick={() => select(i)}><small>{String(i + 1).padStart(2, '0')}</small><b>{s.title}</b><span>{replay ? historyLabel(states[i], i) : model.labels[i]}</span></button>)}</div>
      <article className="spatialReplay"><header><div><span className="spatialEyebrow">TRACE PLAYBACK</span><h3>ย้อนดูเส้นทางของเหตุการณ์นี้</h3></div><Badge tone={replay ? 'info' : 'muted'}>{replay ? `${replay.index + 1} / ${replay.frames.length} จุดบันทึก` : `${model.frames.length} จุดบันทึก`}</Badge></header>
        <div className="spatialPlaybackControls"><button type="button" className="btn primary" disabled={model.frames.length < 2} onClick={togglePlay}><Icon name={replay?.playing ? 'pause' : 'play'} size={16} artwork={false}/>{replay?.playing ? 'หยุดชั่วคราว' : replay ? 'เล่นต่อ' : 'เล่นย้อนหลัง'}</button><label className="spatialTimeline"><span className="sr">จุดบันทึกย้อนหลัง</span><input type="range" min="0" max={Math.max(1, (replay?.frames || model.frames).length - 1)} step="1" value={replay?.index || 0} disabled={!replay} onChange={e => seek(Number(e.target.value))}/></label>{replay && <button type="button" className="btn ghost" onClick={backToLive}>กลับข้อมูลล่าสุด</button>}</div>
        <p>{replay ? `${replay.frames[replay.index].at ? fmtTime(replay.frames[replay.index].at) + ' · ' : ''}${replay.frames[replay.index].label}` : 'เล่นเฉพาะขั้นตอนที่มีบันทึกแล้ว ไม่ส่งคำสั่งวิเคราะห์หรืออนุมัติใหม่'}</p>
        <label className="spatialMotionToggle"><input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)}/>หยุดการเคลื่อนไหวของกราฟ <small>ข้อมูลยังอัปเดตตามปกติ</small></label>
      </article>

      </article>
      <aside className="spatialInspector" aria-label="รายละเอียดขั้นตอนที่เลือก">
        <header><span>รายละเอียดขั้นตอน</span><small>{String(selected + 1).padStart(2, '0')} / 06</small></header>
        
        <h2>{stage.title}</h2><p className="spatialThai">{stage.th}</p><Badge tone={state === 'fail' ? 'bad' : state === 'active' ? 'warn' : state === 'done' ? 'good' : 'muted'}>{label}</Badge>
        <p>{stage.note}</p>
        <dl hidden={selected === 0 || selected > 3}>{selected > 0 && selected < 4 && <><div><dt>บันทึก</dt><dd>{rows.length} รายการ</dd></div><div><dt>เวลาขั้นตอน</dt><dd>{duration(run?.duration_ms)}</dd></div></>}</dl>
        <div className="spatialEvidence">
          {replay && <p className="spatialHistoryEvidence">สถานะบนกราฟเป็นจุดบันทึกที่เลือก · รายละเอียดด้านล่างเป็นหลักฐานฉบับล่าสุดของเหตุการณ์</p>}
          {selected === 0 ? <><h3>หลักฐานการตรวจพบ</h3><p>{kindName(report.kind)}</p><p className="mono">{report.source_ip}</p><p>{report.event_count ?? '—'} events · {fmtTime(report.created_at)}</p></>
            : selected < 4 ? <><h3>การทำงานที่บันทึกไว้</h3>{rows.length ? <ul>{rows.slice(-5).map((t, i) => <li key={t.id ?? i}><Icon name={t.operation === 'chat' ? 'brain' : 'terminal'} size={14} artwork={false}/><span>{t.operation === 'chat' ? 'model call' : t.operation === 'invoke_agent' ? 'จบขั้นตอน Agent' : t.tool || t.operation}<small>{t.status || 'ok'} · {duration(t.duration_ms)}</small></span></li>)}</ul> : <p>{state === 'skip' ? 'ไม่มีบันทึกว่า Agent นี้ทำงานในรอบนี้' : state === 'active' ? 'กำลังรอบันทึกจากเซิร์ฟเวอร์' : 'ยังไม่มีการเรียกใช้งาน'}</p>}<small>ดู input / output ฉบับเต็มได้ด้านล่าง</small></>
            : selected === 4 ? <><h3>การตัดสินใจของผู้ดูแล</h3><p>{p ? p.status === 'pending' ? 'ข้อเสนอรอการตรวจหลักฐานและยืนยัน' : p.status === 'rejected' ? 'ปฏิเสธข้อเสนอ · ไม่สร้างกฎจากข้อเสนอนี้' : 'ผู้ดูแลอนุมัติข้อเสนอแล้ว' : 'ยังไม่มีข้อเสนอให้อนุมัติ'}</p>{p && <dl className="spatialProposalFacts"><div><dt>การดำเนินการ</dt><dd>{actionLabel[p.action] || p.action}</dd></div><div><dt>เป้าหมาย</dt><dd className="mono">{targetIp(p)}</dd></div><div><dt>ระยะเวลา</dt><dd>{durationText(p.duration_seconds)}</dd></div></dl>}{p?.reviewer && <p>ผู้บันทึก · {p.reviewer}</p>}{p && <a className={`btn ${p.status === 'pending' ? 'primary' : 'ghost'} block`} href={`#/approvals/${p.id}`}>{p.status === 'pending' ? 'ตรวจข้อเสนอและตัดสินใจ' : 'ดูบันทึกการตัดสินใจ'}<Icon name="chevron" size={15} artwork={false}/></a>}</>
            : <><h3>หลักฐานยืนยันการป้องกัน</h3><p>{model.states[5] === 'done' ? 'เซิร์ฟเวอร์ยืนยันว่าคำขอใหม่ถูกปฏิเสธด้วยกฎป้องกันแล้ว' : model.states[5] === 'active' ? 'บล็อกแล้ว · รอคำขอใหม่จาก IP นี้เพื่อยืนยันผล' : model.states[5] === 'skip' ? 'ไม่มีการยืนยันผลการบล็อกในรอบนี้' : 'ยังไม่ถึงขั้นตรวจผล ต้องอนุมัติและมีคำขอใหม่ก่อน'}</p><a className="btn ghost sm" href={`#/incident/${report.id}`}>ดูหลักฐานเหตุการณ์</a></>}
        </div>
        <button type="button" className="spatialFollow" aria-pressed={follow && !replay} onClick={backToLive}><Icon name="pulse" size={15} artwork={false}/>{replay ? 'กลับสถานะปัจจุบัน' : follow ? 'กำลังติดตามขั้นตอนล่าสุด' : 'ติดตามขั้นตอนล่าสุด'}</button>
      </aside>
    </div>

  </section>
}
