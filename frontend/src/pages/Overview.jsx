import React, { useEffect, useState } from 'react'
import { Badge, Empty, Icon, Panel, Stat, fmtTime, incId, isActiveRule, isOpenIncident, isRuleOnly, kindName, perMinute, targetIp, useNow } from '../ui.jsx'
import ActivityChart from '../components/ActivityChart.jsx'
import LoginHistory from '../components/LoginHistory.jsx'
import NetworkTopology from '../components/NetworkTopology.jsx'
import ConnectionMap from '../components/ConnectionMap.jsx'
import QuickResponse from '../components/QuickResponse.jsx'
import SourceList, { sourceLocation } from '../components/SourceList.jsx'
import { isRealPublicIp, latestRealLoginIp, sourceActivity } from '../sourceActivity.js'

export default function Overview({ ctx }) {
  const { data } = ctx
  const now = useNow(1000)
  const [minutes, setMinutes] = useState(15)
  const [explorer, setExplorer] = useState('sources')
  const [networkView, setNetworkView] = useState('network')
  const [selection, setSelection] = useState(null)
  const [selectedIp, setSelectedIp] = useState(null)
  const [geoByIp, setGeoByIp] = useState(() => { try { return JSON.parse(sessionStorage.getItem("sentinel-geoip") || "{}") } catch { return {} } })
  const pending = data.proposals.filter(p => p.status === 'pending')
  const activeRules = data.rules.filter(r => isActiveRule(r, now))
  const open = data.incidents.filter(isOpenIncident)
  const ips = new Set([...data.traffic.map(t => t.source_ip), ...data.events.map(e => e.source_ip), ...data.incidents.map(i => i.source_ip)])
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
  return <div className="commandOverview commandV3 consoleOverview">
    <div className="stats four commandStats">
      <Stat icon="laptop" label="IP ต้นทาง" value={ips.size} note="จากข้อมูลที่ระบบบันทึก" />
      <Stat icon="alert" tone="coral" label="เหตุการณ์ที่ต้องตรวจ" value={open.length} />
      <Stat icon="clock" tone="amber" label="ข้อเสนอรออนุมัติ" value={pending.length} />
      <Stat icon="shield" label="กฎบล็อกที่ทำงาน" value={activeRules.length} />
    </div>
    <div className="consoleSituation">
      <Panel title="รูปแบบเหตุการณ์" icon="pulse" className="situationRadar"><DetectionRadar incidents={data.incidents}/><a className="btn ghost block" href="#/incidents">สำรวจเหตุการณ์<Icon name="chevron" size={15}/></a></Panel>
      <Panel title="การเชื่อมต่อของระบบ" icon="trace" className="networkPanel" actions={<div className="tabs" role="group" aria-label="มุมมองการเชื่อมต่อ"><button type="button" className={networkView==='network'?'on':''} aria-pressed={networkView==='network'} onClick={()=>setNetworkView('network')}>Network</button><button type="button" className={networkView==='globe'?'on':''} aria-pressed={networkView==='globe'} onClick={()=>setNetworkView('globe')}>ลูกโลก</button></div>}>
        {networkView==='network' ? <ConnectionMap data={data} activeRules={activeRules} connected={ctx.connected} selectedIp={focusIp} onSelectIp={setSelectedIp}/> : <NetworkTopology data={data} activeRules={activeRules} connected={ctx.connected} selectedIp={focusIp} onSelectIp={setSelectedIp} geoByIp={geoByIp} theme={ctx.theme} />}
      </Panel>
      <Panel title="คิวตรวจและตอบสนอง" icon="shield" className="responseDesk">
        <div className="consoleBriefing"><img src="/assets/sentinel-pilot.png" alt=""/><p>{ctx.error ? 'การเชื่อมต่อขัดข้อง · ตรวจเวลาที่อัปเดตก่อนตัดสินใจ' : pending.length ? 'ตรวจหลักฐานก่อนยืนยัน ระบบจะบล็อกเมื่อผู้ดูแลอนุมัติเท่านั้น' : 'เมื่อมีข้อเสนอใหม่ จะแสดงให้คุณตรวจและตัดสินใจที่นี่'}</p></div>
        {pending.length ? <div className="responseQueue">{pending.slice(0,3).map(p => {const incident=data.incidents.find(i=>i.id===p.incident_id); return <article key={p.id} className="responseItem"><div className="responseItemHead"><b className="mono">{targetIp(p)}</b><Badge tone="warn">รออนุมัติ</Badge></div><p>{kindName(incident?.kind) || 'เหตุการณ์ที่ตรวจพบ'}</p><small>{p.duration_seconds ? `${p.duration_seconds/60} นาที` : 'จนกว่าจะปลดบล็อก'} · {isRuleOnly(incident?.kind) ? 'ตรวจด้วยกฎเฉพาะทาง' : p.source === 'rule_fallback' || incident?.analysis_mode === 'rule_fallback' ? 'Rule fallback' : 'คำแนะนำจาก AI'}</small><div className="rowActions"><button className="btn primary" disabled={ctx.busy || !!ctx.error} onClick={()=>setSelection({proposal:p,incident,action:'approve'})}>ตรวจข้อเสนอ<Icon name="chevron" size={15}/></button><button className="btn ghost" disabled={ctx.busy || !!ctx.error} onClick={()=>setSelection({proposal:p,incident,action:'reject'})}>ปฏิเสธ</button></div></article>})}</div> : <div className="consoleClear"><Icon name="ok" size={24} artwork={false}/><b>ไม่มีข้อเสนอค้างตรวจ</b><a href="#/incidents">ดูเหตุการณ์ที่บันทึกไว้</a></div>}
        {pending.length>3 && <a className="link" href="#/approvals">ดูอีก {pending.length-3} ข้อเสนอ →</a>}
      </Panel>
    </div>
    <div className="telemetryGrid"><Panel title="ปริมาณคำขอเข้าแอป" icon="pulse" actions={<label className="chartRange"><span className="sr">ช่วงเวลากราฟ</span><select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}><option value={15}>15 นาที</option><option value={30}>30 นาที</option><option value={60}>60 นาที</option></select></label>}><ActivityChart values={trafficSeries} allowed={allowedSeries} denied={deniedSeries} now={now}/></Panel><Panel title="คำขอเข้าแอปล่าสุด" icon="terminal"><RequestLog traffic={data.traffic} limit={6}/></Panel></div>
    <Panel title="สำรวจข้อมูลต้นทาง" icon="laptop" className="sourcePanel" actions={<div className="tabs" role="group" aria-label="ข้อมูลต้นทาง"><button type="button" className={explorer==='sources'?'on':''} aria-pressed={explorer==='sources'} onClick={()=>setExplorer('sources')}>แหล่งต้นทาง</button><button type="button" className={explorer==='logins'?'on':''} aria-pressed={explorer==='logins'} onClick={()=>setExplorer('logins')}>ประวัติล็อกอิน</button></div>}>
      {explorer==='sources' ? <SourceList ctx={ctx} activeRules={activeRules} onRespond={setSelection} onSelect={setSelectedIp} selectedIp={focusIp} geoByIp={geoByIp} now={now} queryOverride={ctx.searchTerm} /> : <LoginHistory events={data.events}/>}
    </Panel>
    {selection && <QuickResponse key={`${selection.proposal?.id || selection.rule?.id}-${selection.action || 'unblock'}`} ctx={ctx} selection={selection} onClose={()=>setSelection(null)}/>}
  </div>
}

