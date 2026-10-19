import React from 'react'
import { Icon, incId, isActiveRule, useNow } from '../ui.jsx'

const STEPS = ['ตรวจพบ', 'วิเคราะห์', 'ตัดสินใจ', 'ยืนยันผล', 'รายงาน']

export function WorkflowGuide() {
  return <details className="workflowGuide">
    <summary><Icon name="info" size={16} />เริ่มใช้งานอย่างไร<span>ดูขั้นตอน M5 / Neo</span></summary>
    <div className="guideBody">
      <p><b>M5 เปิดแดชบอร์ดนี้</b> เพื่อตรวจเหตุการณ์และตัดสินใจ · <b>Neo ส่งคำขอผ่าน Terminal</b> ตามคู่มือที่แยกไว้</p>
      <ol>{[
        ['ส่งคำขอทดสอบ', 'Neo ส่งคำขอไปยัง M5 หรือใช้ Demo Lab เพื่อเล่นเหตุการณ์จำลอง', '#/lab'],
        ['เปิดเหตุการณ์และวิเคราะห์', 'ตรวจหลักฐาน แล้วกดเริ่มวิเคราะห์ ระบบระบุชัดเมื่อใช้ rule fallback', '#/incidents'],
        ['คนตรวจและอนุมัติ', 'ตรวจ Source IP กับระยะเวลาก่อนยืนยัน กฎครอบคลุมแอปสาธิตเท่านั้น', '#/approvals'],
        ['ส่งคำขอใหม่จาก Neo', 'ต้องเห็น HTTP 403 ในคำขอใหม่ จึงนับว่ายืนยันการบล็อกแล้ว', '#/rules'],
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
    title = 'พร้อมรับเหตุการณ์ทดสอบ'
    note = 'ให้ Neo ส่งคำขอเข้ามาที่ M5 หรือเริ่มด้วยเหตุการณ์จำลองใน Demo Lab'
    href = '#/lab'; label = 'เปิด Demo Lab'
  } else if (p?.status === 'pending') {
    step = 2; tone = 'warn'; title = 'มีข้อเสนอรอคนตรวจทาน'
    note = `ตรวจหลักฐานและ Source IP ${p.source_ip} ก่อนตัดสินใจ ยังไม่มีการบล็อกจากข้อเสนอนี้`
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
    note = active ? `ต้องมีคำขอใหม่จาก IP ${incident.source_ip} ที่ได้ HTTP 403 · ทดสอบจริงส่งจาก Neo ส่วน IP จำลองให้ส่งจาก Demo Lab` : 'การอนุมัติอย่างเดียวไม่ยืนยันว่าบล็อกสำเร็จ ดูบันทึกเดิมหรือเริ่มการทดสอบรอบใหม่'
    href = active ? (overview ? `#/incident/${incident.id}` : `#/rules/${rule.id}`) : `#/reports/${incident.id}`
    label = active ? (overview ? 'ดูผลการทดสอบ' : 'ดูกฎที่ทำงาน') : 'ดูรายงาน'
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
        const skipped = incident?.status === 'rejected' && index === 3
        return <li key={name} aria-current={index === step ? 'step' : undefined} className={skipped ? 'skipped' : index === step ? 'current' : index < step ? 'done' : ''}>{index + 1}. {name}{skipped && ' (ไม่ต้องทำ)'}</li>
      })}</ol>
    </div>
    {analyze ? <button className="btn primary" disabled={ctx.busy || !!ctx.error} onClick={() => ctx.act(`/api/incidents/${incident.id}/analyze`, { ok: r => r.analysis_mode === 'rule_fallback' ? 'วิเคราะห์เสร็จด้วย rule fallback · ตรวจข้อเสนอก่อนอนุมัติ' : 'วิเคราะห์ด้วยโมเดลเสร็จแล้ว · ตรวจข้อเสนอก่อนอนุมัติ' })}><Icon name="brain" />{ctx.busy ? 'กำลังวิเคราะห์…' : label}</button> : <a className="btn primary" href={href}>{label}<Icon name="chevron" size={15} /></a>}
  </section>
}
