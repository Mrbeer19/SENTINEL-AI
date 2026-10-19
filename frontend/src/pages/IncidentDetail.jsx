import React from 'react'
import { useReport } from '../api.js'
import { Badge, Banner, Code, Empty, Icon, KeyVals, Loading, ModeBadge, Panel, SeverityBadge, StatusBadge, Stepper, fmtDateTime, fmtTime, incId, isActiveRule, kindName, parseAnalysis, proposalTone, propId, ruleId } from '../ui.jsx'
import { incidentEvents } from './Incidents.jsx'
import { NextStep } from '../components/WorkflowGuide.jsx'

// Before = last allowed request before the rule existed; after = first denied request once it did.
export function verification(report, rules) {
  const proposal = report.proposal
  const rule = proposal && rules.find(r => r.proposal_id === proposal.id)
  const traffic = [...(report.traffic || [])].sort((a, b) => a.id - b.id)
  const ruleAt = rule ? new Date(rule.created_at) : null
  const before = [...traffic].reverse().find(t => t.decision === 'allowed' && (!ruleAt || new Date(t.created_at) <= ruleAt)) || null
  const after = rule ? traffic.find(t => t.decision === 'denied' && new Date(t.created_at) >= ruleAt) || null : null
  return { rule, before, after, verified: report.status === 'verified' && !!after }
}

export function detailStages(report) {
  const s = report.status
  const analyzed = !!report.analysis
  const p = report.proposal
  const decided = p && p.status !== 'pending'
  return [
    { label: 'Detected', state: 'done', note: fmtTime(report.created_at) },
    { label: 'Investigated', state: analyzed ? 'done' : 'current', note: analyzed ? 'Complete' : 'Not run yet' },
    { label: 'Proposed', state: p ? 'done' : 'todo', note: p ? propId(p.id) : 'Pending' },
    { label: s === 'rejected' ? 'Rejected' : decided ? 'Approved' : 'Awaiting approval', state: s === 'rejected' ? 'stop' : decided ? 'done' : p ? 'current' : 'todo', note: decided ? `by ${p.reviewer}` : p ? 'Current stage' : 'Pending' },
    { label: 'Verification', state: s === 'verified' ? 'done' : s === 'blocked' ? 'current' : 'todo', note: s === 'verified' ? 'New request denied' : s === 'blocked' ? 'Awaiting new request' : 'Pending' },
  ]
}

export default function IncidentDetail({ ctx, id }) {
  const { report, error, loading } = useReport(id, ctx.version)
  if (!id) return <Empty>เลือก incident จากหน้า <a href="#/incidents">Incidents</a></Empty>
  if (loading && !report) return <Loading />
  if (!report || report.id !== id) return <Banner tone="bad" icon="x" action={<a className="btn ghost sm" href="#/incidents">กลับไปรายการเหตุการณ์</a>}>{error || 'โหลดรายละเอียดไม่สำเร็จ กรุณาลองใหม่'}</Banner>

  const events = incidentEvents(report.events, report).sort((a, b) => a.id - b.id)
  const analysis = parseAnalysis(report.analysis)
  const p = report.proposal
  const v = verification(report, ctx.data.rules)
  // The event that crossed the threshold is the latest one recorded at or before the incident was opened.
  const thresholdId = [...events].reverse().find(e => new Date(e.timestamp) <= new Date(report.created_at))?.id

  return <div className="grid detail">
    <div className="pageHead span3">
      <nav aria-label="Breadcrumb" className="crumbs"><a href="#/incidents"><Icon name="back" size={14} />Incidents</a><span>/</span><span>{incId(id)}</span></nav>
      <div className="titleRow">
        <h2>{kindName(report.kind)}</h2><SeverityBadge value={report.severity} /><StatusBadge status={report.status} />
        <div className="spacer" />
        <a className="btn ghost" href={`#/trace/${id}`}><Icon name="trace" />View agent trace</a>
        <a className="btn ghost" href={`/api/reports/${id}`} download={`sentinel-${incId(id)}.json`}><Icon name="download" />Export JSON</a>
      </div>
      <p className="muted">{incId(id)} · <span className="mono">{report.source_ip}</span> · opened {fmtDateTime(report.created_at)}</p>
    </div>

    <div className="span3"><NextStep ctx={ctx} incident={report} /></div>
    <Panel className="span3"><Stepper steps={detailStages(report)} /></Panel>

    <div className="facts span3">
      <Fact icon="laptop" label="Source IP" value={report.source_ip} mono />
      <Fact icon="clock" label="Window" value="60 seconds" />
      <Fact icon="rules" label="Evidence" value={`${report.event_count} ${report.kind === 'PORT_SCAN' ? 'ports' : 'failures'}`} />
      <Fact icon="shield" label="Action TTL" value={p ? `${p.duration_seconds / 60} minutes` : '—'} />
    </div>

    <Panel title="Evidence Timeline" icon="rules" className="span2" actions={<span className="muted small">{events.length} events · {report.kind === 'SSH_BRUTE_FORCE' ? 'synthetic log replay' : 'stored events'}</span>}>
      {events.length ? <div className="tableWrap tall"><table>
        <thead><tr><th>Time</th><th>Event type</th><th>Outcome</th><th>Port</th><th>Label</th><th /></tr></thead>
        <tbody>{events.map(e => <tr key={e.id} className={e.id === thresholdId ? 'flag' : ''}>
          <td className="mono">{fmtTime(e.timestamp)}</td><td>{e.event_type}</td>
          <td><span className={`code-pill ${e.outcome === 'failed' ? 'coral' : e.outcome === 'success' ? 'mint' : 'amber'}`}>{e.outcome}</span></td>
          <td className="mono">{e.destination_port ?? '—'}</td><td className="muted">{e.label}</td>
          <td>{e.id === thresholdId && <span className="coral small">Detection threshold reached</span>}</td>
        </tr>)}</tbody></table></div> : <Empty>ไม่พบ event</Empty>}
    </Panel>

    <div className="stack">
      <Panel title="Investigation Summary" icon="brain" actions={<ModeBadge mode={report.analysis_mode} />}>
        <AnalysisView analysis={analysis} mode={report.analysis_mode} />
      </Panel>
      <Panel title="Proposed Response" icon="shield">
        {p ? <>
          <KeyVals items={[['Action', 'Temporary app-level block'], ['Source IP', <span className="mono">{p.source_ip}</span>], ['Duration', `${p.duration_seconds / 60} minutes`], ['Status', <Badge tone={proposalTone[p.status]}>{p.status === 'pending' ? 'Awaiting human decision' : p.status}</Badge>]]} />
          {p.status === 'pending' ? <a className="btn primary block" href={`#/approvals/${p.id}`}>Review approval</a> : <p className="muted small">Decided by {p.reviewer}</p>}
        </> : <Empty>ยังไม่มีข้อเสนอ · ต้องวิเคราะห์ก่อน</Empty>}
      </Panel>
    </div>

    <Panel title="Verification" icon="ok" className="span3">
      <VerificationView v={v} report={report} />
    </Panel>

    <Panel title="Audit Timeline" icon="clock" className="span3">
      {report.timeline?.length ? <ol className="audit">{report.timeline.map(t => <li key={t.id}><time>{fmtTime(t.created_at)}</time><b>{t.stage}</b><span>{t.detail}</span></li>)}</ol> : <Empty>ไม่มี timeline</Empty>}
    </Panel>
  </div>
}

