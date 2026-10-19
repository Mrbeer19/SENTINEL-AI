import React from 'react'
import { Badge, Empty, Icon, Panel, go, SeverityBadge, Stat, StatusBadge, fmtTime, incId, isActiveRule, kindName, perMinute, useNow } from '../ui.jsx'

const OPEN = ['detected', 'awaiting_approval', 'blocked']

export default function Overview({ ctx }) {
  const { data } = ctx
  const now = useNow(5000)
  const open = data.incidents.filter(i => OPEN.includes(i.status))
  const pending = data.proposals.filter(p => p.status === 'pending')
  const activeRules = data.rules.filter(r => isActiveRule(r, now))
  const eventSeries = perMinute(data.events, 'timestamp', 15, now)
  const trafficSeries = perMinute(data.traffic, 'created_at', 15, now)
  const latest = data.incidents[0]

  return <div className="grid overview">
    <div className="stats four">
      <Stat icon="alert" tone="coral" label="Open incidents" value={open.length} note="not yet verified or rejected" series={perMinute(data.incidents, 'created_at', 15, now)} />
      <Stat icon="clock" tone="amber" label="Pending approval" value={pending.length} note="human decision required" />
      <Stat icon="shield" tone="mint" label="Active blocks" value={activeRules.length} note="app-level rules" />
      <Stat icon="pulse" tone="mint" label="Events · last 15 min" value={eventSeries.reduce((a, b) => a + b, 0)} note="stored in SQLite" series={eventSeries} />
    </div>

    <Panel title="Live Network Activity" icon="trace" className="span2" actions={<Legend />}>
      <Topology data={data} activeRules={activeRules} />
    </Panel>

    <Panel title="Request Activity" icon="reports" actions={<span className="muted small">app requests / minute · 15 min</span>}>
      <Bars values={trafficSeries} now={now} />
    </Panel>

    <Panel title="Recent Incidents" icon="alert" className="span2" actions={<a className="link" href="#/incidents">View all <Icon name="external" size={14} /></a>}>
      {data.incidents.length ? <div className="tableWrap"><table>
        <thead><tr><th>Incident</th><th>Detection</th><th>Source</th><th>Severity</th><th>Status</th></tr></thead>
        <tbody>{data.incidents.slice(0, 5).map(i => <tr key={i.id} className="clickable" onClick={() => go('incident', i.id)}>
          <td><a href={`#/incident/${i.id}`} onClick={e => e.stopPropagation()}>{incId(i.id)}</a></td><td>{kindName(i.kind)}</td><td className="mono">{i.source_ip}</td><td><SeverityBadge value={i.severity} /></td><td><StatusBadge status={i.status} /></td>
        </tr>)}</tbody></table></div> : <Empty>ยังไม่มี incident · เริ่มจาก Demo Lab หรือให้เครื่อง Neo ส่ง login ผิดตามเกณฑ์</Empty>}
    </Panel>

    <div className="stack">
      <Panel title="Agent Investigation" icon="brain" actions={latest && <a className="link" href={`#/trace/${latest.id}`}>{incId(latest.id)}</a>}>
        {latest ? <AgentSteps incident={latest} /> : <Empty>ยังไม่มีการสืบสวน</Empty>}
      </Panel>
      <Panel title="Action Requires Approval" icon="alert" className={pending.length ? 'attention' : ''}>
        {pending.length ? <div className="approvalTeaser">
          <b>Temporary app-level block</b>
          <span className="mono">{pending[0].source_ip} · {pending[0].duration_seconds / 60} minutes</span>
          {pending.length > 1 && <small className="muted">+{pending.length - 1} more pending</small>}
          <a className="btn primary" href={`#/approvals/${pending[0].id}`}>Review approval</a>
          <small className="muted"><Icon name="info" size={14} /> No action runs before approval</small>
        </div> : <Empty icon="ok">ไม่มีงานรออนุมัติ</Empty>}
      </Panel>
    </div>

    <Panel title="Live Request Log" icon="terminal" className="span3">
      <RequestLog traffic={data.traffic} />
    </Panel>
  </div>
}

function Legend() {
  return <div className="legend"><span><i className="dot mint" />Allowed</span><span><i className="dot amber" />Open incident</span><span><i className="dot coral" />Blocked</span></div>
}

