import React, { useState } from 'react'
import { Badge, Banner, Empty, Icon, Panel, fmtTime, incId } from '../ui.jsx'

const SCENARIOS = [
  { key: 'http_brute_force', icon: 'laptop', title: 'HTTP login replay', sub: '6 failed HTTP_AUTH events', note: 'Synthetic events through the normal ingestion path. For real HTTP requests use Neo Demo.' },
  { key: 'ssh_brute_force_logs', icon: 'terminal', title: 'SSH log replay', sub: 'Synthetic logs (no real SSH)', note: '6 failed SSH_AUTH records. No SSH connection is made.' },
  { key: 'port_scan', icon: 'rules', title: 'Port scan replay', sub: 'Synthetic events (no real scan)', note: '9 CONNECTION events on ports 8000–8008. No packets are sent.' },
  { key: 'normal', icon: 'reports', title: 'Normal traffic', sub: 'Baseline, should not alert', note: '1 successful login + 1 connection. Expected result: no incident.' },
]

export default function DemoLab({ ctx }) {
  const { data } = ctx
  const [scenario, setScenario] = useState('http_brute_force')
  const [ip, setIp] = useState('192.0.2.25')
  const [log, setLog] = useState([])
  const chosen = SCENARIOS.find(s => s.key === scenario)
  const add = (kind, text, tone = '') => setLog(l => [{ at: new Date().toISOString(), kind, text, tone }, ...l].slice(0, 40))
  const loopback = ['127.0.0.1', '::1', '0.0.0.0', 'localhost'].includes(ip.trim())

  const run = async () => {
    add('APP', `POST /api/simulations · ${scenario} · source ${ip}`)
    const r = await ctx.act('/api/simulations', { body: { scenario, source_ip: ip.trim() } })
    if (!r) return add('ERR', 'Simulation failed — see banner above', 'coral')
    add(scenario === 'ssh_brute_force_logs' ? 'REPLAY' : 'EVENT', `${r.data.events_created} events stored · ${r.data.source_note}`, 'amber')
    if (r.data.incident) add('APP', `Incident ${incId(r.data.incident.id)} ${r.data.incident.kind} · ${r.data.incident.event_count} events`, 'coral')
    else add('INFO', 'No incident opened (below threshold)', 'mint')
  }
  const probe = async (label) => {
    add('HTTP', `POST /api/demo/traffic · source ${ip} (${label})`)
    const r = await ctx.act('/api/demo/traffic', { body: { source_ip: ip.trim() }, accept: [403] })
    if (r) add('HTTP', `${r.status} ${r.data.decision}${r.data.rule_id ? ` · rule ${r.data.rule_id}` : ''}`, r.status === 403 ? 'coral' : 'mint')
    else add('ERR', 'Request failed — see banner above', 'coral')
  }

  // Runbook reflects what the server has recorded for this source IP, not what this page clicked.
  const incident = data.incidents.find(i => i.source_ip === ip.trim())
  const proposal = incident && data.proposals.find(p => p.incident_id === incident.id)
  const baseline = data.traffic.some(t => t.source_ip === ip.trim() && t.decision === 'allowed')
  const steps = [
    ['Send baseline request (200)', 'Prove the source is allowed before any rule.', baseline, <button className="btn ghost sm" disabled={ctx.busy} onClick={() => probe('baseline')}>Send</button>],
    ['Trigger the scenario', 'Run the selected replay to cross the detection threshold.', !!incident, <button className="btn ghost sm" disabled={ctx.busy} onClick={run}>Run</button>],
    ['Open incident', 'Review the detected activity.', !!incident, incident && <a className="btn ghost sm" href={`#/incident/${incident.id}`}>{incId(incident.id)}</a>],
    ['Run local agent', 'Model reads evidence with read-only tools.', !!incident?.analysis, incident && <a className="btn ghost sm" href={`#/trace/${incident.id}`}>Trace</a>],
    ['Human approves', 'Review evidence and approve a temporary app-level block.', proposal && proposal.status !== 'pending', proposal && <a className="btn ghost sm" href={`#/approvals/${proposal.id}`}>Review</a>],
    ['Send new request (403)', 'A new request from the same source must be denied.', incident?.status === 'verified', <button className="btn ghost sm" disabled={ctx.busy} onClick={() => probe('verification')}>Send</button>],
    ['Review report', 'Detection → investigation → decision → verification.', incident?.status === 'verified', incident && <a className="btn ghost sm" href={`#/reports/${incident.id}`}>Report</a>],
  ]
  const next = steps.findIndex(s => !s[2])

  return <div className="grid lab">
    <div className="span3"><Banner tone="warn" icon="info">Local replay runs on this M5 with a lab source IP (source override works from localhost only). Use <a href="/neo/" target="_blank" rel="noreferrer">Neo Demo</a> on the tester machine for the real peer IP.</Banner></div>

    <div className="scenarios span3" role="radiogroup" aria-label="Scenario">
      {SCENARIOS.map(s => <button key={s.key} role="radio" aria-checked={scenario === s.key} className={`scenario ${scenario === s.key ? 'on' : ''}`} onClick={() => setScenario(s.key)}>
        <Icon name={s.icon} size={26} /><span><b>{s.title}</b><small>{s.sub}</small></span>{scenario === s.key && <Icon name="ok" size={20} className="tick" />}
      </button>)}
    </div>

    <Panel title="Scenario Setup" icon="rules">
      <div className="form">
        <div className="field"><span>Mode</span><div className="seg"><span className="on">Local replay</span><a href="/neo/" target="_blank" rel="noreferrer">Neo live requests <Icon name="external" size={12} /></a></div></div>
        <div className="field"><span>Target</span><code>{location.origin}</code><small className="muted">This M5 backend</small></div>
        <label className="field"><span>Source IP</span><input value={ip} onChange={e => setIp(e.target.value)} className="mono" aria-describedby="ipnote" /><small id="ipnote" className={loopback ? 'coral' : 'muted'}>{loopback ? 'Loopback is protected — approval will be refused (HTTP 400)' : 'Lab source only, e.g. 192.0.2.25 (TEST-NET-1)'}</small></label>
        <div className="field"><span>Scenario</span><p className="muted small">{chosen.note}</p></div>
        <button className="btn primary big" disabled={ctx.busy || !ip.trim()} onClick={run}><Icon name="play" />Run controlled scenario</button>
        <button className="btn ghost" disabled={ctx.busy || !ip.trim()} onClick={() => probe('baseline')}><Icon name="send" />Send baseline request</button>
      </div>
    </Panel>

    <Panel title="Demo Runbook" icon="rules" className="span2" actions={<span className="muted small">status from server for {ip || '—'}</span>}>
      <ol className="runbook">{steps.map(([title, note, done, action], i) => <li key={title} className={done ? 'done' : i === next ? 'current' : ''}>
        <span className="num">{done ? <Icon name="ok" size={18} /> : i + 1}</span>
        <div><b>{title}</b><small>{note}</small></div>
        <div className="runAction">{done ? <Badge tone="good">Completed</Badge> : i === next ? <Badge tone="warn">Next</Badge> : <Badge tone="muted">Waiting</Badge>}{action}</div>
      </li>)}</ol>
    </Panel>

    <Panel title="Session Output" icon="terminal" className="span2" actions={<span className="legend"><span><i className="dot mint" />Real HTTP request</span><span><i className="dot amber" />Synthetic replay event</span></span>}>
      {log.length ? <div className="log tall" role="log" aria-live="polite">{[...log].reverse().map((l, i) => <div key={i}><time>{fmtTime(l.at)}</time><span className="tag">[{l.kind}]</span><span className={l.tone}>{l.text}</span></div>)}</div>
        : <Empty>ยังไม่ได้รันอะไรในหน้านี้</Empty>}
    </Panel>

    <Panel title="Lab Connections" icon="trace">
      <div className="labLink"><div><Icon name="laptop" size={30} /><b>Neo (tester)</b><small>opens /neo/</small></div><span className="wire">local network</span><div><Icon name="server" size={30} /><b>M5 Server</b><small className="mono">{location.host}</small></div></div>
      <button className="btn ghost block" disabled title="Needs POST /api/demo/reset (contract v0.2 draft)"><Icon name="refresh" />Reset after review</button>
      <p className="muted small center">Reset waits for <code>/api/demo/reset</code> in contract v0.2 — nothing is deleted from this page.</p>
    </Panel>
  </div>
}
