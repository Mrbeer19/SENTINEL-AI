import React from 'react'
import { useReport } from '../api.js'
import { Badge, Banner, Code, Empty, Icon, KeyVals, Loading, ModeBadge, Panel, RuleOnlyNotice, SeverityBadge, StatusBadge, Stepper, actionLabel, fmtDateTime, fmtTime, formatEventPaths, incId, isActiveRule, isFallback, isRuleOnly, kindEvidence, kindName, noProposalNote, parseAnalysis, proposalTone, propId, ruleId, targetIp, durationText } from '../ui.jsx'
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

// Same thresholds as backend/rules/*.yml: the first event at which the rule's 60-second count was met.
const RULES = {
  HTTP_AUTH_BRUTE_FORCE: { match: e => e.outcome === 'failed', count: 5 },
  SSH_BRUTE_FORCE: { match: e => e.outcome === 'failed', count: 5 },
  PORT_SCAN: { distinctPorts: 8 },
  TRAFFIC_ANOMALY: { count: 100 },
  SUSPICIOUS_LOGIN: { success: true, count: 5 },
  HONEYPOT: { eventType: 'HTTP_REQUEST', match: e => e.outcome === 'honeypot', first: true },
  HTTP_FLOOD: { eventType: 'HTTP_REQUEST', totals: { request_count: 300 } },
  WEB_SCAN: { eventType: 'HTTP_REQUEST', totals: { not_found: 10, scan_paths: 3 } },
}

export function thresholdEvent(events, kind) {
  const rule = RULES[kind]
  if (!rule) return null
  const at = (e) => new Date(e.timestamp).getTime()
  const ordered = rule.eventType ? events.filter(e => e.event_type === rule.eventType).slice().sort((a, b) => at(a) - at(b)) : events
  if (rule.first) return ordered.find(rule.match) || null
  return ordered.find((e, i) => {
    const window = ordered.slice(0, i + 1).filter(x => at(e) - at(x) >= 0 && at(e) - at(x) <= 60000)
    if (rule.totals) return Object.entries(rule.totals).some(([field, count]) => window.reduce((sum, event) => {
      const value = ['number', 'string'].includes(typeof event[field]) ? Number(event[field]) : 0
      return sum + (Number.isFinite(value) && value > 0 ? value : 0)
    }, 0) >= count)
    if (rule.distinctPorts) return new Set(window.map(x => x.destination_port)).size >= rule.distinctPorts
    if (rule.success) return e.outcome === 'success' && window.filter(x => x.outcome === 'failed' && x.event_type === e.event_type).length >= rule.count
    return (!rule.match || rule.match(e)) && window.filter(rule.match || (() => true)).length >= rule.count
  }) || null
}