function Topology({ data, activeRules }) {
  // The latest non-loopback source seen by the app stands in for the tester; we do not guess which machine it is.
  const remote = data.traffic.find(t => !['127.0.0.1', '::1'].includes(t.source_ip))
  const ip = remote?.source_ip
  const blocked = ip && activeRules.some(r => r.source_ip === ip)
  const suspicious = ip && data.incidents.some(i => i.source_ip === ip && ['detected', 'awaiting_approval'].includes(i.status))
  const tone = blocked ? 'coral' : suspicious ? 'amber' : 'mint'
  return <div className="topology">
    <svg viewBox="0 0 640 330" role="img" aria-label={`Tester ${ip || 'not seen yet'} to M5 server: ${blocked ? 'blocked by app rule' : suspicious ? 'open incident' : 'allowed'}`}>
      <defs><radialGradient id="glow"><stop offset="0" stopColor="#11ead3" stopOpacity=".35" /><stop offset="1" stopColor="#11ead3" stopOpacity="0" /></radialGradient></defs>
      <ellipse cx="340" cy="150" rx="210" ry="110" className="orbit" />
      <ellipse cx="340" cy="150" rx="140" ry="70" className="orbit" />
      <circle cx="340" cy="150" r="90" fill="url(#glow)" />
      <path d="M110 150 C 200 140, 260 160, 320 150" className={`flow ${tone}`} />
      <path d="M360 140 L 520 70" className="flow mint" />
      <path d="M360 160 L 520 230" className="flow mint" />
      <path d="M330 170 L 230 250" className={`flow ${blocked ? 'coral' : 'dim'}`} />
      <Node x={90} y={150} icon="laptop" label="Tester (Neo)" sub={ip || 'no remote request yet'} tone={tone} />
      <Node x={340} y={150} icon="server" label="M5 Server" sub="SENTINEL API · local model" tone="mint" big />
      <Node x={540} y={60} icon="rules" label="Rule Engine" sub="threshold detection" tone="mint" />
      <Node x={540} y={240} icon="brain" label="Agent Engine" sub={data.health?.model_ready ? data.health.model : 'rule fallback'} tone={data.health?.model_ready ? 'mint' : 'amber'} />
      <Node x={210} y={262} icon="shield" label="App Firewall" sub={`${activeRules.length} active rule${activeRules.length === 1 ? '' : 's'}`} tone={activeRules.length ? 'coral' : 'mint'} />
    </svg>
  </div>
}

function Node({ x, y, icon, label, sub, tone, big }) {
  const r = big ? 34 : 24
  return <g transform={`translate(${x} ${y})`} className={`node ${tone}`}>
    <circle r={r} />
    <g transform={`translate(${-(big ? 14 : 11)} ${-(big ? 14 : 11)}) scale(${big ? 1.15 : .92})`}><Icon name={icon} size={24} /></g>
    <text y={r + 18} textAnchor="middle" className="nodeLabel">{label}</text>
    <text y={r + 34} textAnchor="middle" className="nodeSub">{sub}</text>
  </g>
}

function Bars({ values, now }) {
  const max = Math.max(1, ...values)
  if (!values.some(Boolean)) return <Empty>ยังไม่มี request ใน 15 นาทีล่าสุด</Empty>
  return <figure className="bars" aria-label={`App requests per minute, total ${values.reduce((a, b) => a + b, 0)}`}>
    <div className="barRow">{values.map((v, i) => <span key={i} style={{ height: `${(v / max) * 100}%` }} title={`${v} request(s)`} />)}</div>
    <figcaption><span>{fmtTime(now - 14 * 60000).slice(0, 5)}</span><span>max {max}/min</span><span>{fmtTime(now).slice(0, 5)}</span></figcaption>
  </figure>
}

export function AgentSteps({ incident }) {
  const analyzed = !!incident.analysis
  const decided = ['blocked', 'verified', 'rejected'].includes(incident.status)
  const steps = [
    ['Incident detected', true],
    ['Read evidence with tools', analyzed],
    ['Structured analysis', analyzed],
    [incident.status === 'rejected' ? 'Rejected by human' : 'Human decision', decided],
  ]
  return <ol className="miniSteps">{steps.map(([label, done], i) => <li key={label} className={done ? 'done' : (steps[i - 1]?.[1] ? 'current' : '')}><span>{i + 1}</span>{label}</li>)}
    {incident.analysis_mode && <li className="note"><Badge tone={incident.analysis_mode === 'rule_fallback' ? 'warn' : 'good'}>{incident.analysis_mode}</Badge></li>}
  </ol>
}

export function RequestLog({ traffic, limit = 8 }) {
  if (!traffic.length) return <Empty>ยังไม่มี request เข้า demo application</Empty>
  return <div className="log" role="log" aria-live="polite">{traffic.slice(0, limit).map(t => <div key={t.id}>
    <time>{fmtTime(t.created_at)}</time><span className="mono">{t.source_ip}</span><span>demo app request</span><b className={t.decision === 'denied' ? 'coral' : 'mint'}>{t.decision === 'denied' ? '403 denied' : 'allowed'}</b>
  </div>)}</div>
}
