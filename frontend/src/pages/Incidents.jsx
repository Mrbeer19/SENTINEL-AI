import React, { useMemo, useState } from 'react'
import { Empty, FilterSummary, Icon, NoResults, Panel, SeverityBadge, Stat, StatusBadge, Stepper, SEVERITIES, fmtTime, incId, incidentStatus, isOpenIncident, kindEvidence, kindName, noProposalNote, perMinute, useNow } from '../ui.jsx'

// Event types each detection rule reads; SUSPICIOUS_LOGIN covers both login channels.
const typesFor = { HTTP_AUTH_BRUTE_FORCE: ['HTTP_AUTH'], SSH_BRUTE_FORCE: ['SSH_AUTH'], PORT_SCAN: ['CONNECTION'], TRAFFIC_ANOMALY: ['CONNECTION'], SUSPICIOUS_LOGIN: ['HTTP_AUTH', 'SSH_AUTH'] }
export const incidentEvents = (events, incident) => events.filter(e => e.source_ip === incident.source_ip && (typesFor[incident.kind] || [e.event_type]).includes(e.event_type))

export function stagesFor(incident) {
  const s = incident.status
  const analyzed = !!incident.analysis
  const decided = ['blocked', 'verified', 'rejected'].includes(s)
  if (s === 'closed' && !analyzed) return [
    { label: 'Detected', state: 'done', note: fmtTime(incident.created_at) },
    { label: 'Closed', state: 'stop', note: 'Before analysis' },
    { label: 'Approved', state: 'todo', note: 'Not applicable' },
    { label: 'Verified', state: 'todo', note: 'Not applicable' },
  ]
  if (analyzed && noProposalNote[s] && !decided) return [
    { label: 'Detected', state: 'done', note: fmtTime(incident.created_at) },
    { label: 'Investigated', state: 'done', note: incident.analysis_mode },
    { label: 'No block proposed', state: s === 'needs_review' ? 'current' : 'done', note: noProposalNote[s] },
    { label: 'Verified', state: 'todo', note: 'Not applicable' },
  ]
  return [
    { label: 'Detected', state: 'done', note: fmtTime(incident.created_at) },
    { label: 'Investigated', state: analyzed ? 'done' : 'current', note: analyzed ? incident.analysis_mode : s === 'analyzing' ? 'Running…' : 'Run investigation' },
    { label: s === 'rejected' ? 'Rejected' : 'Approved', state: s === 'rejected' ? 'stop' : decided ? 'done' : analyzed ? 'current' : 'todo', note: decided ? (s === 'rejected' ? 'No rule created' : 'Decision recorded') : 'Human decision' },
    { label: 'Verified', state: s === 'verified' ? 'done' : s === 'blocked' ? 'current' : s === 'rejected' ? 'todo' : 'todo', note: s === 'verified' ? 'New request denied' : s === 'blocked' ? 'Send a new request' : 'Pending' },
  ]
}

