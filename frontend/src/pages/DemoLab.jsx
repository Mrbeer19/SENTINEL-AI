import React, { useState } from 'react'
import { Badge, Banner, Empty, Icon, Panel, fmtTime, incId, isActiveRule, useNow } from '../ui.jsx'

const SCENARIOS = [
  { key: 'http_brute_force', icon: 'laptop', title: 'HTTP login replay', sub: '6 failed HTTP_AUTH events', note: 'Synthetic events through the normal ingestion path. Real HTTP tests run from the Neo Terminal.' },
  { key: 'ssh_brute_force_logs', icon: 'terminal', title: 'SSH log replay', sub: 'Synthetic logs (no real SSH)', note: '6 failed SSH_AUTH records. No SSH connection is made.' },
  { key: 'port_scan', icon: 'rules', title: 'Port scan replay', sub: 'Synthetic events (no real scan)', note: '9 CONNECTION events on ports 8000–8008. No packets are sent.' },
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
  const incident = data.incidents.find(i => i.source_ip === ip.trim())
  const proposal = incident && data.proposals.find(p => p.incident_id === incident.id)
  const activeRule = proposal && data.rules.find(r => r.proposal_id === proposal.id && isActiveRule(r, now))
  const baseline = data.traffic.some(t => t.source_ip === ip.trim() && t.decision === 'allowed')
  const steps = [
    ['Send baseline request (200)', 'Prove the source is allowed before any rule.', baseline, <button className="btn ghost sm" disabled={ctx.busy} onClick={() => probe('baseline')}>Send</button>],
    ['Trigger the scenario', 'Run the selected replay to cross the detection threshold.', !!incident, <button className="btn ghost sm" disabled={ctx.busy} onClick={run}>Run</button>],
    ['Open incident', 'Review the detected activity.', !!incident, incident && <a className="btn ghost sm" href={`#/incident/${incident.id}`}>{incId(incident.id)}</a>],
    ['Run local agent', 'Model reads evidence with read-only tools.', !!incident?.analysis, incident && <a className="btn ghost sm" href={`#/trace/${incident.id}`}>Trace</a>],
    [proposal?.status === 'rejected' ? 'Human rejected' : 'Human approves', proposal?.status === 'rejected' ? 'ข้อเสนอถูกปฏิเสธ ไม่มีการสร้างกฎ · ดูรายงานหรือเริ่มทดสอบด้วย IP จำลองใหม่' : 'Review evidence and approve a temporary app-level block.', proposal?.status === 'approved', proposal && <a className="btn ghost sm" href={`#/approvals/${proposal.id}`}>Review</a>],
    ['Send new request (403)', activeRule ? 'ส่งคำขอใหม่ด้วย IP จำลองนี้เพื่อยืนยันผล' : 'ต้องมีกฎที่กำลังทำงานก่อน จึงจะทดสอบการบล็อกได้', incident?.status === 'verified', <button className="btn ghost sm" disabled={ctx.busy || !activeRule} onClick={() => probe('verification')}>Send</button>],
    ['Review report', 'Detection → investigation → decision → verification.', incident?.status === 'verified', incident && <a className="btn ghost sm" href={`#/reports/${incident.id}`}>Report</a>],
  ]
  const next = steps.findIndex(s => !s[2])

  return <div className="grid lab">
    <div className="span3"><Banner tone="info" icon="terminal">หน้านี้ใช้ซ้อมด้วยข้อมูลจำลองบน M5 · การทดสอบข้ามเครื่องจริงให้ส่งจาก Terminal ของ Neo โดยใช้คู่มือที่แยกไว้</Banner></div>

    <div className="scenarios span3" role="group" aria-label="Scenario">
      {SCENARIOS.map(s => <button key={s.key} aria-pressed={scenario === s.key} className={`scenario ${scenario === s.key ? 'on' : ''}`} onClick={() => setScenario(s.key)}>
        <Icon name={s.icon} size={26} /><span><b>{s.title}</b><small>{s.sub}</small></span>{scenario === s.key && <Icon name="ok" size={20} className="tick" />}
      </button>)}
    </div>

    <Panel title="Scenario Setup" icon="rules">
      <div className="form">
        <div className="field"><span>Mode</span><div className="seg"><span className="on">M5 local replay</span><span>Neo tests via Terminal</span></div></div>
        <div className="field"><span>Target</span><code>{location.origin}</code><small className="muted">This M5 backend</small></div>
        <label className="field"><span>Source IP</span><input value={ip} onChange={e => setIp(e.target.value)} className="mono" aria-describedby="ipnote" /><small id="ipnote" className={loopback ? 'coral' : 'muted'}>{loopback ? 'Loopback is protected — approval will be refused (HTTP 400)' : 'Lab source only, e.g. 192.0.2.25 (TEST-NET-1)'}</small></label>
        <div className="field"><span>Scenario</span><p className="muted small">{chosen.note}</p></div>
        <button className="btn primary big" disabled={ctx.busy || !!ctx.error || !ip.trim()} onClick={run}><Icon name="play" />{ctx.busy ? 'กำลังดำเนินการ…' : 'เริ่มเหตุการณ์จำลอง'}</button>
        <button className="btn ghost" disabled={ctx.busy || !!ctx.error || !ip.trim()} onClick={() => probe('baseline')}><Icon name="send" />ส่งคำขอก่อนบล็อก</button>
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
      <div className="labLink"><div><Icon name="laptop" size={30} /><b>Neo (tester)</b><small>Terminal requests</small></div><span className="wire">local network</span><div><Icon name="server" size={30} /><b>M5 Server</b><small className="mono">{location.host}</small></div></div>
      <p className="muted small center">Neo sends requests. M5 investigates and approves the response.</p>
    </Panel>
  </div>
}