function Fact({ icon, label, value, mono }) {
  return <div className="fact"><Icon name={icon} size={26} /><div><span>{label}</span><b className={mono ? 'mono' : ''}>{value}</b></div></div>
}

export function AnalysisView({ analysis, mode }) {
  if (!analysis) return <p className="muted">ยังไม่ได้วิเคราะห์ · กด “เริ่มวิเคราะห์” ในแถบขั้นตอนถัดไป เพื่อให้ระบบบน M5 อ่านหลักฐานและเสนอการตอบสนอง</p>
  if (analysis.text) return <div className="analysis"><Banner tone="warn" icon="info">ผลนี้มาจาก {mode === 'rule_fallback' ? 'rule fallback ไม่ใช่การวิเคราะห์ของโมเดล' : 'ข้อความที่ไม่ใช่ JSON'}</Banner><p>{analysis.text}</p></div>
  const a = analysis.json
  return <div className="analysis">
    <p className="lead">{a.summary}</p>
    <KeyVals items={[
      ['Classification', <span className="mono">{a.classification}</span>],
      ['Severity', <SeverityBadge value={a.severity} />],
      ['Evidence', <ul>{(a.evidence || []).map((e, i) => <li key={i}>{e}</li>)}</ul>],
      ['Recommendation', a.recommendation],
    ]} />
  </div>
}

export function VerificationView({ v, report }) {
  const status = v.verified
    ? <div className="verifyState good"><Icon name="ok" size={34} /><div><b>Verified</b><span>A new request from {report.source_ip} was denied by {ruleId(v.rule.id)}.</span></div></div>
    : report.status === 'rejected'
      ? <div className="verifyState muted"><Icon name="x" size={34} /><div><b>Not applicable</b><span>Proposal was rejected, so no rule was created.</span></div></div>
      : v.rule
        ? <div className="verifyState warn"><Icon name="clock" size={34} /><div><b>Approved · not verified yet</b><span>{isActiveRule(v.rule) ? 'Send a new request from the tester (Neo) to prove the block.' : 'Rule expired before any new request was denied.'}</span></div></div>
        : <div className="verifyState muted"><Icon name="clock" size={34} /><div><b>Not verified yet</b><span>Approve, then send a new request from Neo.</span></div></div>
  return <div className="verify">
    {status}
    <div className="beforeAfter">
      <RequestCard title="Before" sub={v.rule ? 'before rule' : 'current'} t={v.before} />
      <Icon name="send" size={22} className="arrow" />
      <RequestCard title="After" sub="with rule" t={v.after} waiting={v.rule ? 'Awaiting new request' : 'No rule yet'} />
    </div>
  </div>
}

function RequestCard({ title, sub, t, waiting = 'No request recorded' }) {
  if (!t) return <div className="reqCard muted"><small>{title} <em>({sub})</em></small><b>{waiting}</b></div>
  const denied = t.decision === 'denied'
  return <div className={`reqCard ${denied ? 'bad' : 'good'}`}>
    <small>{title} <em>({sub})</em></small>
    <b>{denied ? 'HTTP 403 · Denied' : 'Allowed'}</b>
    <Code>{`demo app request\nsource ${t.source_ip}\n${fmtTime(t.created_at)} · ${t.decision}`}</Code>
  </div>
}
