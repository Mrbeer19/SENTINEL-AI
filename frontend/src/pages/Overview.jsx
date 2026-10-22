import React, { useEffect, useState } from 'react'
import { Badge, Empty, Icon, Panel, Stat, fmtTime, incId, isActiveRule, isOpenIncident, kindName, perMinute, targetIp, useNow } from '../ui.jsx'
import ActivityChart from '../components/ActivityChart.jsx'
import LoginHistory from '../components/LoginHistory.jsx'
import NetworkTopology from '../components/NetworkTopology.jsx'
import QuickResponse from '../components/QuickResponse.jsx'
import SourceList, { sourceLocation } from '../components/SourceList.jsx'
import { isRealPublicIp, latestRealLoginIp, sourceActivity } from '../sourceActivity.js'

export default function Overview({ ctx }) {
  const { data } = ctx
  const now = useNow(1000)
  const [minutes, setMinutes] = useState(15)
  const [selection, setSelection] = useState(null)
  const [selectedIp, setSelectedIp] = useState(null)
  const [geoByIp, setGeoByIp] = useState({})
  const pending = data.proposals.filter(p => p.status === 'pending')
  const activeRules = data.rules.filter(r => isActiveRule(r, now))
  const open = data.incidents.filter(isOpenIncident)
  const ips = new Set([...data.traffic.map(t => t.source_ip), ...data.events.map(e => e.source_ip)])
  const trafficSeries = perMinute(data.traffic, 'created_at', minutes, now)
  const allowed = data.traffic.filter(t => t.decision === 'allowed').length
  const denied = data.traffic.filter(t => t.decision === 'denied').length
  const focusIp = selectedIp || latestRealLoginIp(data) || sourceActivity(data)[0]?.ip
  useEffect(() => {
    if (!isRealPublicIp(focusIp) || Object.hasOwn(geoByIp, focusIp)) return
    const controller = new AbortController()
    fetch(`https://ipapi.co/${encodeURIComponent(focusIp)}/json/`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(geo => setGeoByIp(current => ({ ...current, [focusIp]: geo?.ip === focusIp && !geo.error ? { city: geo.city, region: geo.region, country: geo.country_name, connection: { isp: geo.org }, provider: 'ipapi.co' } : null })))
      .catch(error => { if (error.name !== 'AbortError') setGeoByIp(current => ({ ...current, [focusIp]: null })) })
    return () => controller.abort()
  }, [focusIp, geoByIp])
  const focus = focusIp && sourceLocation(focusIp, data, geoByIp[focusIp])
  return <div className="commandOverview">
    <section className="overviewIntro">
      <div className="introCopy"><span className="sectionIndex">/01 — SECURITY OPERATIONS</span><h1>SENTINEL<span>CONTROL ROOM<span className="titleDot">_</span></span></h1><p className="introTagline">เห็นทุกสัญญาณ. ตัดสินใจได้ทันที.</p><p>ดูต้นทาง ตรวจเหตุการณ์ และจัดการการป้องกันจากหน้าจอเดียว</p><div className="overviewShortcuts"><button className="btn primary" onClick={() => document.querySelector('.loginHistoryPanel')?.scrollIntoView({block:'start',behavior:'smooth'})}>ดู IP ที่เข้ามา<Icon name="chevron" size={15}/></button><button className="btn ghost" onClick={() => document.querySelector('.responseDesk')?.scrollIntoView({block:'start',behavior:'smooth'})}>จัดการการป้องกัน {pending.length > 0 && <span className="badge info">{pending.length}</span>}</button></div><div className="introFootnote"><span>OBSERVE</span><i>→</i><span>UNDERSTAND</span><i>→</i><span>RESPOND</span></div></div>
      <div className="introArtwork"><img src="/assets/sentinel-structure-v2.svg" alt=""/><span className="artSerial" aria-hidden="true">STRUCTURE / S—01</span><div className="watchStatus"><span className="liveSquare" /><div><b>{ctx.error ? 'CONNECTION LOST' : ctx.connected ? 'MONITORING ACTIVE' : 'RECONNECTING'}</b><small>{ctx.error ? 'กำลังแสดงข้อมูลที่บันทึกไว้' : 'M5 / LOCAL SECURITY WORKSPACE'}</small></div></div></div>
    </section>
    <div className="stats four commandStats">
      <Stat icon="laptop" label="IP ต้นทางที่พบ" value={ips.size} note="จากคำขอและเหตุการณ์ที่บันทึก" />
      <Stat icon="alert" tone="coral" label="เหตุการณ์ที่ต้องตรวจ" value={open.length} note="รวมรายการที่ยังรอยืนยันผล" />
      <Stat icon="clock" tone="amber" label="ข้อเสนอรออนุมัติ" value={pending.length} note="ตรวจแล้วบล็อกได้จากหน้านี้" />
      <Stat icon="shield" label="กฎบล็อกที่ทำงาน" value={activeRules.length} note="ป้องกันเว็บ rod-mai-rod" />
    </div>
    <div className="operationsGrid">
      <Panel title="แผนที่การเชื่อมต่อ" icon="trace" className="networkPanel" actions={<span className="sectionIndex">NETWORK / 01</span>}>
        <NetworkTopology data={data} activeRules={activeRules} connected={ctx.connected} selectedIp={focusIp} geoByIp={geoByIp} />
      </Panel>
      <Panel title="จัดการการป้องกัน" icon="shield" className="responseDesk" actions={<span className="deskCount">{pending.length} WAITING</span>}>
        <p className="deskIntro">ตรวจหลักฐานก่อนอนุมัติ ระบบจะไม่บล็อก IP เอง</p>
        {pending.length ? <div className="responseQueue">{pending.slice(0,3).map(p => {const incident=data.incidents.find(i=>i.id===p.incident_id); return <article key={p.id} className="responseItem"><div className="responseItemHead"><b className="mono">{targetIp(p)}</b><Badge tone="warn">รออนุมัติ</Badge></div><p>{kindName(incident?.kind) || 'เหตุการณ์ที่ตรวจพบ'}</p><small>{p.duration_seconds/60} นาที · {p.source === 'rule_fallback' || incident?.analysis_mode === 'rule_fallback' ? 'Rule fallback · ไม่ใช่ AI' : 'ตรวจผลวิเคราะห์ก่อนตัดสินใจ'}</small><div className="rowActions"><button className="btn primary" disabled={ctx.busy || !!ctx.error} onClick={()=>setSelection({proposal:p,incident,action:'approve'})}>ตรวจ / บล็อก IP<Icon name="chevron" size={15}/></button><button className="btn ghost" disabled={ctx.busy || !!ctx.error} onClick={()=>setSelection({proposal:p,incident,action:'reject'})}>ปฏิเสธ</button></div></article>})}</div> : <div className="deskEmpty"><Icon name="ok" size={38} /><b>ไม่มีข้อเสนอรออนุมัติ</b><p>เมื่อวิเคราะห์แล้วมีข้อเสนอบล็อก<br/>จะตรวจและตัดสินใจได้ตรงนี้</p></div>}
        {pending.length>3 && <a className="link" href="#/approvals">ดูอีก {pending.length-3} ข้อเสนอ →</a>}
        <div className="protectedNode"><img src="/assets/sentinel-node.svg" alt="" /><div><span className="sectionIndex">PROTECTED APPLICATION</span><b>rod-mai-rod</b><p>{activeRules.length} กฎที่ทำงาน · {denied} คำขอถูกปฏิเสธ</p><small>เว็บไซต์จริงที่ป้องกันอยู่ · บล็อกแล้วต้องมีคำขอใหม่ยืนยันผล</small></div></div>
        <div className="deskFooter"><Icon name="user" size={15}/><span>คนเป็นผู้อนุมัติ · ทุกคำตัดสินมีบันทึก</span></div>
      </Panel>
    </div>
    <Panel title="ประวัติการล็อกอิน rod-mai-rod" icon="terminal" className="loginHistoryPanel" actions={<span className="sectionIndex">LOGIN HISTORY / 02</span>}>
      <LoginHistory events={data.events} />
    </Panel>
    <Panel title="สรุปแหล่งต้นทางตาม IP" icon="laptop" className="sourcePanel" actions={<span className="sectionIndex">SOURCE EXPLORER / 03</span>}>
      <SourceList ctx={ctx} activeRules={activeRules} onRespond={setSelection} onSelect={setSelectedIp} selectedIp={focusIp} geoByIp={geoByIp} now={now} />
      {focus && <div className="sourceFocus"><span className="sectionIndex">SELECTED SOURCE</span><b className="mono">{focusIp}</b><span>{focus.label}</span><small>{focus.note}</small></div>}
    </Panel>
    <div className="telemetryGrid"><Panel title="ปริมาณคำขอเข้าแอป" icon="pulse" actions={<label className="chartRange"><span className="sr">ช่วงเวลากราฟ</span><select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}><option value={15}>15 นาที</option><option value={30}>30 นาที</option><option value={60}>60 นาที</option></select></label>}><ActivityChart values={trafficSeries} now={now}/><div className="trafficTotals"><span><i className="dot mint"/>ผ่าน <b>{allowed}</b></span><span><i className="dot coral"/>ปฏิเสธ <b>{denied}</b></span><small>จากรายการล่าสุดที่ระบบส่งกลับ</small></div></Panel><Panel title="คำขอเข้าล่าสุด" icon="terminal" actions={<span className="sectionIndex">{ctx.connected?'LIVE FEED':'SAVED FEED'} / 03</span>}><RequestLog traffic={data.traffic} events={data.events} limit={6}/><p className="scopeNote">ข้อมูลนี้ครอบคลุม request ที่เข้าแอปและ events ที่นำเข้า ไม่ใช่ traffic ทั้งหมดของเครือข่าย</p></Panel></div>
    {selection && <QuickResponse key={`${selection.proposal?.id || selection.rule?.id}-${selection.action || 'unblock'}`} ctx={ctx} selection={selection} onClose={()=>setSelection(null)}/>}
  </div>
}