export default function Incidents({ ctx }) {
  const { data } = ctx
  const now = useNow(5000)
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('all')
  const [status, setStatus] = useState('all')
  const [order, setOrder] = useState('newest')
  const [selectedId, setSelectedId] = useState(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = data.incidents.filter(i =>
      (!q || [incId(i.id), i.source_ip, i.kind, kindName(i.kind)].some(v => v.toLowerCase().includes(q))) &&
      (severity === 'all' || String(i.severity).toUpperCase() === severity) && (status === 'all' || i.status === status))
    return order === 'newest' ? list : [...list].reverse()
  }, [data.incidents, query, severity, status, order])

  const selected = rows.find(i => i.id === selectedId) || rows[0]
  const count = (fn) => data.incidents.filter(fn).length
  const filtered = !!query || severity !== 'all' || status !== 'all'
  const clear = () => { setQuery(''); setSeverity('all'); setStatus('all') }

  return <div className="grid incidents">
    <div className="stats four span3">
      <Stat icon="rules" label="Open" value={count(isOpenIncident)} />
      <Stat icon="alert" tone="coral" label="High / critical" value={count(i => ['HIGH', 'CRITICAL'].includes(String(i.severity).toUpperCase()))} />
      <Stat icon="clock" tone="amber" label="Awaiting approval" value={count(i => i.status === 'awaiting_approval')} />
      <Stat icon="ok" label="Verified blocked" value={count(i => i.status === 'verified')} />
    </div>

    <Panel className="span2">
      <div className="filters" role="search">
        <label className="search"><Icon name="search" size={16} /><span className="sr">Search</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search incident, IP or type" /></label>
        <label><span className="sr">Severity</span><select value={severity} onChange={e => setSeverity(e.target.value)}><option value="all">Severity: All</option>{SEVERITIES.map(v => <option key={v} value={v}>{v[0] + v.slice(1).toLowerCase()}</option>)}</select></label>
        <label><span className="sr">Status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Status: All</option>{Object.entries(incidentStatus).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <label><span className="sr">Order</span><select value={order} onChange={e => setOrder(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
      </div>
      <FilterSummary count={rows.length} total={data.incidents.length} active={filtered} onClear={clear} />
      {rows.length > 0 && <p className="tableHint">เลือกหมายเลข incident เพื่อดูสรุป หรือกด “เปิดรายละเอียด” เพื่อดำเนินการต่อ</p>}
      {rows.length ? <div className="tableWrap"><table>
        <thead><tr><th>Incident</th><th>Detection</th><th>Source IP</th><th>Evidence</th><th>Severity</th><th>Status</th><th>Last event</th></tr></thead>
        <tbody>{rows.map(i => {
          const last = incidentEvents(data.events, i)[0]
          return <tr key={i.id} className={`clickable ${selected?.id === i.id ? 'selected' : ''}`} onClick={() => setSelectedId(i.id)}>
            <td><button className="link" onClick={() => setSelectedId(i.id)} aria-pressed={selected?.id === i.id}>{incId(i.id)}</button></td>
            <td>{kindName(i.kind)}</td><td className="mono">{i.source_ip}</td><td>{kindEvidence(i)}</td>
            <td><SeverityBadge value={i.severity} /></td><td><StatusBadge status={i.status} /></td><td className="mono">{fmtTime(last?.timestamp || i.created_at)}</td>
          </tr>
        })}</tbody></table></div>
        : filtered ? <NoResults onClear={clear} /> : <Empty>ยังไม่มี incident · ระบบจะเพิ่มรายการเมื่อตรวจพบเหตุการณ์จาก rod-mai-rod</Empty>}
    </Panel>

    <Panel className="side">
      {selected ? <IncidentSummary incident={selected} events={data.events} now={now} /> : <Empty>เลือก incident เพื่อดูสรุป</Empty>}
    </Panel>
  </div>
}

function IncidentSummary({ incident, events, now }) {
  const evidence = incidentEvents(events, incident)
  const series = perMinute(evidence, 'timestamp', 10, now)
  const latest = evidence[0]
  return <div className="summary">
    <div className="summaryHead"><div><h2>{incId(incident.id)}</h2><p>{kindName(incident.kind)}</p></div><SeverityBadge value={incident.severity} /></div>
    <div className="kv"><Icon name="laptop" size={22} /><div><b>Source</b><span className="mono">{incident.source_ip}</span></div></div>
    <div className="kv"><Icon name="rules" size={22} /><div><b>{kindEvidence(incident)}</b><span>within the 60-second detection window</span></div></div>
    <h3><Icon name="pulse" /> Event activity <small>(events / minute · 10 min)</small></h3>
    {series.some(Boolean) ? <div className="barRow small coralBars">{series.map((v, i) => <span key={i} style={{ height: `${(v / Math.max(...series)) * 100}%` }} title={`${v}`} />)}</div> : <p className="muted small">ไม่มี event ของ IP นี้ใน 10 นาทีล่าสุด</p>}
    <h3><Icon name="terminal" /> Latest evidence</h3>
    {latest ? <code className="evidence">{latest.event_type} · {latest.outcome}{latest.destination_port ? ` · port ${latest.destination_port}` : ''} · {fmtTime(latest.timestamp)}</code> : <p className="muted small">ไม่พบ event</p>}
    <h3><Icon name="trace" /> Investigation stage</h3>
    <Stepper steps={stagesFor(incident)} />
    <a className="btn primary block" href={`#/incident/${incident.id}`}>เปิดรายละเอียด<Icon name="chevron" size={16} /></a>
    <a className="btn ghost block" href={`#/trace/${incident.id}`}>ดูขั้นตอนการวิเคราะห์</a>
    {incident.kind === 'SSH_BRUTE_FORCE' && <p className="muted small"><Icon name="info" size={14} /> SSH scenario uses synthetic log replay</p>}
  </div>
}
