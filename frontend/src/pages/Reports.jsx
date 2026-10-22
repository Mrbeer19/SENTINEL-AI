import React, { useEffect, useState } from 'react'
import { getJson, useReport } from '../api.js'
import { Banner, Empty, FilterSummary, Icon, Loading, ModeBadge, NoResults, Panel, Stat, StatusBadge, actionLabel, fmtDateTime, fmtTime, go, incId, isFallback, kindName, noProposalNote, parseAnalysis, ruleId } from '../ui.jsx'
import { VerificationView, verification } from './IncidentDetail.jsx'
import { incidentEvents } from './Incidents.jsx'

export default function Reports({ ctx, id }) {
  const { incidents } = ctx.data
  const [query, setQuery] = useState('')
  const list = incidents.filter(i => !query || [incId(i.id), i.source_ip, kindName(i.kind)].some(v => v.toLowerCase().includes(query.toLowerCase())))
  const current = (list.find(i => i.id === id) || list[0])?.id

  return <div className="grid reports">
    <div className="stats four span3">
      <Stat icon="alert" tone="coral" label="Incidents" value={incidents.length} />
      <Stat icon="rules" label="Reviewed" value={incidents.filter(i => i.analysis).length} note="analysis recorded" />
      <Stat icon="shield" label="Verified blocks" value={incidents.filter(i => i.status === 'verified').length} />
      <Stat icon="clock" tone="amber" label="Pending verification" value={incidents.filter(i => i.status === 'blocked').length} note="approved, no denied request yet" />
    </div>

    <Panel title={`Incident Reports (${incidents.length})`} icon="rules" className="noprint">
      <label className="search"><Icon name="info" size={16} /><span className="sr">Search reports</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search incidents, source IP, or type…" /></label>
      <FilterSummary count={list.length} total={incidents.length} active={!!query} onClear={() => setQuery('')} />
      {list.length ? <ul className="queue">{list.map(i => <li key={i.id}><button className={`queueItem ${current === i.id ? 'on' : ''}`} onClick={() => go('reports', i.id)} aria-current={current === i.id}>
        <Icon name="alert" size={26} />
        <span><b>{incId(i.id)} <StatusBadge status={i.status} /></b><strong>{kindName(i.kind)}</strong><small className="mono">{i.source_ip} · {fmtTime(i.created_at)}</small></span>
      </button></li>)}</ul> : query ? <NoResults onClear={() => setQuery('')} /> : <Empty>ยังไม่มีรายงาน · <a href="#/incidents">ดูเหตุการณ์</a></Empty>}
    </Panel>

    <div className="span2">{current ? <ReportView ctx={ctx} id={current} /> : <Panel><Empty>{query ? 'ไม่มีรายงานที่ตรงกับตัวกรอง' : 'รายงานจะแสดงเมื่อมีเหตุการณ์ในระบบ'}</Empty></Panel>}</div>
  </div>
}

