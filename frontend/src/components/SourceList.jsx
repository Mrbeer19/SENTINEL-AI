import React, { useState, useEffect } from 'react'
import { Empty, Icon, SeverityBadge, fmtTime, isOpenIncident, isReplayIp, kindName, remaining, targetIp } from '../ui.jsx'
import { sourceActivity } from '../sourceActivity.js'

export function sourceLocation(ip, data, lookedUpGeo) {
  const geo = lookedUpGeo || data.geo_locations?.find(g => g.source_ip === ip || g.ip === ip || g.label === ip)
  if (geo?.country || geo?.city) return { label: [geo.city, geo.region !== geo.city && geo.region, geo.country].filter(Boolean).join(', '), note: ['ipapi.co', 'ipwho.is'].includes(geo.provider) ? `GeoIP โดยประมาณ${geo.connection?.isp ? ` · เครือข่าย ${geo.connection.isp}` : ''}` : 'พิกัดจากข้อมูลระบบ', geo }
  if (isReplayIp(ip)) return { label: 'IP สำหรับเอกสาร', note: 'TEST-NET · ไม่มีตำแหน่งจริง' }
  if (/^(10\.|192\.168\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip === '::1' || /^(fc|fd|fe80:)/i.test(ip)) return { label: 'เครือข่ายภายใน', note: 'LAN / Local · ไม่มีพิกัดประเทศ' }
  return { label: 'แหล่งต้นทางจริง', note: 'Public IP · ยังไม่มีข้อมูล GeoIP จึงระบุตำแหน่งไม่ได้' }
}

export default function SourceList({ ctx, activeRules, onRespond, onSelect, selectedIp, geoByIp = {}, now, queryOverride }) {
  const [query, setQuery] = useState(queryOverride || '')
  useEffect(() => { if (queryOverride !== undefined) setQuery(queryOverride) }, [queryOverride])
  const [filter, setFilter] = useState('all')
  const { data } = ctx
  const activity = sourceActivity(data)
  const rows = activity.map(({ ip, at }) => {
    const incident = data.incidents.find(i => i.source_ip === ip)
    const rules = activeRules.filter(r => r.source_ip === ip)
    const proposal = data.proposals.find(p => p.status === 'pending' && targetIp(p) === ip)
    const traffic = data.traffic.filter(t => t.source_ip === ip)
    const events = data.events.filter(e => e.source_ip === ip)
    const lastAuth = events.filter(e => e.event_type === 'HTTP_AUTH').sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0) || (b.id || 0) - (a.id || 0))[0]
    return { ip, incident, rules, proposal, at, count: traffic.length + events.length, lastAuth, location: sourceLocation(ip, data, geoByIp[ip]) }
  }).filter(r => (!query.trim() || `${r.ip} ${r.incident ? kindName(r.incident.kind) : ''} ${r.location.label}`.toLowerCase().includes(query.trim().toLowerCase())) && (filter === 'all' || filter === 'blocked' && r.rules.length || filter === 'attention' && (r.proposal || r.incident && isOpenIncident(r.incident))))
  return <>
    <div className="sourceToolbar"><label className="search"><Icon name="search" size={17} /><span className="sr">ค้นหา IP หรือเหตุการณ์</span><input placeholder="ค้นหา IP หรือเหตุการณ์…" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="tabs" role="group" aria-label="กรองแหล่งต้นทาง">{[['all', 'ทั้งหมด'], ['attention', 'ต้องตรวจสอบ'], ['blocked', 'บล็อกอยู่']].map(([key, text]) => <button key={key} className={key === filter ? 'on' : ''} aria-pressed={key === filter} onClick={() => setFilter(key)}>{text}</button>)}</div></div>
    <div className="sourceResult" role="status">{rows.length} แหล่งต้นทาง <span>เหตุการณ์และคำขอที่ระบบบันทึกได้</span>{(query || filter !== 'all') && <button className="link" onClick={() => { setQuery(''); setFilter('all') }}>ล้างตัวกรอง</button>}</div>
    {rows.length ? <div className="tableWrap sourceTable"><table><thead><tr><th>ต้นทาง / SOURCE IP</th><th>มาจากไหน</th><th>สิ่งที่ตรวจพบ</th><th>สถานะ</th><th>ดำเนินการ</th></tr></thead><tbody>{rows.map(r => <tr key={r.ip} className={selectedIp === r.ip ? 'selected' : ''}>
      <td data-label="ต้นทาง"><button className="sourceIpButton" onClick={() => onSelect(r.ip)} aria-pressed={selectedIp === r.ip}><span className={`sourceDot ${r.rules.length ? 'blocked' : r.incident && isOpenIncident(r.incident) ? 'alert' : ''}`} /><b>{r.ip}</b><Icon name="chevron" size={13} /></button><small className="cellMeta">{r.count} records · ล่าสุด {fmtTime(r.at)}</small></td>
      <td data-label="มาจากไหน"><b className="cellLabel">{r.location.label}</b><small className="cellMeta">{r.location.note}</small></td>
      <td data-label="เหตุการณ์">{r.incident ? <><a href={`#/incident/${r.incident.id}`}>{kindName(r.incident.kind)}</a><small className="cellMeta"><SeverityBadge value={r.incident.severity} />{r.incident.analysis_mode === 'rule_fallback' ? 'Rule fallback' : r.incident.analysis ? 'มีผลวิเคราะห์' : 'รอวิเคราะห์'}</small></> : r.lastAuth ? <><span className="cellLabel">{r.lastAuth.outcome === 'success' ? 'ล็อกอินสำเร็จ' : 'ล็อกอินไม่สำเร็จ'}</span><small className="cellMeta">HTTP_AUTH · {fmtTime(r.lastAuth.timestamp)}</small></> : <><span className="cellLabel">ยังไม่พบ incident</span><small className="cellMeta">จากข้อมูลที่บันทึกได้</small></>}</td>
      <td data-label="สถานะ">{r.rules.length ? <><span className="badge bad">บล็อกอยู่</span><small className="cellMeta">เหลือ {remaining(r.rules[0], now)} · {r.incident?.status === 'verified' ? 'ยืนยัน 403 แล้ว' : 'รอคำขอใหม่ยืนยัน'}</small></> : r.proposal ? <span className="badge warn">รออนุมัติ</span> : r.incident && isOpenIncident(r.incident) ? <span className="badge info">ต้องตรวจสอบ</span> : <span className="badge muted">ไม่มีกฎบล็อก</span>}</td>
      <td data-label="ดำเนินการ"><div className="rowActions">{r.rules.length ? <button className="btn ghost sm" disabled={ctx.busy || !!ctx.error} onClick={() => onRespond({ rule: r.rules[0], incident: r.incident })}>ปลดบล็อก</button> : r.proposal ? <button className="btn primary sm" disabled={ctx.busy || !!ctx.error} onClick={() => onRespond({ proposal: r.proposal, incident: r.incident, action: 'approve' })}>ตรวจ / บล็อก</button> : r.incident && !r.incident.analysis && r.incident.status === 'detected' ? <button className="btn dark sm" disabled={ctx.busy || !!ctx.error} onClick={() => ctx.act(`/api/incidents/${r.incident.id}/analyze`, { ok: 'วิเคราะห์เสร็จแล้ว · ตรวจผลและข้อเสนอในหน้าแรกได้เลย' })}>วิเคราะห์</button> : r.incident?.status === 'analyzing' ? <span className="muted small">กำลังวิเคราะห์…</span> : r.incident ? <a className="btn ghost sm" href={`#/incident/${r.incident.id}`}>ดูเหตุการณ์</a> : <span className="muted">—</span>}</div></td>
    </tr>)}</tbody></table></div> : <Empty>{activity.length ? <>ไม่พบรายการที่ตรงกับตัวกรอง <button className="link" onClick={() => { setQuery(''); setFilter('all') }}>แสดงทั้งหมด</button></> : 'ยังไม่มี IP เข้ามาจาก rod-mai-rod'}</Empty>}
  </>
}