export function detailStages(report) {
  const s = report.status
  const analyzed = !!report.analysis
  const p = report.proposal
  const decided = p && p.status !== 'pending'
  if (s === 'closed' && !analyzed) return [
    { label: 'Detected', state: 'done', note: fmtTime(report.created_at) },
    { label: 'Closed', state: 'stop', note: 'Closed before analysis' },
    { label: 'Proposed', state: 'todo', note: 'Not applicable' },
    { label: 'Decision', state: 'todo', note: 'Not applicable' },
    { label: 'Verification', state: 'todo', note: 'Not applicable' },
  ]
  if (!p && analyzed && noProposalNote[s]) return [
    { label: 'Detected', state: 'done', note: fmtTime(report.created_at) },
    { label: 'Investigated', state: 'done', note: 'Complete' },
    { label: 'No block proposed', state: s === 'needs_review' ? 'current' : 'done', note: noProposalNote[s] },
    { label: 'Decision', state: 'todo', note: 'Not required' },
    { label: 'Verification', state: 'todo', note: 'Not applicable' },
  ]
  return [
    { label: 'Detected', state: 'done', note: fmtTime(report.created_at) },
    { label: 'Investigated', state: analyzed ? 'done' : 'current', note: analyzed ? 'Complete' : s === 'analyzing' ? 'Running…' : 'Not run yet' },
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
  const thresholdId = thresholdEvent(events, report.kind)?.id

  return <div className="grid detail">
    <div className="pageHead span3">
      <nav aria-label="Breadcrumb" className="crumbs"><a href="#/incidents"><Icon name="back" size={14} />Incidents</a><span>/</span><span>{incId(id)}</span></nav>
      <div className="titleRow">
        <h2>{kindName(report.kind)}</h2><SeverityBadge value={report.severity} /><StatusBadge status={report.status} />
        <div className="spacer" />
        <a className="btn ghost" href={`#/trace/${id}`}><Icon name="trace" />ดูเส้นทาง Agent</a>
        <a className="btn ghost" href={`/api/reports/${id}`} download={`sentinel-${incId(id)}.json`}><Icon name="download" />ดาวน์โหลด JSON</a>
      </div>
      <p className="muted">{incId(id)} · <span className="mono">{report.source_ip}</span> · opened {fmtDateTime(report.created_at)}{report.rule_id && <> · rule <span className="mono">{report.rule_id}</span></>}{report.attack_technique && <> · ATT&amp;CK <span className="mono">{report.attack_technique}</span></>}</p>
    </div>

    <div className="span3 detailNextStep"><NextStep ctx={ctx} incident={report} /></div>
    {isRuleOnly(report.kind) && <div className="span3"><RuleOnlyNotice kind={report.kind} /></div>}
    <Panel className="span3"><Stepper steps={detailStages(report)} /></Panel>

    <div className="facts span3">
      <Fact icon="clock" label="ช่วงตรวจจับ" value="60 วินาที" />
      <Fact icon="rules" label="หลักฐาน" value={kindEvidence(report)} />
      <Fact icon="shield" label="ระยะเวลาบล็อก" value={p ? durationText(p.duration_seconds) : '—'} />
    </div>

    <Panel title="หลักฐานที่ตรวจพบ" icon="rules" className="span2" actions={<span className="muted small">{events.length} events · {report.kind === 'SSH_BRUTE_FORCE' ? 'synthetic log replay' : 'stored events'}</span>}>
      <EventEvidenceTable events={events} thresholdId={thresholdId} />
    </Panel>

    <div className="stack detailAnalysis">
      <Panel title={isRuleOnly(report.kind) ? 'ผลตรวจด้วยกฎเฉพาะทาง' : 'คำแนะนำจาก AI'} icon="brain" actions={<ModeBadge mode={report.analysis_mode} kind={report.kind} />}>
        {report.status === 'closed' && !analysis ? <p className="muted">เหตุการณ์ปิดก่อนวิเคราะห์ · วิเคราะห์ incident ที่ปิดแล้วไม่ได้</p> : <AnalysisView analysis={analysis} fallback={isFallback(report)} kind={report.kind} meta={report.analysis_meta} />}
      </Panel>
      <Panel title="Proposed Response" icon="shield">
        {p ? <>
          {!isRuleOnly(report.kind) && p.source === 'rule_fallback' && <Banner tone="warn" icon="info">ข้อเสนอนี้มาจาก rule fallback ไม่ใช่ผลวิเคราะห์ของโมเดล</Banner>}
          <KeyVals items={[['Action', actionLabel[p.action] || p.action], ['Target IP', <span className="mono">{targetIp(p)}</span>], ['Duration', durationText(p.duration_seconds)], ['Status', <Badge tone={proposalTone[p.status]}>{p.status === 'pending' ? 'Awaiting human decision' : p.status}</Badge>]]} />
          {p.policy_notes?.length > 0 && <ul className="muted small">{p.policy_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          {p.status === 'pending' ? <a className="btn primary block" href={`#/approvals/${p.id}`}>Review approval</a> : <p className="muted small">Decided by {p.reviewer}</p>}
        </> : <Empty>{!report.analysis ? 'ยังไม่มีข้อเสนอ · ต้องวิเคราะห์ก่อน' : report.status === 'needs_review' ? 'ไม่มีข้อเสนอบล็อก · ผลวิเคราะห์ขอให้คนตรวจต่อ หรือ policy ไม่อนุญาต (ดูเหตุผลใน Audit Timeline)' : report.status === 'monitoring' ? 'ไม่มีข้อเสนอบล็อก · ให้เฝ้าดูต่อ' : 'ไม่มีข้อเสนอบล็อก'}</Empty>}
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

export function EventEvidenceTable({ events, thresholdId }) {
  if (!events.length) return <Empty>ไม่พบ event</Empty>
  const web = events.some(e => e.event_type === 'HTTP_REQUEST')
  const other = events.some(e => e.event_type !== 'HTTP_REQUEST')
  return <div className="tableWrap tall"><table>
    <thead><tr><th>Time</th><th>Event type</th><th>Outcome</th>{other && <><th>Port</th><th>Username</th></>}{web && <><th>Requests</th><th>404</th><th>Paths</th></>}<th /></tr></thead>
    <tbody>{events.map(e => <tr key={e.id} className={e.id === thresholdId ? 'flag' : ''}>
      <td className="mono">{fmtTime(e.timestamp)}</td><td>{e.event_type}</td>
      <td><span className={`code-pill ${e.outcome === 'failed' || e.outcome === 'honeypot' ? 'coral' : e.outcome === 'success' ? 'mint' : 'amber'}`}>{e.outcome}</span></td>
      {other && <><td className="mono">{e.destination_port ?? '—'}</td><td className="mono userCell">{e.username ?? '—'}</td></>}
      {web && <><td className="mono">{e.event_type === 'HTTP_REQUEST' ? e.request_count ?? '—' : '—'}</td><td className="mono">{e.event_type === 'HTTP_REQUEST' ? e.not_found ?? '—' : '—'}</td><td className="mono userCell" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{e.event_type === 'HTTP_REQUEST' ? formatEventPaths(e.paths) : '—'}</td></>}
      <td>{thresholdId != null && e.id === thresholdId && <span className="coral small">Detection threshold reached</span>}</td>
    </tr>)}</tbody>
  </table></div>
}

export function AnalysisView({ analysis, fallback, meta, kind }) {
  const ruleOnly = isRuleOnly(kind)
  if (!analysis) return <p className="muted">{ruleOnly ? 'ยังไม่มีผลตรวจจากกฎเฉพาะทาง' : 'ยังไม่ได้วิเคราะห์ · กด “เริ่มวิเคราะห์” ในแถบขั้นตอนถัดไป เพื่อให้ระบบอ่านหลักฐานและเสนอการตอบสนอง'}</p>
  if (analysis.text) return <div className="analysis"><Banner tone="warn" icon="info">ผลนี้ไม่ใช่ JSON ตาม contract</Banner><p>{analysis.text}</p></div>
  const a = analysis.json
  return <div className="analysis">
    {fallback && !ruleOnly && <Banner tone="warn" icon="info">ผลนี้มาจาก rule fallback ไม่ใช่การวิเคราะห์ของโมเดล</Banner>}
    <p className="lead">{a.explanation_th}</p>
    <KeyVals items={[
      ['Threat type', <span className="mono">{a.threat_type}</span>],
      ['Severity', <SeverityBadge value={a.severity} />],
      ['Confidence', a.confidence === null ? <span className="muted">{ruleOnly ? '— (ตรวจด้วยกฎเฉพาะทาง)' : '— (rule fallback)'}</span> : `${Math.round(a.confidence * 100)}%`],
      ['Evidence', <ul>{a.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>],
      ['Recommended action', actionLabel[a.recommended_action] || a.recommended_action],
      ...(meta?.model && !fallback && !ruleOnly ? [['Model', <span className="mono small">{meta.model}{meta.prompt_version ? ` · ${meta.prompt_version}` : ''}</span>]] : []),
    ]} />
  </div>
}

export function VerificationView({ v, report }) {
  const status = v.verified
    ? <div className="verifyState good"><Icon name="ok" size={34} /><div><b>Verified</b><span>A new request from {report.source_ip} was denied by {ruleId(v.rule.id)}.</span></div></div>
    : report.status === 'rejected' || (!report.proposal && noProposalNote[report.status])
      ? <div className="verifyState muted"><Icon name="x" size={34} /><div><b>Not applicable</b><span>{report.status === 'rejected' ? 'Proposal was rejected, so no rule was created.' : 'No block was proposed, so there is nothing to verify.'}</span></div></div>
      : v.rule
        ? <div className="verifyState warn"><Icon name="clock" size={34} /><div><b>Approved · not verified yet</b><span>{isActiveRule(v.rule) ? 'A new request from this source must be denied to verify the block.' : 'Rule expired or was removed before any new request was denied.'}</span></div></div>
        : <div className="verifyState muted"><Icon name="clock" size={34} /><div><b>Not verified yet</b><span>Approve the proposal, then inspect the next request from this source.</span></div></div>
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
    <Code>{`app request\nsource ${t.source_ip}\n${fmtTime(t.created_at)} · ${t.decision}`}</Code>
  </div>
}
