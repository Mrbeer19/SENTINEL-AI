import React, { useId, useState } from 'react'
import { Icon, fmtTime } from '../ui.jsx'

export default function ActivityChart({ values, allowed = values, denied = values.map(() => 0), now }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [mode, setMode] = useState('bars')
  const [active, setActive] = useState(null)
  const sum = rows => rows.reduce((a, b) => a + b, 0)
  const passed = sum(allowed), blocked = sum(denied), total = sum(values)
  const peak = Math.max(0, ...values), cap = Math.max(4, Math.ceil(peak / 4) * 4)
  const w = 600, h = 220, left = 36, right = 16, top = 24, bottom = 32
  const plotW = w - left - right, plotH = h - top - bottom
  const step = plotW / Math.max(1, values.length)
  const x = i => left + (i + .5) * step
  const y = value => top + plotH * (1 - value / cap)
  const time = i => fmtTime(now - (values.length - 1 - i) * 60000).slice(0, 5)
  const selected = active == null ? null : Math.max(0, Math.min(values.length - 1, active))
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const area = values.length ? `M${x(0)},${y(0)} L${points.replaceAll(' ', ' L')} L${x(values.length - 1)},${y(0)} Z` : ''
  return <figure className="activityChart trafficInfographic" aria-label={`คำขอ ${total} รายการ ใน ${values.length} นาทีล่าสุด`}>
    <div className="trafficOverview"><div className="trafficVolume"><span>คำขอในช่วงที่เลือก</span><strong>{total.toLocaleString()}<small>คำขอ</small></strong><p>{values.length} นาทีล่าสุด · ข้อมูลที่ระบบบันทึก</p></div><div className={`trafficDonut ${total ? 'hasData' : ''}`} style={{'--share':`${total ? passed / total * 100 : 0}%`}} aria-hidden="true"><div><Icon name="pulse" size={28}/></div></div><dl className="trafficKpis"><div><dt><i className="trafficSwatch allowed"/>ผ่าน</dt><dd>{passed.toLocaleString()}</dd></div><div><dt><i className="trafficSwatch denied"/>ปฏิเสธ</dt><dd>{blocked.toLocaleString()}</dd></div><div><dt>สูงสุด / นาที</dt><dd>{peak.toLocaleString()}</dd></div></dl></div>
    <div className="trafficToolbar"><span>คำขอ / นาที</span><div role="group" aria-label="รูปแบบกราฟ"><button type="button" aria-pressed={mode === 'bars'} onClick={() => setMode('bars')}>กราฟแท่ง</button><button type="button" aria-pressed={mode === 'area'} onClick={() => setMode('area')}>แนวโน้ม</button></div></div>
    <div className="trafficPlot" tabIndex={0} role="group" aria-label="กราฟคำขอ กดลูกศรซ้ายขวาเพื่อดูรายนาที" onPointerLeave={() => setActive(null)} onBlur={() => setActive(null)} onKeyDown={e => { if (['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); setActive(current => Math.max(0, Math.min(values.length - 1, (current ?? values.length - 1) + (e.key === 'ArrowLeft' ? -1 : 1)))) } else if (e.key === 'Escape') setActive(null) }}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`ผ่าน ${passed} ปฏิเสธ ${blocked} สูงสุด ${peak} คำขอต่อนาที`}>
        <defs><linearGradient id={`traffic-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-allowed)" stopOpacity=".28"/><stop offset="1" stopColor="var(--chart-allowed)" stopOpacity=".02"/></linearGradient></defs>
        {[0,1,2,3,4].map(i => <g key={i}><line className="trafficGrid" x1={left} x2={w-right} y1={y(cap*i/4)} y2={y(cap*i/4)}/><text className="trafficTick" x={left-9} y={y(cap*i/4)+4} textAnchor="end">{cap*i/4}</text></g>)}
        {mode === 'bars' ? values.map((v,i) => <g key={i}><rect className="trafficBar allowed" x={x(i)-Math.max(2,step*.58)/2} y={y(allowed[i])} width={Math.max(2,step*.58)} height={plotH*allowed[i]/cap} rx="2"/><rect className="trafficBar denied" x={x(i)-Math.max(2,step*.58)/2} y={y(v)} width={Math.max(2,step*.58)} height={plotH*denied[i]/cap} rx="2"/>{!v && <circle cx={x(i)} cy={y(0)} r="1.5" className="trafficZero"/>}</g>) : <><path d={area} fill={`url(#traffic-${id})`}/><polyline points={points} className="trafficLine allowed"/><polyline points={denied.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} className="trafficLine denied"/></>}
        {[...new Set([0,Math.floor((values.length-1)/3),Math.floor((values.length-1)*2/3),values.length-1])].filter(i=>i>=0).map(i=><text key={i} x={x(i)} y={h-9} className="trafficTick" textAnchor="middle">{time(i)}</text>)}
        {selected != null && <><line x1={x(selected)} x2={x(selected)} y1={top} y2={y(0)} className="trafficCrosshair"/><circle cx={x(selected)} cy={y(values[selected])} r="4" className="trafficSelected"/></>}
        {values.map((v,i)=><rect key={`hit-${i}`} x={left+i*step} y={top} width={step} height={plotH} fill="transparent" onPointerEnter={()=>setActive(i)}><title>{time(i)} · ผ่าน {allowed[i]} · ปฏิเสธ {denied[i]}</title></rect>)}
      </svg>
      {selected != null && <div className="trafficTooltip" role="status"><strong>{time(selected)}</strong><span><i className="trafficSwatch allowed"/>ผ่าน <b>{allowed[selected]}</b></span><span><i className="trafficSwatch denied"/>ปฏิเสธ <b>{denied[selected]}</b></span></div>}
      {!total && selected == null && <div className="trafficNoData"><span>ไม่มีคำขอใน {values.length} นาทีล่าสุด</span><small>กราฟจะอัปเดตเมื่อมีคำขอใหม่ที่ระบบบันทึกได้</small></div>}
    </div>
    <figcaption className="trafficCaption"><span><i className="trafficSwatch allowed"/>ผ่าน</span><span><i className="trafficSwatch denied"/>ปฏิเสธ</span><small>เลื่อนเมาส์หรือใช้ลูกศรเพื่อดูรายนาที</small></figcaption>
  </figure>
}
