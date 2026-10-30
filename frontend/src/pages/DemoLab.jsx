import React, { useEffect, useState } from 'react'
import { getJson } from '../api.js'
import { Badge, Banner, Empty, Icon, Panel, fmtTime, incId, isActiveRule, noProposalNote, useNow } from '../ui.jsx'

const SCENARIOS = [
  { key: 'http_brute_force', icon: 'laptop', title: 'HTTP login replay', sub: '6 failed HTTP_AUTH events', note: 'Synthetic events through the normal ingestion path. Real HTTP tests run from the Neo Terminal.' },
  { key: 'ssh_brute_force_logs', icon: 'terminal', title: 'SSH log replay', sub: 'Synthetic logs (no real SSH)', note: '6 failed SSH_AUTH records. No SSH connection is made.' },
  { key: 'port_scan', icon: 'rules', title: 'Port scan replay', sub: 'Synthetic events (no real scan)', note: '9 CONNECTION events on ports 8000–8008. No packets are sent.' },
  { key: 'suspicious_login', icon: 'alert', title: 'Login after failures', sub: 'Synthetic events', note: '6 failed HTTP_AUTH + 1 success. Opens HTTP brute force and SUSPICIOUS_LOGIN.' },
  { key: 'traffic_anomaly', icon: 'trace', title: 'Traffic anomaly', sub: 'Synthetic events (no flood)', note: '120 CONNECTION events in a short burst. No packets are sent.' },
  { key: 'normal', icon: 'reports', title: 'Normal traffic', sub: 'Baseline, should not alert', note: '1 successful login + 1 connection. Expected result: no incident.' },
]

