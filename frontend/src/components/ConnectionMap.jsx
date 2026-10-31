import React, { useId } from 'react'
import { sourceActivity } from '../sourceActivity.js'
import { fmtTime, isOpenIncident } from '../ui.jsx'

// A relationship layout, never a geographic location or a claim about unobserved traffic.
export default function ConnectionMap({ data, activeRules, selectedIp, onSelectIp, connected }) {
  const uid = useId().replace(/:/g, ''), sources = sourceActivity(data), shown = sources.slice(0, 10)
  const host = import.meta.env.VITE_PROTECTED_SITE_HOST || 'Protected application'
  const hostIp = import.meta.env.VITE_PROTECTED_SITE_IP
  return <div className="connectionMap">
    <svg viewBox="0 0 740 360" role="group" aria-label="แผนผัง IP ต้นทางเชื่อมกับแอปที่ป้องกัน">
      <defs><radialGradient id={`${uid}halo`}><stop stopColor="var(--mint)" stopOpacity=".13"/><stop offset="1" stopColor="var(--mint)" stopOpacity="0"/></radialGradient><radialGradient id={`${uid}sphere`} cx="32%" cy="25%"><stop stopColor="#d6fff4"/><stop offset=".35" stopColor="var(--mint)"/><stop offset="1" stopColor="#09545c"/></radialGradient><pattern id={`${uid}grid`} width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="var(--line)" strokeWidth=".5"/></pattern></defs>
      <rect width="740" height="360" fill={`url(#${uid}grid)`}/><circle cx="370" cy="180" r="165" fill={`url(#${uid}halo)`}/>
      {[68,102,138].map(r=><circle key={r} cx="370" cy="180" r={r} className="connectionOrbit"/>)}
      {shown.map((s,i)=>{
        const side=i%2,slot=Math.floor(i/2),count=Math.ceil((shown.length-side)/2),x=side?616:124,y=count===1?180:44+slot*272/(count-1)
        const block=activeRules.some(r=>r.source_ip===s.ip),incident=data.incidents.find(r=>r.source_ip===s.ip),alert=incident&&isOpenIncident(incident),tone=block?'blocked':alert?'attention':'normal',path=`M${x} ${y}C${side?480:260} ${y},${side?480:260} 180,370 180`,selected=s.ip===selectedIp
        return <g key={s.ip} className={`connectionSource ${tone} ${selected?'selected':''}`}><path id={`${uid}route${i}`} d={path} className="connectionRoute"/>{connected&&<circle r="2.5" className="connectionPacket"><animateMotion dur={`${5+i*.3}s`} begin={`${-i*.7}s`} repeatCount="indefinite"><mpath href={`#${uid}route${i}`}/></animateMotion></circle>}<g role="button" tabIndex="0" aria-label={`เลือก IP ${s.ip}`} aria-pressed={selected} onClick={()=>onSelectIp(s.ip)} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onSelectIp(s.ip)}}} className="connectionEndpoint"><circle cx={x} cy={y} r={selected?15:11} className="connectionFocus"/><circle cx={x} cy={y} r="5" fill={`url(#${uid}sphere)`}/><text x={x} y={y-19} textAnchor="middle">{s.ip}</text><text x={x} y={y+27} textAnchor="middle" className="connectionNodeState">{block?'BLOCKED':alert?'REVIEW':'OBSERVED'}</text></g></g>
      })}
      <g className="connectionHub"><circle cx="370" cy="180" r="36"/><circle cx="370" cy="180" r="27" fill={`url(#${uid}sphere)`}/><path d="M359 170h22v8h-22zM359 183h22v8h-22zM363 174h1m-1 13h1" fill="none" stroke="#062b31" strokeWidth="1.5"/><text x="370" y="239" textAnchor="middle">{host.length>32?host.slice(0,30)+'…':host}</text><text x="370" y="255" textAnchor="middle" className="connectionNodeState">{hostIp || 'APPLICATION NODE'}</text></g>
      {!shown.length&&<text x="370" y="303" textAnchor="middle" className="connectionAwaiting">รอ IP จากเหตุการณ์หรือคำขอที่บันทึก</text>}
    </svg>
    <div className="connectionMapFooter"><span>{selectedIp ? <><i className="dot mint"/><b className="mono">{selectedIp}</b><small>{fmtTime(sources.find(s=>s.ip===selectedIp)?.at)}</small></> : 'เลือกจุดเพื่อสำรวจ IP'}</span><small>แผนผังความสัมพันธ์ · ไม่ใช่พิกัดภูมิศาสตร์{sources.length>10?` · อีก ${sources.length-10} IP ในตาราง`:''}</small></div>
  </div>
}