function DetectionRadar({ incidents }) {
  const categories=[['HTTP_AUTH_BRUTE_FORCE','HTTP'],['SSH_BRUTE_FORCE','SSH'],['PORT_SCAN','Port scan'],['TRAFFIC_ANOMALY','Traffic'],['SUSPICIOUS_LOGIN','Login']]
  const counts=categories.map(([key])=>incidents.filter(i=>i.kind===key).length),max=Math.max(1,...counts)
  const point=(i,r)=>[110+Math.cos(-Math.PI/2+i*2*Math.PI/5)*r,108+Math.sin(-Math.PI/2+i*2*Math.PI/5)*r]
  return <figure className="detectionRadar"><svg viewBox="0 0 220 220" role="img" aria-label={categories.map(([,label],i)=>`${label} ${counts[i]} เหตุการณ์`).join(', ')}>{[.33,.66,1].map(r=><polygon key={r} points={categories.map((_,i)=>point(i,70*r).join(',')).join(' ')} className="radarRing"/>)}{categories.map(([,label],i)=>{const [x,y]=point(i,70),[tx,ty]=point(i,94);return <g key={label}><path d={`M110 108L${x} ${y}`} className="radarAxis"/><text x={tx} y={ty} textAnchor="middle">{label}<tspan x={tx} dy="13">{counts[i]}</tspan></text></g>})}<polygon className="radarData" points={counts.map((n,i)=>point(i,70*n/max).join(',')).join(' ')}/>{counts.map((n,i)=>{const[x,y]=point(i,70*n/max);return <circle key={i} cx={x} cy={y} r="3" className="radarPoint"/>})}</svg><figcaption>จำนวนเหตุการณ์แยกตามประเภท{!incidents.length && ' · ยังไม่มีข้อมูล'}</figcaption></figure>
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
    {incident.analysis_mode && <li className="note"><Badge tone={isRuleOnly(incident.kind) ? 'info' : incident.analysis_mode === 'rule_fallback' ? 'warn' : 'good'}>{isRuleOnly(incident.kind) ? 'ตรวจด้วยกฎเฉพาะทาง' : incident.analysis_mode === 'rule_fallback' ? 'Rule fallback' : 'Local model'}</Badge></li>}
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
