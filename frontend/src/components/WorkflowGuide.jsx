import React from 'react'
import { Icon, incId, isActiveRule, useNow } from '../ui.jsx'

const STEPS = ['ตรวจพบ', 'วิเคราะห์', 'ตัดสินใจ', 'ยืนยันผล', 'รายงาน']

export function WorkflowGuide() {
  return <details className="workflowGuide">
    <summary><Icon name="info" size={16} />เริ่มใช้งานอย่างไร<span>ขั้นตอนตรวจและตอบสนอง</span></summary>
    <div className="guideBody">
      <p>ตรวจการล็อกอินของ rod-mai-rod จาก VPS แล้ววิเคราะห์เหตุการณ์ที่ระบบตรวจพบก่อนตัดสินใจ</p>
      <ol>{[
        ['รับเหตุการณ์จริง', 'การล็อกอินของ rod-mai-rod จะปรากฏในประวัติและคิวเหตุการณ์', '#/overview'],
        ['AI วิเคราะห์อัตโนมัติ', 'ระบบวิเคราะห์เหตุการณ์ใหม่อัตโนมัติ ตรวจหลักฐานและคำแนะนำ โดยระบบระบุชัดเมื่อใช้ rule fallback', '#/incidents'],
        ['คนตรวจและอนุมัติ', 'ตรวจ Source IP กับระยะเวลาก่อนยืนยัน กฎครอบคลุม rod-mai-rod เท่านั้น', '#/approvals'],
        ['ตรวจผลจากคำขอใหม่', 'ต้องเห็น HTTP 403 ในคำขอใหม่ จึงนับว่ายืนยันการบล็อกแล้ว', '#/rules'],
        ['ดูและส่งรายงาน', 'รวมหลักฐาน ผลวิเคราะห์ ผู้ตัดสินใจ และผลการทดสอบ', '#/reports'],
      ].map(([title, note, href], i) => <li key={title}><span>{i + 1}</span><div><a href={href}>{title}</a><p>{note}</p></div></li>)}</ol>
    </div>
  </details>
}