function ReportView({ ctx, id }) {
  const { report, error, loading } = useReport(id, ctx.version)
  if (loading && !report) return <Loading />
  if (!report || report.id !== id) return <Banner tone="bad" icon="x">{error || 'กำลังโหลด…'}</Banner>
  const v = verification(report, ctx.data.rules)
  const analysis = parseAnalysis(report.analysis)
  const p = report.proposal
  const stage = (name) => report.timeline.find(t => t.stage === name)
  const decision = stage('approved') || stage('rejected')
  const events = incidentEvents(report.events, report)
  const rows = [...events.map(e => ({ at: e.timestamp, kind: 'event', text: `${e.event_type} · ${e.outcome}${e.destination_port ? ` · port ${e.destination_port}` : ''}`, result: e.outcome })),
    ...report.traffic.map(t => ({ at: t.created_at, kind: 'request', text: 'app request', result: t.decision }))]
    .sort((a, b) => new Date(b.at) - new Date(a.at))

  return <div className="stack">
    <Panel className="reportMain">
      <div className="titleRow">
        <h2>{incId(report.id)} · {kindName(report.kind)}</h2><StatusBadge status={report.status} />
        <div className="spacer noprint" />
        <a className="btn primary noprint" href={`/api/reports/${report.id}`} download={`sentinel-${incId(report.id)}.json`}><Icon name="download" />Export JSON</a>
        <button className="btn ghost noprint" onClick={() => window.print()}>Print report</button>
      </div>
      <p className="muted">Source <span className="mono">{report.source_ip}</span> · opened {fmtDateTime(report.created_at)}{report.rule_id && <> · rule <span className="mono">{report.rule_id}</span></>}{report.attack_technique && <> · ATT&amp;CK <span className="mono">{report.attack_technique}</span></>}</p>
      <ol className="reportSteps">
        <li><span>1</span><b>Detection</b><time>{fmtTime(report.created_at)}</time><p>{stage('detected')?.detail || `${report.event_count} events from ${report.source_ip}`}</p></li>
        <li className={report.analysis ? '' : 'todo'}><span>2</span><b>Investigation</b><time>{fmtTime(stage('analysis')?.created_at)}</time>
          <p>{report.analysis ? <>{analysis?.json?.explanation_th || analysis?.text} {analysis?.json?.recommended_action && <>Recommended: <b>{actionLabel[analysis.json.recommended_action] || analysis.json.recommended_action}</b>. </>}Tools: {report.trace.some(t => (t.operation || 'execute_tool') === 'execute_tool') ? [...new Set(report.trace.filter(t => (t.operation || 'execute_tool') === 'execute_tool').map(t => t.tool))].map(t => <code key={t}>{t}</code>) : <span className="muted">none (model not used)</span>}</> : 'Not investigated yet.'}</p>
          {report.analysis_mode && <ModeBadge mode={report.analysis_mode} />}</li>
        <li className={decision ? '' : 'todo'}><span>3</span><b>Human decision</b><time>{fmtTime(decision?.created_at)}</time><p>{decision ? decision.detail : p ? 'Awaiting decision.' : report.analysis && noProposalNote[report.status] ? `No block proposed · ${noProposalNote[report.status]}.` : 'No proposal yet.'}</p></li>
        <li className={v.verified ? '' : 'todo'}><span>4</span><b>Verification</b><time>{fmtTime(v.after?.created_at)}</time><p>{v.verified ? `New request from ${report.source_ip} returned 403 (${ruleId(v.rule.id)}). Block verified.` : 'Not verified yet.'}</p></li>
      </ol>
      <h3 className="sub">Request before / after</h3>
      <VerificationView v={v} report={report} />
    </Panel>

    <div className="twoCol">
      <Panel title={`Evidence (${rows.length})`} icon="rules">
        {rows.length ? <div className="tableWrap short"><table>
          <thead><tr><th>Time</th><th>Type</th><th>Detail</th><th>Result</th></tr></thead>
          <tbody>{rows.slice(0, 40).map((r, i) => <tr key={i}><td className="mono">{fmtTime(r.at)}</td><td>{r.kind}</td><td>{r.text}</td>
            <td><span className={`code-pill ${['denied', 'failed'].includes(r.result) ? 'coral' : r.result === 'attempt' ? 'amber' : 'mint'}`}>{r.result === 'denied' ? '403' : r.result}</span></td></tr>)}</tbody>
        </table></div> : <Empty>ไม่มีหลักฐาน</Empty>}
      </Panel>
      <Panel title="Limitations" icon="info">
        <ul className="plain">
          <li>Controlled local lab, not a production environment</li>
          <li>App-level enforcement only; host firewall unchanged</li>
          {report.kind === 'SSH_BRUTE_FORCE' && <li>SSH events are synthetic log replay</li>}
          {isFallback(report) && <li>Analysis is rule fallback, not a model result</li>}
          {report.analysis_meta?.model && !isFallback(report) && <li>Model {report.analysis_meta.model} · prompt {report.analysis_meta.prompt_version || '—'}</li>}
          <li>Approved rules require a new denied request to count as verified</li>
        </ul>
      </Panel>
    </div>
    <AuditChain version={ctx.version} />
  </div>
}

// Hash-chained audit log (contract v0.2): GET /api/audit/verify → { valid, entries, broken_at }.
function AuditChain({ version }) {
  const [state, setState] = useState(null)
  useEffect(() => {
    let cancelled = false
    getJson('/api/audit/verify').then(r => { if (!cancelled) setState(r) }).catch(err => { if (!cancelled) setState({ error: err.message }) })
    return () => { cancelled = true }
  }, [version])
  return <Panel title="Audit Chain" icon="shield" className="noprint">
    {!state ? <Loading label="กำลังตรวจ audit chain…" /> : state.error ? <Banner tone="warn" icon="info">ตรวจ audit chain ไม่ได้ · {state.error}</Banner>
      : state.valid ? <p><b className="mint">Intact</b> · {state.entries} entries, each hash links to the previous one</p>
        : <Banner tone="bad" icon="x">Audit chain broken at entry {state.broken_at} · a stored record was changed or removed</Banner>}
  </Panel>
}
