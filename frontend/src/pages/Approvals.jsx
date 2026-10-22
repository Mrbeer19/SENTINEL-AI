import React, { useEffect, useRef, useState } from 'react'
import { useReport } from '../api.js'
import { Badge, Banner, Empty, FilterSummary, Icon, Loading, ModeBadge, NoResults, Panel, Stat, actionLabel, fmtDateTime, fmtTime, go, incId, isFallback, kindEvidence, kindName, parseAnalysis, proposalTone, propId, targetIp } from '../ui.jsx'

export default function Approvals({ ctx, id }) {
  const { proposals, incidents } = ctx.data
  const [tab, setTab] = useState(() => proposals.find(p => p.id === id)?.status && proposals.find(p => p.id === id).status !== 'pending' ? 'history' : 'pending')
  const [query, setQuery] = useState('')
  const byStatus = (s) => proposals.filter(p => p.status === s)
  const list = (tab === 'pending' ? byStatus('pending') : proposals.filter(p => p.status !== 'pending'))
    .filter(p => !query || [propId(p.id), incId(p.incident_id), targetIp(p)].some(v => v.toLowerCase().includes(query.toLowerCase())))
  const selected = list.find(p => p.id === id) || list[0]
  const routeStatus = proposals.find(p => p.id === id)?.status
  useEffect(() => {
    if (routeStatus) setTab(routeStatus === 'pending' ? 'pending' : 'history')
  }, [id, routeStatus])
  const incident = (p) => incidents.find(i => i.id === p.incident_id)

  return <div className="grid approvals">
    <div className="span3"><Banner tone="warn" icon="alert"><b>Human approval required</b> · Proposals never execute automatically. Approval adds an app-level rule only.</Banner></div>
    <div className="stats three span3">
      <Stat icon="clock" tone="amber" label="Pending proposals" value={byStatus('pending').length} />
      <Stat icon="ok" label="Approved proposals" value={byStatus('approved').length} />
      <Stat icon="x" tone="coral" label="Rejected proposals" value={byStatus('rejected').length} />
    </div>

    <Panel title="Approval Queue" icon="rules">
      <div className="tabs" role="group" aria-label="สถานะข้อเสนอ">
        <button aria-pressed={tab === 'pending'} className={tab === 'pending' ? 'on' : ''} onClick={() => { setTab('pending'); setQuery('') }}>รออนุมัติ ({byStatus('pending').length})</button>
        <button aria-pressed={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => { setTab('history'); setQuery('') }}>ประวัติ ({proposals.length - byStatus('pending').length})</button>
      </div>
      <label className="search"><Icon name="info" size={16} /><span className="sr">Search proposals</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search proposals…" /></label>
      <FilterSummary count={list.length} total={tab === 'pending' ? byStatus('pending').length : proposals.length - byStatus('pending').length} active={!!query} onClear={() => setQuery('')} />
      {list.length ? <ul className="queue">{list.map(p => {
        const inc = incident(p)
        return <li key={p.id}><button className={`queueItem ${p.status} ${selected?.id === p.id ? 'on' : ''}`} onClick={() => go('approvals', p.id)} aria-current={selected?.id === p.id}>
          <Icon name={p.status === 'pending' ? 'clock' : p.status === 'approved' ? 'ok' : 'x'} size={26} />
          <span><b>{propId(p.id)} <Badge tone={proposalTone[p.status]}>{p.status}</Badge></b><strong>{inc ? kindName(inc.kind) : 'Incident'}</strong><small>{incId(p.incident_id)} · <span className="mono">{targetIp(p)}</span></small><small>{actionLabel[p.action] || 'Temporary app-level block'}{p.source === 'rule_fallback' && ' · rule fallback'}</small></span>
          <time>{fmtTime(p.created_at)}</time>
        </button></li>
      })}</ul> : query ? <NoResults onClear={() => setQuery('')} /> : <Empty>{tab === 'pending' ? <>ไม่มีข้อเสนอรออนุมัติ · <a href="#/incidents">ดูเหตุการณ์ที่ต้องวิเคราะห์</a></> : 'ยังไม่มีประวัติการตัดสินใจ'}</Empty>}
    </Panel>

    <Panel className="span2">
      {selected ? <Review key={selected.id} ctx={ctx} proposal={selected} /> : <Empty>{query ? 'เลือกรายการใหม่หลังเปลี่ยนตัวกรอง' : 'รายละเอียดจะแสดงเมื่อมีข้อเสนอในรายการนี้'}</Empty>}
    </Panel>
  </div>
}