export function NextStep({ ctx, incident, overview = false }) {
  const now = useNow(5000)
  const p = incident && ctx.data.proposals.find(p => p.incident_id === incident.id)
  const rule = p && ctx.data.rules.find(r => r.proposal_id === p.id)
  const active = rule && isActiveRule(rule, now)
  let step = 0, title, note, href, label, analyze = false, tone = 'info'
  if (!incident) {
    title = 'พร้อมรับเหตุการณ์จาก rod-mai-rod'
    note = 'ระบบจะแสดงการล็อกอินจริงจาก VPS เมื่อมีคำขอใหม่'
    href = '#/overview'; label = 'ดูประวัติการล็อกอิน'
  } else if (p?.status === 'pending') {
    step = 2; tone = 'warn'; title = 'มีข้อเสนอรอคนตรวจทาน'
    note = `ตรวจหลักฐานและ IP เป้าหมาย ${p.target_ip || p.source_ip} ก่อนตัดสินใจ ยังไม่มีการบล็อกจากข้อเสนอนี้${p.source === 'rule_fallback' ? ' · ข้อเสนอนี้มาจาก rule fallback ไม่ใช่โมเดล' : ''}`
    href = `#/approvals/${p.id}`; label = 'ตรวจข้อเสนอ'
  } else if (incident.status === 'rejected') {
    step = 4; title = 'ปฏิเสธข้อเสนอแล้ว'
    note = 'ข้อเสนอนี้ไม่ได้สร้างกฎบล็อก สามารถดูเหตุผลและส่งรายงานให้ทีมได้'
    href = `#/reports/${incident.id}`; label = 'ดูรายงาน'
  } else if (incident.status === 'verified') {
    step = 4; tone = 'good'; title = 'ยืนยันผลการบล็อกแล้ว'
    note = `มีคำขอใหม่ที่ถูกปฏิเสธบันทึกไว้${active ? ' · กฎยังทำงานอยู่' : ' · กฎปัจจุบันหมดอายุหรือถูกปลดแล้ว'}`
    href = `#/reports/${incident.id}`; label = 'ดูรายงาน'
  } else if (incident.status === 'blocked' || p?.status === 'approved') {
    step = 3; tone = 'warn'; title = active ? 'รอคำขอใหม่จากแหล่งเดิมเพื่อยืนยันผล' : 'กฎไม่ทำงานแล้ว · ยังยืนยันผลไม่ได้'
    note = active ? `ต้องมีคำขอใหม่จาก IP ${incident.source_ip} ที่ได้ HTTP 403 จึงจะยืนยันผลได้` : 'การอนุมัติอย่างเดียวไม่ยืนยันว่าบล็อกสำเร็จ ดูบันทึกเดิมหรือรอคำขอใหม่'
    href = active ? (overview ? `#/incident/${incident.id}` : `#/rules/${rule.id}`) : `#/reports/${incident.id}`
    label = active ? (overview ? 'ดูผลการทดสอบ' : 'ดูกฎที่ทำงาน') : 'ดูรายงาน'
  } else if (incident.status === 'analyzing') {
    step = 1; title = 'กำลังวิเคราะห์หลักฐาน'
    note = 'โมเดลกำลังเรียกเครื่องมืออ่านหลักฐาน · ขั้นที่ทำแล้วขึ้นใน Agent Trace ทันที'
    href = `#/trace/${incident.id}`; label = 'ดู Agent Trace'
  } else if (incident.status === 'needs_review') {
    step = 2; tone = 'warn'; title = 'วิเคราะห์แล้ว · ไม่มีข้อเสนอบล็อก ต้องให้คนตรวจต่อ'
    note = 'ผลแนะนำให้สืบเพิ่ม หรือ policy ไม่อนุญาตให้บล็อก (เหตุผลอยู่ใน Audit Timeline) · ไม่มีการสร้างกฎ'
    href = `#/incident/${incident.id}`; label = 'ดูผลวิเคราะห์'
  } else if (incident.status === 'monitoring') {
    step = 4; title = 'วิเคราะห์แล้ว · ให้เฝ้าดูต่อ'
    note = 'ผลแนะนำให้ติดตามโดยยังไม่บล็อก · ไม่มีการสร้างกฎ'
    href = `#/reports/${incident.id}`; label = 'ดูรายงาน'
  } else if (incident.status === 'closed') {
    step = 4; title = 'ปิดเหตุการณ์แล้ว'
    note = rule ? 'กฎถูกปลดก่อนมีคำขอใหม่มายืนยันผล' : 'ไม่มีการสร้างกฎบล็อก'
    href = `#/reports/${incident.id}`; label = 'ดูรายงาน'
  } else if (!incident.analysis) {
    step = 1; title = 'ตรวจพบเหตุการณ์ · เริ่มวิเคราะห์ได้'
    note = `${incident.source_ip} · ระบบจะอ่านหลักฐานและเสนอการตอบสนอง ยังไม่มีการสร้างกฎในขั้นตอนนี้`
    analyze = true; label = 'เริ่มวิเคราะห์'; tone = 'info'
  } else {
    step = 2; title = 'วิเคราะห์แล้ว · ตรวจผลการสืบสวน'
    note = 'ดูผลวิเคราะห์และหลักฐานก่อนเลือกการตอบสนอง'
    href = `#/trace/${incident.id}`; label = 'ดูผลวิเคราะห์'
  }
  return <section className={`nextStep ${tone}`} aria-label="ขั้นตอนถัดไป">
    <div className="nextStepIcon"><Icon name={tone === 'good' ? 'ok' : step === 3 ? 'terminal' : 'trace'} size={22} /></div>
    <div className="nextStepContent"><div className="nextStepMeta">ขั้นตอนถัดไป{incident && <a href={`#/incident/${incident.id}`}>{incId(incident.id)}</a>}</div><h2>{title}</h2><p>{note}</p>
      <ol className="workflowProgress" aria-label="ลำดับการทำงาน">{STEPS.map((name, index) => {
        const skipped = (['rejected', 'needs_review', 'monitoring'].includes(incident?.status) || (incident?.status === 'closed' && !rule)) && index === 3
        return <li key={name} aria-current={index === step ? 'step' : undefined} className={skipped ? 'skipped' : index === step ? 'current' : index < step ? 'done' : ''}>{index + 1}. {name}{skipped && ' (ไม่ต้องทำ)'}</li>
      })}</ol>
    </div>
    {analyze ? <button className="btn primary" disabled={ctx.busy || !!ctx.error} onClick={() => ctx.act(`/api/incidents/${incident.id}/analyze`, { ok: r => r.analysis_mode === 'rule_fallback' ? 'วิเคราะห์เสร็จด้วย rule fallback · ตรวจข้อเสนอก่อนอนุมัติ' : 'วิเคราะห์ด้วยโมเดลเสร็จแล้ว · ตรวจข้อเสนอก่อนอนุมัติ' })}><Icon name="brain" />{ctx.busy ? 'กำลังวิเคราะห์… (~30 วินาที)' : label}</button> : <a className="btn primary" href={href}>{label}<Icon name="chevron" size={15} /></a>}
  </section>
}