export default function DemoLab({ ctx }) {
  const { data } = ctx
  const now = useNow(5000)
  const [scenario, setScenario] = useState('http_brute_force')
  const [ip, setIp] = useState('192.0.2.25')
  const [log, setLog] = useState([])
  const chosen = SCENARIOS.find(s => s.key === scenario)
  const add = (kind, text, tone = '') => setLog(l => [{ at: new Date().toISOString(), kind, text, tone }, ...l].slice(0, 40))
  const loopback = ['127.0.0.1', '::1', '0.0.0.0', 'localhost'].includes(ip.trim())
  const [paced, setPaced] = useState(true)
  const [sim, setSim] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)
  // Paced replay progress (GET /api/simulations/state); every event also triggers a live refetch.
  useEffect(() => {
    let cancelled = false
    getJson('/api/simulations/state').then(r => { if (!cancelled) setSim(r) }).catch(() => {})
    return () => { cancelled = true }
  }, [ctx.version])
  const running = !!sim?.running

  const start = async () => {
    add('APP', `POST /api/simulations/start · ${scenario} · source ${ip} · 1 event / 0.5 s`)
    const r = await ctx.act('/api/simulations/start', { body: { scenario, source_ip: ip.trim(), interval_ms: 500 } })
    if (!r) return add('ERR', 'เริ่มไม่สำเร็จ · ดูการแจ้งเตือนมุมล่าง', 'coral')
    setSim(r.data)
    add(scenario === 'ssh_brute_force_logs' ? 'REPLAY' : 'EVENT', `${r.data.total} events will arrive one by one · ${r.data.source_note}`, 'amber')
  }
  const stop = async () => {
    const r = await ctx.act('/api/simulations/stop', { ok: 'หยุดการจำลองแล้ว' })
    if (r) { setSim(r.data); add('APP', `Stopped after ${r.data.sent}/${r.data.total} events`) }
  }
  const reset = async () => {
    setConfirmReset(false)
    add('APP', 'POST /api/demo/reset')
    const r = await ctx.act('/api/demo/reset', { ok: (d) => `เริ่มรอบใหม่แล้ว · ปิดกฎ ${d.rules_disabled} · ปิด incident ${d.incidents_closed}` })
    if (r) add('APP', `Reset · ${r.data.rules_disabled} rules disabled · ${r.data.incidents_closed} incidents closed · history kept`, 'mint')
  }

  const run = async () => {
    add('APP', `POST /api/simulations · ${scenario} · source ${ip}`)
    const r = await ctx.act('/api/simulations', { body: { scenario, source_ip: ip.trim() } })
    if (!r) return add('ERR', 'จำลองไม่สำเร็จ · ดูการแจ้งเตือนมุมล่าง', 'coral')
    add(scenario === 'ssh_brute_force_logs' ? 'REPLAY' : 'EVENT', `${r.data.events_created} events stored · ${r.data.source_note}`, 'amber')
    if (r.data.incident) add('APP', `Incident ${incId(r.data.incident.id)} ${r.data.incident.kind} · ${r.data.incident.event_count} events`, 'coral')
    else add('INFO', 'No incident opened (below threshold)', 'mint')
  }
  const probe = async (label) => {
    add('HTTP', `POST /api/demo/traffic · source ${ip} (${label})`)
    const r = await ctx.act('/api/demo/traffic', { body: { source_ip: ip.trim() }, accept: [403] })
    if (r) add('HTTP', `${r.status} ${r.data.decision}${r.data.rule_id ? ` · rule ${r.data.rule_id}` : ''}`, r.status === 403 ? 'coral' : 'mint')
    else add('ERR', 'ส่งคำขอไม่สำเร็จ · ดูการแจ้งเตือนมุมล่าง', 'coral')
  }

  // Runbook reflects what the server has recorded for this source IP, not what this page clicked.
  const incident = data.incidents.find(i => i.source_ip === ip.trim() && i.kind !== 'SUSPICIOUS_LOGIN') || data.incidents.find(i => i.source_ip === ip.trim())
  const proposal = incident && data.proposals.find(p => p.incident_id === incident.id)
  const activeRule = proposal && data.rules.find(r => r.proposal_id === proposal.id && isActiveRule(r, now))
  const baseline = data.traffic.some(t => t.source_ip === ip.trim() && t.decision === 'allowed')
  const steps = [
    ['Send baseline request (200)', 'Prove the source is allowed before any rule.', baseline, <button className="btn ghost sm" disabled={ctx.busy} onClick={() => probe('baseline')}>Send</button>],
    ['Trigger the scenario', 'Run the selected replay to cross the detection threshold.', !!incident, <button className="btn ghost sm" disabled={ctx.busy} onClick={run}>Run</button>],
    ['Open incident', 'Review the detected activity.', !!incident, incident && <a className="btn ghost sm" href={`#/incident/${incident.id}`}>{incId(incident.id)}</a>],
    ['Run local agent', 'Model reads evidence with read-only tools.', !!incident?.analysis, incident && <a className="btn ghost sm" href={`#/trace/${incident.id}`}>Trace</a>],
    [proposal?.status === 'rejected' ? 'Human rejected' : !proposal && incident?.analysis && noProposalNote[incident.status] ? 'No block proposed' : 'Human approves', proposal?.status === 'rejected' ? 'ข้อเสนอถูกปฏิเสธ ไม่มีการสร้างกฎ · ดูรายงานหรือกด Reset เพื่อเริ่มรอบใหม่' : !proposal && incident?.analysis && noProposalNote[incident.status] ? `ผลวิเคราะห์ไม่เสนอให้บล็อก (${noProposalNote[incident.status]}) · ไม่มีขั้นอนุมัติ` : 'Review evidence and approve a temporary app-level block.', proposal?.status === 'approved', proposal && <a className="btn ghost sm" href={`#/approvals/${proposal.id}`}>Review</a>],
    ['Send new request (403)', activeRule ? 'ส่งคำขอใหม่ด้วย IP จำลองนี้เพื่อยืนยันผล' : 'ต้องมีกฎที่กำลังทำงานก่อน จึงจะทดสอบการบล็อกได้', incident?.status === 'verified', <button className="btn ghost sm" disabled={ctx.busy || !activeRule} onClick={() => probe('verification')}>Send</button>],
    ['Review report', 'Detection → investigation → decision → verification.', incident?.status === 'verified', incident && <a className="btn ghost sm" href={`#/reports/${incident.id}`}>Report</a>],
  ]
  const next = steps.findIndex(s => !s[2])

  return <div className="grid lab">
    <div className="span3"><Banner tone="info" icon="terminal">หน้านี้ใช้ซ้อมด้วยข้อมูลจำลองบนเซิร์ฟเวอร์ · การทดสอบข้ามเครื่องให้ส่งจาก Terminal ของเครื่องทดสอบตามคู่มือ</Banner></div>

    <div className="scenarios span3" role="group" aria-label="Scenario">
      {SCENARIOS.map(s => <button key={s.key} aria-pressed={scenario === s.key} className={`scenario ${scenario === s.key ? 'on' : ''}`} onClick={() => setScenario(s.key)}>
        <Icon name={s.icon} size={26} /><span><b>{s.title}</b><small>{s.sub}</small></span>{scenario === s.key && <Icon name="ok" size={20} className="tick" />}
      </button>)}
    </div>

    <Panel title="Scenario Setup" icon="rules">
      <div className="form">
        <div className="field"><span>Mode</span><div className="seg"><span className="on">Server replay</span><span>Tests via Terminal</span></div></div>
        <div className="field"><span>Target</span><code>{location.origin}</code><small className="muted">เซิร์ฟเวอร์ที่เชื่อมต่ออยู่</small></div>
        <label className="field"><span>Source IP</span><input value={ip} onChange={e => setIp(e.target.value)} className="mono" aria-describedby="ipnote" /><small id="ipnote" className={loopback ? 'coral' : 'muted'}>{loopback ? 'Loopback is protected — approval will be refused (HTTP 400)' : 'Lab source only, e.g. 192.0.2.25 (TEST-NET-1)'}</small></label>
        <div className="field"><span>Scenario</span><p className="muted small">{chosen.note}</p></div>
        <label className="check"><input type="checkbox" checked={paced} onChange={e => setPaced(e.target.checked)} /> ส่งทีละ event (0.5 วินาที) ให้เห็นบน dashboard แบบสด</label>
        {running
          ? <button className="btn danger big" disabled={ctx.busy} onClick={stop}><Icon name="x" />หยุด · ส่งแล้ว {sim.sent}/{sim.total}</button>
          : <button className="btn primary big" disabled={ctx.busy || !!ctx.error || !ip.trim()} onClick={paced ? start : run}><Icon name="play" />{ctx.busy ? 'กำลังดำเนินการ…' : 'เริ่มเหตุการณ์จำลอง'}</button>}
        {sim && !running && sim.finished_at && <p className="muted small">รอบล่าสุด: {sim.scenario} · {sim.sent}/{sim.total} events{sim.stopped ? ' · หยุดก่อนจบ' : ''}{sim.incident_ids?.length ? ` · ${sim.incident_ids.map(incId).join(', ')}` : ''}</p>}
        <button className="btn ghost" disabled={ctx.busy || !!ctx.error || !ip.trim()} onClick={() => probe('baseline')}><Icon name="send" />ส่งคำขอก่อนบล็อก</button>
        {confirmReset
          ? <div className="confirm block"><span>ปิดกฎที่ทำงานอยู่ ปิด incident ที่ยังเปิด และปฏิเสธข้อเสนอค้าง? (ประวัติยังอยู่)</span><button className="btn danger sm" disabled={ctx.busy} onClick={reset}>Reset</button><button className="btn ghost sm" onClick={() => setConfirmReset(false)}>Cancel</button></div>
          : <button className="btn ghost" disabled={ctx.busy || !!ctx.error || running} onClick={() => setConfirmReset(true)}><Icon name="back" />Reset เริ่มซ้อมรอบใหม่</button>}
      </div>
    </Panel>

    <Panel title="Demo Runbook" icon="rules" className="span2" actions={<span className="muted small">status from server for {ip || '—'}</span>}>
      <p className="tableHint">สถานะอ้างอิงข้อมูลเดิมของ IP นี้ด้วย · ใช้ IP จำลองใหม่เมื่อต้องการเริ่มอีกรอบ</p>
      {scenario === 'normal' ? <Banner tone="info">เหตุการณ์ปกติจะเพิ่ม login สำเร็จ 1 ครั้งและ connection 1 รายการ โดยตัวมันเองไม่ควรเปิด incident · <a href="#/overview">ดูภาพรวมหลังเริ่มจำลอง</a></Banner> : <ol className="runbook">{steps.map(([title, note, done, action], i) => <li key={title} className={done ? 'done' : i === next ? 'current' : ''}>
        <span className="num">{done ? <Icon name="ok" size={18} /> : i + 1}</span>
        <div><b>{title}</b><small>{note}</small></div>
        <div className="runAction">{i === 4 && proposal?.status === 'rejected' ? <Badge tone="bad">Rejected</Badge> : done ? <Badge tone="good">Completed</Badge> : i === next ? <Badge tone="warn">Next</Badge> : <Badge tone="muted">Waiting</Badge>}{action}</div>
      </li>)}</ol>}
    </Panel>

    <Panel title="Session Output" icon="terminal" className="span2" actions={<span className="legend"><span><i className="dot mint" />Real HTTP request</span><span><i className="dot amber" />Synthetic replay event</span></span>}>
      {log.length ? <div className="log tall" role="log" aria-live="polite">{[...log].reverse().map((l, i) => <div key={i}><time>{fmtTime(l.at)}</time><span className="tag">[{l.kind}]</span><span className={l.tone}>{l.text}</span></div>)}</div>
        : <Empty>ยังไม่ได้รันอะไรในหน้านี้</Empty>}
    </Panel>

    <Panel title="Lab Connections" icon="trace">
      <div className="labLink"><div><Icon name="laptop" size={30} /><b>เครื่องทดสอบ</b><small>Terminal requests</small></div><span className="wire">local network</span><div><Icon name="server" size={30} /><b>เซิร์ฟเวอร์ SENTINEL</b><small className="mono">{location.host}</small></div></div>
      <p className="muted small center">เครื่องทดสอบส่งคำขอ ระบบวิเคราะห์และเสนอแนวทางให้ผู้ดูแลอนุมัติ</p>
    </Panel>
  </div>
}