function Review({ ctx, proposal: p }) {
  const { report, loading, error } = useReport(p.incident_id, ctx.version)
  const [reviewer, setReviewer] = useState('SOC operator')
  const [confirm, setConfirm] = useState(null)
  const confirmation = useRef(null)
  const confirmTrigger = useRef(null)
  useEffect(() => { if (confirm) { confirmation.current?.focus({ preventScroll: true }); confirmation.current?.scrollIntoView({ block: 'nearest' }) } }, [confirm])
  const pending = p.status === 'pending'
  const valid = reviewer.trim().length >= 2 && !!report && !error
  const decide = async (action) => {
    const result = await ctx.act(`/api/proposals/${p.id}/${action}`, { body: { reviewer: reviewer.trim() }, ok: action === 'approve' ? 'อนุมัติแล้ว · รอคำขอใหม่เพื่อยืนยัน HTTP 403' : 'ปฏิเสธแล้ว · ไม่มีการสร้างกฎ' })
    if (result) { setConfirm(null); go('approvals', p.id) }
  }
  const analysis = parseAnalysis(report?.analysis)

  return <div className="review">
    <div className="reviewHead"><h2><Icon name="clock" size={24} />Review {propId(p.id)}</h2><Badge tone={proposalTone[p.status]}>{p.status}</Badge></div>
    <div className="facts slim">
      <div><span>Target IP</span><b className="mono">{targetIp(p)}</b></div>
      <div><span>TTL</span><b>{p.duration_seconds / 60} minutes</b></div>
      <div><span>Related incident</span><a href={`#/incident/${p.incident_id}`}>{incId(p.incident_id)}</a></div>
      <div><span>Requested</span><b>{fmtDateTime(p.created_at)}</b></div>
    </div>

    <div className="twoCol">
      <section className="box">
        <h3><Icon name="shield" />Evidence Summary</h3>
        {error && <Banner tone="bad">โหลดหลักฐานไม่สำเร็จ · กดรีเฟรชก่อนตัดสินใจ</Banner>}
        {loading && !report ? <Loading label="กำลังโหลดหลักฐาน…" /> : report ? <>
          <p><b>{kindEvidence(report)} in 60 seconds</b>{report.attack_technique && <span className="muted small"> · ATT&amp;CK {report.attack_technique}</span>}</p>
          <ModeBadge mode={report.analysis_mode} />
          {(isFallback(report) || p.source === 'rule_fallback') && <Banner tone="warn" icon="info">ข้อเสนอนี้มาจาก rule fallback ไม่ใช่ผลวิเคราะห์ของโมเดล · ตรวจหลักฐานเองก่อนตัดสินใจ</Banner>}
          {analysis?.json ? <p className="muted">{analysis.json.explanation_th}</p> : analysis?.text && <p className="muted">{analysis.text}</p>}
          {p.reason && <p className="small"><b>Reason:</b> {p.reason}</p>}
          <h4>Tools used</h4>
          {report.trace.some(t => (t.operation || 'execute_tool') === 'execute_tool') ? <ul className="tools">{[...new Set(report.trace.filter(t => (t.operation || 'execute_tool') === 'execute_tool').map(t => t.tool))].map(name => <li key={name}><Icon name="ok" size={16} /><code>{name}</code></li>)}</ul> : <p className="muted small">ไม่มี tool call</p>}
        </> : <p className="muted">โหลดหลักฐานไม่ได้</p>}
      </section>
      <section className="box">
        <h3><Icon name="trace" />Execution Scope</h3>
        <div className="scope"><Icon name="server" size={28} /><div><b>กฎนี้ครอบคลุมเฉพาะ rod-mai-rod</b><span>เพิ่มกฎชั่วคราวสำหรับ <span className="mono">{targetIp(p)}</span> ในระบบป้องกันเว็บนี้เท่านั้น{p.d3fend && <> · MITRE D3FEND <span className="mono">{p.d3fend}</span> (Inbound Traffic Filtering)</>}</span></div></div>
        <h4>Server-side policy</h4>
        <ul className="policy">
          <li>Target must be the incident source IP; loopback and protected addresses are refused (HTTP 400)</li>
          <li>BLOCK_IP (1 hour) only for CRITICAL incidents; otherwise reduced to a 10-minute temporary block</li>
          {p.policy_notes?.map((n, i) => <li key={i}><b>Policy note:</b> {n}</li>)}
          <li>Rule expires automatically after {p.duration_seconds / 60} minutes</li>
          <li>A decision can only be made once (HTTP 409)</li>
        </ul>
        <p className="note"><Icon name="info" size={14} />Verification stays pending until a new request is denied.</p>
      </section>
    </div>

    {pending ? <>
      <label className="field"><span><Icon name="user" size={16} />ผู้ตรวจทาน</span><input value={reviewer} onChange={e => setReviewer(e.target.value)} maxLength={80} aria-invalid={reviewer.trim().length < 2} />{reviewer.trim().length < 2 && <small className="coral">กรอกชื่ออย่างน้อย 2 ตัวอักษร</small>}</label>
      <div className="decide">
        <button className="btn primary big" disabled={ctx.busy || !!ctx.error || !valid} onClick={e => { confirmTrigger.current = e.currentTarget; setConfirm('approve') }}><Icon name="ok" />อนุมัติบล็อก {p.duration_seconds / 60} นาที</button>
        <button className="btn ghost big" disabled={ctx.busy || !!ctx.error || !valid} onClick={e => { confirmTrigger.current = e.currentTarget; setConfirm('reject') }}><Icon name="x" />ปฏิเสธข้อเสนอ</button>
      </div>
      {confirm && <section ref={confirmation} tabIndex={-1} className="decisionConfirm" role="region" aria-label="ตรวจทานการตัดสินใจ">
        <h3>{confirm === 'approve' ? 'ยืนยันบล็อก IP นี้หรือไม่?' : 'ยืนยันปฏิเสธข้อเสนอนี้หรือไม่?'}</h3>
        <p>{confirm === 'approve' ? <>เว็บ rod-mai-rodจะปฏิเสธคำขอจาก <b className="mono">{targetIp(p)}</b> เป็นเวลา <b>{p.duration_seconds / 60} นาที</b> หลังยืนยัน ให้ส่งคำขอใหม่จากแหล่งเดิมเพื่อตรวจผล</> : <>ข้อเสนอสำหรับ <b className="mono">{targetIp(p)}</b> จะถูกปฏิเสธโดยไม่มีการสร้างกฎ</>}</p>
        <p className="muted small">บันทึกการตัดสินใจโดย {reviewer.trim()} · ข้อเสนอนี้ตัดสินใจได้ครั้งเดียว</p>
        <div className="decisionActions"><button className={`btn ${confirm === 'approve' ? 'primary' : 'danger'}`} disabled={ctx.busy || !!ctx.error || !valid} onClick={() => decide(confirm)}>{ctx.busy ? 'กำลังบันทึก…' : confirm === 'approve' ? 'ยืนยันบล็อก IP' : 'ยืนยันปฏิเสธ'}</button><button className="btn ghost" disabled={ctx.busy} onClick={() => { setConfirm(null); confirmTrigger.current?.focus() }}>กลับไปตรวจทาน</button></div>
      </section>}
      <p className="muted small center">Decision is recorded with reviewer and timestamp.</p>
    </> : <Banner tone={p.status === 'approved' ? 'good' : 'info'} icon={p.status === 'approved' ? 'ok' : 'x'}>
      {p.status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}แล้วโดย <b>{p.reviewer}</b> · {p.status === 'approved' ? <a href={`#/incident/${p.incident_id}`}>ดูขั้นตอนยืนยันผล →</a> : <a href={`#/reports/${p.incident_id}`}>ไม่สร้างกฎ · ดูรายงาน →</a>}
    </Banner>}
  </div>
}
