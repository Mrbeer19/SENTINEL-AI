import React, { useState } from 'react'
import { Badge, Empty, Icon, Panel, go, SeverityBadge, Stat, StatusBadge, fmtTime, incId, isActiveRule, kindName, perMinute, useNow } from '../ui.jsx'
import ActivityChart from '../components/ActivityChart.jsx'
import NetworkTopology from '../components/NetworkTopology.jsx'
import { NextStep } from '../components/WorkflowGuide.jsx'

const OPEN = ['detected', 'awaiting_approval', 'blocked']

export default function Overview({ ctx }) {
  const { data } = ctx
  const now = useNow(5000)
  const [minutes, setMinutes] = useState(15)
  const open = data.incidents.filter(i => OPEN.includes(i.status))
  const pending = data.proposals.filter(p => p.status === 'pending')
  const activeRules = data.rules.filter(r => isActiveRule(r, now))
  const eventSeries = perMinute(data.events, 'timestamp', 15, now)
  const trafficSeries = perMinute(data.traffic, 'created_at', minutes, now)
  const latest = data.incidents[0]
  const nextIncident = data.incidents.find(i => i.status === 'awaiting_approval') || data.incidents.find(i => i.status === 'detected') || data.incidents.find(i => i.status === 'blocked' && activeRules.some(r => data.proposals.find(p => p.id === r.proposal_id)?.incident_id === i.id)) || data.incidents.find(i => i.status === 'blocked') || latest

  return <><NextStep ctx={ctx} incident={nextIncident} overview /><div className="grid overview">
    <div className="stats four">
      <Stat icon="alert" tone="coral" label="Open incidents" value={open.length} note="Awaiting resolution" series={perMinute(data.incidents, 'created_at', 15, now)} />
      <Stat icon="clock" tone="amber" label="Pending approval" value={pending.length} note="human decision required" />
      <Stat icon="shield" tone="mint" label="Active blocks" value={activeRules.length} note="app-level rules" />
      <Stat icon="pulse" tone="mint" label="Events · last 15 min" value={eventSeries.reduce((a, b) => a + b, 0)} note="stored in SQLite" series={eventSeries} />
    </div>

    <Panel title="Live Network Activity" icon="trace" className="span2 networkPanel" actions={<Legend />}>
      <NetworkTopology data={data} activeRules={activeRules} connected={ctx.connected} />
    </Panel>

    <div className="stack overviewAside">
      <Panel title="Request Activity" icon="reports" className="requestPanel" actions={<label className="chartRange"><span className="sr">Request chart time window</span><select value={minutes} onChange={event => setMinutes(Number(event.target.value))}><option value={15}>15 min</option><option value={30}>30 min</option><option value={60}>60 min</option></select></label>}>
        <ActivityChart values={trafficSeries} now={now} />
      </Panel>
      <Panel title="Agent Investigation" icon="brain" actions={latest && <a className="link" href={`#/trace/${latest.id}`}>{incId(latest.id)}</a>}>
        {latest ? <AgentSteps incident={latest} /> : <Empty>ยังไม่มีการสืบสวน</Empty>}
      </Panel>
      <Panel title="Action Requires Approval" icon="alert" className={pending.length ? 'attention' : ''}>
        {pending.length ? <div className="approvalTeaser">
          <b>Temporary app-level block</b>
          <span className="mono">{pending[0].source_ip} · {pending[0].duration_seconds / 60} minutes</span>
          {pending.length > 1 && <small className="muted">+{pending.length - 1} more pending</small>}
          <a className="btn primary" href={`#/approvals/${pending[0].id}`}><Icon name="check" size={17} />Review approval<Icon name="chevron" size={15} /></a>
          <small className="muted"><Icon name="info" size={14} /> No action runs before approval</small>
        </div> : <Empty icon="ok">ไม่มีงานรออนุมัติ</Empty>}
      </Panel>
    </div>

    <Panel title="Recent Incidents" icon="alert" className="span2 recentPanel" actions={<a className="link" href="#/incidents">View all <Icon name="chevron" size={14} /></a>}>
      {data.incidents.length ? <div className="tableWrap"><table>
        <thead><tr><th>Incident</th><th>Detection</th><th>Source</th><th>Severity</th><th>Status</th></tr></thead>
        <tbody>{data.incidents.slice(0, 5).map(i => <tr key={i.id} className="clickable" onClick={() => go('incident', i.id)}>
          <td><a href={`#/incident/${i.id}`} onClick={e => e.stopPropagation()}>{incId(i.id)}</a></td><td>{kindName(i.kind)}</td><td className="mono">{i.source_ip}</td><td><SeverityBadge value={i.severity} /></td><td><StatusBadge status={i.status} /></td>
        </tr>)}</tbody></table></div> : <Empty>ยังไม่มี incident · เริ่มจาก <a href="#/lab">Demo Lab</a> หรือส่ง request จาก Neo</Empty>}
    </Panel>

    <Panel title="Live Request Log" icon="terminal" className="span3 requestLogPanel" actions={<span className="streamLabel"><i className={`dot ${ctx.connected ? 'mint' : ''}`} />{ctx.connected ? 'LIVE STREAM' : 'STORED REQUESTS'}</span>}>
      <RequestLog traffic={data.traffic} />
    </Panel>
  </div></>
}

function Legend() {
  return <div className="legend"><span><i className="dot mint" />Allowed</span><span><i className="dot amber" />Open incident</span><span><i className="dot coral" />Blocked</span></div>
}

export function AgentSteps({ incident }) {
  const analyzed = !!incident.analysis
  const decided = ['blocked', 'verified', 'rejected'].includes(incident.status)
  const steps = [
    ['Incident detected', true],
    [incident.analysis_mode === 'rule_fallback' ? 'Rule-based evidence review' : 'Read evidence with tools', analyzed],
    ['Structured analysis', analyzed],
    [incident.status === 'rejected' ? 'Rejected by human' : 'Human decision', decided],
  ]
  return <ol className="miniSteps">{steps.map(([label, done], i) => <li key={label} className={done ? 'done' : (steps[i - 1]?.[1] ? 'current' : '')}><span className="stepIndex">{done ? <Icon name="ok" size={15} /> : i + 1}</span><span className="miniStepLabel">{label}</span>{done && <span className="stepComplete">Done</span>}</li>)}
    {incident.analysis_mode && <li className="note"><Badge tone={incident.analysis_mode === 'rule_fallback' ? 'warn' : 'good'}>{incident.analysis_mode === 'rule_fallback' ? 'Rule fallback' : 'Local model'}</Badge></li>}
  </ol>
}

export function RequestLog({ traffic, limit = 8 }) {
  if (!traffic.length) return <Empty>ยังไม่มี request เข้า demo application</Empty>
  return <div className="log" role="log" aria-live="polite">{traffic.slice(0, limit).map(t => <div key={t.id}>
    <time>{fmtTime(t.created_at)}</time><span className="mono">{t.source_ip}</span><span>demo app request</span><b className={t.decision === 'denied' ? 'coral' : 'mint'}>{t.decision === 'denied' ? '403 denied' : 'allowed'}</b>
  </div>)}</div>
}