export function AgentSteps({ incident }) {
  const analyzed = !!incident.analysis
  const decided = ['blocked', 'verified', 'rejected'].includes(incident.status)
  const steps = [
    ['Incident detected', true],
    [incident.analysis_mode === 'rule_fallback' ? 'Rule-based evidence review' : 'Read evidence with tools', analyzed],
    ['Structured analysis', analyzed],
    [incident.status === 'rejected' ? 'Rejected by human' : !incident.proposal && analyzed && ['needs_review', 'monitoring', 'closed'].includes(incident.status) ? 'No block proposed' : 'Human decision', decided || (analyzed && ['monitoring', 'closed'].includes(incident.status))],
  ]
  return <ol className="miniSteps">{steps.map(([label, done], i) => <li key={label} className={done ? 'done' : (steps[i - 1]?.[1] ? 'current' : '')}><span className="stepIndex">{done ? <Icon name="ok" size={15} /> : i + 1}</span><span className="miniStepLabel">{label}</span>{done && <span className="stepComplete">Done</span>}</li>)}
    {incident.analysis_mode && <li className="note"><Badge tone={incident.analysis_mode === 'rule_fallback' ? 'warn' : 'good'}>{incident.analysis_mode === 'rule_fallback' ? 'Rule fallback' : 'Local model'}</Badge></li>}
  </ol>
}

