import React, { useState } from 'react'
import { useReport } from '../api.js'
import { Badge, Banner, Empty, Icon, Loading, ModeBadge, Panel, Stat, fmtDateTime, fmtTime, go, incId, kindName, parseAnalysis, proposalTone, propId } from '../ui.jsx'

export default function Approvals({ ctx, id }) {
  const { proposals, incidents } = ctx.data
  const [tab, setTab] = useState('pending')
  const [query, setQuery] = useState('')
  const byStatus = (s) => proposals.filter(p => p.status === s)
  const list = (tab === 'pending' ? byStatus('pending') : proposals.filter(p => p.status !== 'pending'))
    .filter(p => !query || [propId(p.id), incId(p.incident_id), p.source_ip].some(v => v.toLowerCase().includes(query.toLowerCase())))
  const selected = proposals.find(p => p.id === id) || byStatus('pending')[0] || proposals[0]
  const incident = (p) => incidents.find(i => i.id === p.incident_id)

  return <div className="grid approvals">
    <div className="span3"><Banner tone="warn" icon="alert"><b>Human approval required</b> · Proposals never execute automatically. Approval adds an app-level rule only.</Banner></div>
    <div className="stats three span3">
      <Stat icon="clock" tone="amber" label="Pending proposals" value={byStatus('pending').length} />
      <Stat icon="ok" label="Approved proposals" value={byStatus('approved').length} />
      <Stat icon="x" tone="coral" label="Rejected proposals" value={byStatus('rejected').length} />
    </div>

    <Panel title="Approval Queue" icon="rules">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'on' : ''} onClick={() => setTab('pending')}>Pending ({byStatus('pending').length})</button>
        <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>History ({proposals.length - byStatus('pending').length})</button>
      </div>
      <label className="search"><Icon name="info" size={16} /><span className="sr">Search proposals</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search proposals…" /></label>
      {list.length ? <ul className="queue">{list.map(p => {
        const inc = incident(p)
        return <li key={p.id}><button className={`queueItem ${p.status} ${selected?.id === p.id ? 'on' : ''}`} onClick={() => go('approvals', p.id)} aria-current={selected?.id === p.id}>
          <Icon name={p.status === 'pending' ? 'clock' : p.status === 'approved' ? 'ok' : 'x'} size={26} />
          <span><b>{propId(p.id)} <Badge tone={proposalTone[p.status]}>{p.status}</Badge></b><strong>{inc ? kindName(inc.kind) : 'Incident'}</strong><small>{incId(p.incident_id)} · <span className="mono">{p.source_ip}</span></small><small>Temporary app-level block</small></span>
          <time>{fmtTime(p.created_at)}</time>
        </button></li>
      })}</ul> : <Empty>{tab === 'pending' ? 'ไม่มีข้อเสนอรออนุมัติ' : 'ยังไม่มีประวัติการตัดสินใจ'}</Empty>}
    </Panel>

    <Panel className="span2">
      {selected ? <Review ctx={ctx} proposal={selected} /> : <Empty>ยังไม่มีข้อเสนอ · ข้อเสนอจะเกิดหลังวิเคราะห์ incident</Empty>}
    </Panel>
  </div>
}

function Review({ ctx, proposal: p }) {
  const { report, loading } = useReport(p.incident_id, ctx.version)
  const [reviewer, setReviewer] = useState('SOC operator')
  const pending = p.status === 'pending'
  const valid = reviewer.trim().length >= 2
  const decide = (action) => ctx.act(`/api/proposals/${p.id}/${action}`, { body: { reviewer: reviewer.trim() }, ok: action === 'approve' ? 'อนุมัติแล้ว · กฎระดับแอปเริ่มทำงาน ต้องส่ง request ใหม่จาก Neo เพื่อยืนยันผล' : 'ปฏิเสธแล้ว · ไม่มีการสร้างกฎ' })
  const analysis = parseAnalysis(report?.analysis)

  return <div className="review">
    <div className="reviewHead"><h2><Icon name="clock" size={24} />Review {propId(p.id)}</h2><Badge tone={proposalTone[p.status]}>{p.status}</Badge></div>
    <div className="facts slim">
      <div><span>Source IP</span><b className="mono">{p.source_ip}</b></div>
      <div><span>TTL</span><b>{p.duration_seconds / 60} minutes</b></div>
      <div><span>Related incident</span><a href={`#/incident/${p.incident_id}`}>{incId(p.incident_id)}</a></div>
      <div><span>Requested</span><b>{fmtDateTime(p.created_at)}</b></div>
    </div>

    <div className="twoCol">
      <section className="box">
        <h3><Icon name="shield" />Evidence Summary</h3>
        {loading && !report ? <Loading label="กำลังโหลดหลักฐาน…" /> : report ? <>
          <p><b>{report.event_count} {report.kind === 'PORT_SCAN' ? 'distinct ports' : 'failed logins'} in 60 seconds</b></p>
          <ModeBadge mode={report.analysis_mode} />
          {analysis?.json ? <p className="muted">{analysis.json.summary}</p> : analysis?.text && <p className="muted">{analysis.text}</p>}
          <h4>Read-only tools used</h4>
          {report.trace.length ? <ul className="tools">{[...new Set(report.trace.map(t => t.tool))].map(name => <li key={name}><Icon name="ok" size={16} /><code>{name}</code></li>)}</ul> : <p className="muted small">ไม่มี tool call</p>}
        </> : <p className="muted">โหลดหลักฐานไม่ได้</p>}
      </section>
      <section className="box">
        <h3><Icon name="trace" />Execution Scope</h3>
        <div className="scope"><Icon name="server" size={28} /><div><b>Blocks requests to this demo application only.</b><span>Adds a temporary app-level rule for <span className="mono">{p.source_ip}</span>. No macOS firewall changes.</span></div></div>
        <h4>Server-side policy</h4>
        <ul className="policy">
          <li>Loopback and protected addresses are refused by the server (HTTP 400)</li>
          <li>Rule expires automatically after {p.duration_seconds / 60} minutes</li>
          <li>A decision can only be made once (HTTP 409)</li>
        </ul>
        <p className="note"><Icon name="info" size={14} />Verification stays pending until a new request is denied.</p>
      </section>
    </div>

    {pending ? <>
      <label className="field"><span><Icon name="user" size={16} />Reviewer</span><input value={reviewer} onChange={e => setReviewer(e.target.value)} maxLength={80} aria-invalid={!valid} />{!valid && <small className="coral">ต้องมีอย่างน้อย 2 ตัวอักษร</small>}</label>
      <div className="decide">
        <button className="btn primary big" disabled={ctx.busy || !valid} onClick={() => decide('approve')}><Icon name="ok" />Approve {p.duration_seconds / 60}-minute block</button>
        <button className="btn danger big" disabled={ctx.busy || !valid} onClick={() => decide('reject')}><Icon name="x" />Reject proposal</button>
      </div>
      <p className="muted small center">Decision is recorded with reviewer and timestamp.</p>
    </> : <Banner tone={p.status === 'approved' ? 'good' : 'info'} icon={p.status === 'approved' ? 'ok' : 'x'}>
      Already {p.status} by <b>{p.reviewer}</b>. {p.status === 'approved' ? <a href={`#/incident/${p.incident_id}`}>Check verification →</a> : 'No rule was created.'}
    </Banner>}
  </div>
}
