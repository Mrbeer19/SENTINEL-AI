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
  const [geoByIp, setGeoByIp] = useState(() => { try { return JSON.parse(sessionStorage.getItem("sentinel-geoip") || "{}") } catch { return {} } })
  const pending = data.proposals.filter(p => p.status === 'pending')
  const activeRules = data.rules.filter(r => isActiveRule(r, now))
  const open = data.incidents.filter(isOpenIncident)
  const ips = new Set([...data.traffic.map(t => t.source_ip), ...data.events.map(e => e.source_ip)])
  const allowedSeries = perMinute(data.traffic.filter(t=>t.decision==='allowed'), 'created_at', minutes, now)
  const deniedSeries = perMinute(data.traffic.filter(t=>t.decision==='denied'), 'created_at', minutes, now)
  const trafficSeries = allowedSeries.map((v,i)=>v+deniedSeries[i])
  const allowed = data.traffic.filter(t => t.decision === 'allowed').length
  const denied = data.traffic.filter(t => t.decision === 'denied').length
  const focusIp = selectedIp || latestRealLoginIp(data) || sourceActivity(data)[0]?.ip
  const geoTargets = [...new Set([focusIp, ...sourceActivity(data).slice(0, 6).map(s => s.ip)])].filter(isRealPublicIp).join(',')
  useEffect(() => {
    const controller = new AbortController()
    for (const address of geoTargets.split(',').filter(Boolean)) {
      if (geoByIp[address]) continue
      const lookup = async () => {
        let geo = null
        try {
          const response = await fetch(`/api/geoip/${encodeURIComponent(address)}`, { signal: controller.signal })
          if (response.ok) { const result = await response.json(); if (result.success && result.ip === address) geo = { ...result, provider: 'ipwho.is' } }
        } catch (error) { if (error.name === 'AbortError') return }
        if (!controller.signal.aborted) setGeoByIp(current => ({ ...current, [address]: geo }))
      }
      lookup()
    }
    return () => controller.abort()
  }, [geoTargets])
  useEffect(() => {
    try { sessionStorage.setItem('sentinel-geoip', JSON.stringify(Object.fromEntries(Object.entries(geoByIp).filter(([, value]) => value)))) } catch { /* Storage may be disabled. */ }
  }, [geoByIp])
  const focus = focusIp && sourceLocation(focusIp, data, geoByIp[focusIp])
  return <div className="commandOverview commandV3">
    <section className="overviewIntro"><div><span className="sectionIndex">SENTINEL / SECURITY OPERATIONS</span><h1><Icon name="home" size={36}/>Security overview<span className="titleDot">.</span></h1><p>เห็นทุกสัญญาณ เชื่อมทุกการป้องกัน</p></div><div className="overviewMeta"><span className="overviewLive"><i className={`dot ${ctx.connected ? 'mint' : 'amber'}`}/>{ctx.connected ? 'LIVE MONITORING' : 'RECONNECTING'}</span><time>{new Date(now).toLocaleString('th-TH', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time><span>HUMAN-APPROVED RESPONSE</span></div></section>
    <div className="stats four commandStats">
      <Stat icon="laptop" label="IP ต้นทางที่พบ" value={ips.size} note="จากคำขอและเหตุการณ์ที่บันทึก" />
      <Stat icon="alert" tone="coral" label="เหตุการณ์ที่ต้องตรวจ" value={open.length} note="รวมรายการที่ยังรอยืนยันผล" />
      <Stat icon="clock" tone="amber" label="ข้อเสนอรออนุมัติ" value={pending.length} note="ตรวจแล้วบล็อกได้จากหน้านี้" />
      <Stat icon="shield" label="กฎบล็อกที่ทำงาน" value={activeRules.length} note="ป้องกันเว็บ rod-mai-rod" />
    </div>
    <div className="operationsGrid">
      <Panel title="แผนที่การเชื่อมต่อ" icon="trace" className="networkPanel" actions={<span className="sectionIndex">NETWORK / 01</span>}>
        <NetworkTopology data={data} activeRules={activeRules} connected={ctx.connected} selectedIp={focusIp} onSelectIp={setSelectedIp} geoByIp={geoByIp} theme={ctx.theme} />
      </Panel>
      <div className="responseColumn">
        <section className="nexAssistant" aria-label="SENTINEL network assistant">
          <div className="assistantBody"><div className="nexPortrait"><img className="nexSolo" src="/assets/sentinel-pilot.png" alt="มาสคอตนักบิน SENTINEL"/></div><div className="assistantCopy"><span className="sectionIndex">SENTINEL ASSISTANT</span><h2>{pending.length ? <>มี {pending.length} ข้อเสนอ<br/>รอตรวจสอบ</> : <>ทุกสัญญาณ<br/>อยู่ในสายตา</>}</h2><p>{ctx.error ? 'ขาดการเชื่อมต่อ · ข้อมูลอาจยังไม่เป็นปัจจุบัน' : pending.length ? 'AI วิเคราะห์หลักฐานและเสนอแนวทางแล้ว ตรวจรายละเอียดก่อนตัดสินใจ' : 'ติดตามเหตุการณ์และสถานะการป้องกันจากข้อมูลที่ระบบบันทึก'}</p><div className="assistantSummary"><a href="#/incidents"><i className="dot coral"/>เหตุการณ์ที่ต้องตรวจ <b>{open.length}</b><Icon name="chevron" size={14}/></a><a href="#/approvals"><i className="dot amber"/>ข้อเสนอรออนุมัติ <b>{pending.length}</b><Icon name="chevron" size={14}/></a><a href="#/rules"><i className="dot mint"/>กฎที่ทำงาน <b>{activeRules.length}</b><Icon name="chevron" size={14}/></a></div><a className="assistantPrimary" href="#/approvals">ตรวจคำแนะนำ <Icon name="chevron" size={18}/></a></div></div>
        </section>

      </div>
    </div>
    <div className="telemetryGrid"><Panel title="ปริมาณคำขอเข้าแอป" icon="pulse" actions={<label className="chartRange"><span className="sr">ช่วงเวลากราฟ</span><select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}><option value={15}>15 นาที</option><option value={30}>30 นาที</option><option value={60}>60 นาที</option></select></label>}><ActivityChart values={trafficSeries} allowed={allowedSeries} denied={deniedSeries} now={now}/><p className="trafficScopeNote">กราฟนับเฉพาะช่วงเวลาที่เลือก · จากคำขอเข้าแอปที่ระบบบันทึกได้</p></Panel><Panel title="คำขอเข้าล่าสุด" icon="terminal" actions={<span className="sectionIndex">{ctx.connected?'LIVE FEED':'SAVED FEED'} / 03</span>}><RequestLog traffic={data.traffic} events={data.events} limit={6}/><p className="scopeNote">ข้อมูลนี้ครอบคลุม request ที่เข้าแอปและ events ที่นำเข้า ไม่ใช่ traffic ทั้งหมดของเครือข่าย</p></Panel></div>
      <Panel title="จัดการการป้องกัน" icon="shield" className="responseDesk" actions={<span className="deskCount">{pending.length} WAITING</span>}>
        <p className="deskIntro">AI วิเคราะห์อัตโนมัติ · ตรวจคำแนะนำก่อนยืนยันบล็อก IP</p>
        {pending.length ? <div className="responseQueue">{pending.slice(0,3).map(p => {const incident=data.incidents.find(i=>i.id===p.incident_id); return <article key={p.id} className="responseItem"><div className="responseItemHead"><b className="mono">{targetIp(p)}</b><Badge tone="warn">รออนุมัติ</Badge></div><p>{kindName(incident?.kind) || 'เหตุการณ์ที่ตรวจพบ'}</p><small>{p.duration_seconds/60} นาที · {p.source === 'rule_fallback' || incident?.analysis_mode === 'rule_fallback' ? 'Rule fallback · ไม่ใช่ AI' : 'ตรวจผลวิเคราะห์ก่อนตัดสินใจ'}</small><div className="rowActions"><button className="btn primary" disabled={ctx.busy || !!ctx.error} onClick={()=>setSelection({proposal:p,incident,action:'approve'})}>ตรวจ / บล็อก IP<Icon name="chevron" size={15}/></button><button className="btn ghost" disabled={ctx.busy || !!ctx.error} onClick={()=>setSelection({proposal:p,incident,action:'reject'})}>ปฏิเสธ</button></div></article>})}</div> : <div className="deskEmpty"><span className="deskEmptyIcon"><Icon name="shield" size={32}/></span><div className="deskEmptyCopy"><b>ไม่มีข้อเสนอรออนุมัติ</b><p>AI วิเคราะห์เหตุการณ์ใหม่อัตโนมัติ<br/>หากมีข้อเสนอจะแสดงให้คุณตรวจและยืนยันที่นี่</p></div><a className="btn ghost sm" href="#/incidents">ดูเหตุการณ์<Icon name="chevron" size={14}/></a></div>}
        {pending.length>3 && <a className="link" href="#/approvals">ดูอีก {pending.length-3} ข้อเสนอ →</a>}
        <div className="protectedNode"><img src="/assets/sentinel-node.svg" alt="" /><div><span className="sectionIndex">PROTECTED APPLICATION</span><b>rod-mai-rod</b><p>{activeRules.length} กฎที่ทำงาน · {denied} คำขอถูกปฏิเสธ</p><small>เว็บไซต์จริงที่ป้องกันอยู่ · บล็อกแล้วต้องมีคำขอใหม่ยืนยันผล</small></div></div>
        <div className="deskFooter"><Icon name="user" size={15}/><span>คนเป็นผู้อนุมัติ · ทุกคำตัดสินมีบันทึก</span></div>
      </Panel>
    <Panel title="ประวัติการล็อกอิน rod-mai-rod" icon="terminal" className="loginHistoryPanel" actions={<span className="sectionIndex">LOGIN HISTORY / 02</span>}>
      <LoginHistory events={data.events} />
    </Panel>
    <Panel title="สรุปแหล่งต้นทางตาม IP" icon="laptop" className="sourcePanel" actions={<span className="sectionIndex">SOURCE EXPLORER / 03</span>}>
      <SourceList ctx={ctx} activeRules={activeRules} onRespond={setSelection} onSelect={setSelectedIp} selectedIp={focusIp} geoByIp={geoByIp} now={now} queryOverride={ctx.searchTerm} />
      {focus && <div className="sourceFocus"><span className="sectionIndex">SELECTED SOURCE</span><b className="mono">{focusIp}</b><span>{focus.label}</span><small>{focus.note}</small></div>}
    </Panel>

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
  return <div className="tableWrap recentFeed"><table><thead><tr><th>เวลา</th><th>IP ต้นทาง</th><th>ประเภท</th><th>ผลลัพธ์</th></tr></thead><tbody>{entries.map(entry=><tr key={entry.key}><td className="mono">{fmtTime(entry.at)}</td><td className="mono">{entry.ip}</td><td>{entry.label}</td><td><Badge tone={entry.denied?'bad':'good'}>{entry.result}</Badge></td></tr>)}</tbody></table></div>
}