export function RequestLog({ traffic, events = [], limit = 8 }) {
  const entries = [
    ...traffic.map(t => ({ key: `traffic-${t.id}`, at: t.created_at, ip: t.source_ip, label: 'app request', result: t.decision === 'denied' ? '403 denied' : 'allowed', denied: t.decision === 'denied', id: t.id })),
    ...events.filter(e => e.event_type === 'HTTP_AUTH').map(e => ({ key: `auth-${e.id}`, at: e.timestamp, ip: e.source_ip, label: isRealPublicIp(e.source_ip) ? 'rod-mai-rod login' : 'HTTP_AUTH · ทดสอบ', result: e.outcome === 'success' ? 'สำเร็จ' : 'ไม่สำเร็จ', denied: e.outcome !== 'success', id: e.id })),
  ].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0) || b.id - a.id).slice(0, limit)
  if (!entries.length) return <Empty>ยังไม่มีคำขอหรือเหตุการณ์ล็อกอิน</Empty>
  return <div className="log" role="log" aria-live="polite">{entries.map(entry => <div key={entry.key}>
    <time>{fmtTime(entry.at)}</time><span className="mono">{entry.ip}</span><span>{entry.label}</span><b className={entry.denied ? 'coral' : 'mint'}>{entry.result}</b>
  </div>)}</div>
}
