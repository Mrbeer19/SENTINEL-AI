import React, { useEffect, useRef, useState } from 'react'
import { useReport } from '../api.js'
import { Banner, Icon, Loading, ModeBadge, kindEvidence, kindName, parseAnalysis, targetIp } from '../ui.jsx'

// The operator sees evidence and confirms a decision without leaving the overview.
export default function QuickResponse({ ctx, selection, onClose }) {
  const dialog = useRef(null)
  const [reviewer, setReviewer] = useState('SOC operator')
  const p = selection.proposal
  const incident = selection.incident
  const { report, error, loading } = useReport(incident?.id, ctx.version)
  const rule = selection.rule
  const action = selection.action
  const ip = rule?.source_ip || targetIp(p)
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    return () => { previous?.focus?.() }
  }, [])
  const submit = async () => {
    const result = rule
      ? await ctx.act(`/api/rules/${rule.id}`, { method: 'DELETE', ok: `ปลดกฎของ ${ip} แล้ว · ส่งคำขอใหม่เพื่อตรวจสอบ` })
      : await ctx.act(`/api/proposals/${p.id}/${action}`, { body: { reviewer: reviewer.trim() }, ok: action === 'approve' ? `อนุมัติบล็อก ${ip} แล้ว · รอคำขอใหม่ HTTP 403 เพื่อยืนยันผล` : `ปฏิเสธข้อเสนอของ ${ip} แล้ว · ไม่สร้างกฎ` })
    if (result) onClose()
  }
  const analysis = parseAnalysis(report?.analysis)
  return <dialog ref={dialog} className="responseDialog" aria-labelledby="quick-response-title" onCancel={e => { e.preventDefault(); if (!ctx.busy) onClose() }} onClick={e => { if (e.target === dialog.current && !ctx.busy) onClose() }}>
    <div className="dialogInner"><header><span className="sectionIndex">/ HUMAN DECISION</span><button className="btn ghost sm" disabled={ctx.busy} onClick={onClose} aria-label="ปิดหน้าตรวจทาน"><Icon name="x" /></button></header>
      <h2 id="quick-response-title">{rule ? 'ปลดบล็อก IP' : action === 'approve' ? 'ตรวจทานและบล็อก IP' : 'ปฏิเสธข้อเสนอ'}</h2>
      <div className="dialogTarget"><Icon name="laptop" size={28} /><div><small>เป้าหมายของการดำเนินการ</small><strong>{ip}</strong></div><span className="badge warn">{rule ? 'UNBLOCK' : action === 'approve' ? `${p.duration_seconds / 60} นาที` : 'REJECT'}</span></div>
      {rule ? <p>ปิดกฎนี้เพื่อให้แหล่งต้นทางส่งคำขอเข้าแอปได้อีกครั้ง หากยังมีกฎอื่นของ IP เดียวกัน คำขออาจยังถูกบล็อกอยู่</p> : <>
        {loading && !report ? <Loading /> : error ? <Banner tone="bad">โหลดหลักฐานไม่ได้ กรุณาลองใหม่</Banner> : <div className="quickEvidence"><b>{kindName(report?.kind)}</b><p>{report && kindEvidence(report)}</p><ModeBadge mode={report?.analysis_mode} kind={report?.kind} /><p>{analysis?.json?.explanation_th || analysis?.json?.summary || analysis?.text || p.reason}</p></div>}
        <details className="dialogDetails"><summary>ดูหลักฐานและเหตุผลเพิ่มเติม</summary><p>{p.reason || 'ไม่มีเหตุผลเพิ่มเติมในข้อเสนอ'}</p><ul>{(report?.events || []).slice(-6).map(e => <li key={e.id}><code>{e.event_type} · {e.outcome} {e.destination_port || ''}</code></li>)}</ul><a href={`#/incident/${incident.id}`} onClick={onClose}>เปิดรายละเอียดเหตุการณ์ →</a></details>
        <label className="field"><span>ผู้ตรวจทาน</span><input value={reviewer} maxLength={80} onChange={e => setReviewer(e.target.value)} /></label>
      </>}
      <p className="scopeNote"><Icon name="info" size={16} />{rule ? 'ปลดเฉพาะกฎระดับแอปนี้' : action === 'approve' ? 'บล็อกเฉพาะเว็บ rod-mai-rod ไม่เปลี่ยน firewall ของเครื่อง การอนุมัติยังไม่นับว่ายืนยันผล' : 'ไม่สร้างกฎบล็อก และบันทึกผู้ตัดสินใจ'}</p>
      <footer><button className="btn ghost" disabled={ctx.busy} onClick={onClose}>ยกเลิก</button><button className="btn primary" disabled={ctx.busy || !!ctx.error || (!rule && (!report || !!error || reviewer.trim().length < 2))} onClick={submit}>{ctx.busy ? 'กำลังบันทึก…' : rule ? 'ยืนยันปลดบล็อก' : action === 'approve' ? 'ยืนยันบล็อก IP' : 'ยืนยันปฏิเสธ'}<Icon name="chevron" size={16} /></button></footer>
    </div>
  </dialog>
}
