import React from 'react'
import { Icon, fmtTime, isOpenIncident } from '../ui.jsx'
import GlobeCanvas from './GlobeCanvas.jsx'
import { sourceLocation } from './SourceList.jsx'
import { sourceActivity } from '../sourceActivity.js'

const PROTECTED_SITE = 'rod-mai-rod.tntproduction.tech'
const PROTECTED_SITE_IP = '201.18.215.18'

export default function NetworkTopology({ data, activeRules, connected, selectedIp, geoByIp = {} }) {
  const recentSources = sourceActivity(data).filter(({ ip }) => !['127.0.0.1', '::1'].includes(ip))
  const ip = selectedIp || recentSources[0]?.ip
  const location = ip && sourceLocation(ip, data, geoByIp[ip])
  const modelReady = data.health?.model_ready
  const modelStatus = !data.health ? 'กำลังตรวจสอบ' : modelReady ? 'พร้อมใช้งาน' : 'ไม่พร้อมใช้งาน'
  const incident = data.incidents.find(item => item.source_ip === ip)
  const blocked = ip && activeRules.some(rule => rule.source_ip === ip)
  const state = !ip ? 'Awaiting client' : blocked ? 'App-level block' : incident && isOpenIncident(incident) ? 'Incident detected' : 'Requests allowed'
  const tone = !ip ? 'quiet' : blocked ? 'coral' : incident && isOpenIncident(incident) ? 'amber' : 'mint'
  const mapSources = recentSources.slice(0, 6).map(({ ip: sip, at }) => {
    const inc = data.incidents.find(i => i.source_ip === sip)
    const blk = activeRules.some(r => r.source_ip === sip)
    const open = inc && isOpenIncident(inc)
    const auth = data.events.find(e => e.source_ip === sip && e.event_type === 'HTTP_AUTH')
    return { key: `source-${sip}`, ip: sip, at, status: blk ? 'blocked' : open ? 'alert' : 'safe', detail: blk ? 'มีกฎบล็อกทำงาน' : open ? 'มี incident ที่ต้องตรวจ' : auth ? `ล็อกอิน${auth.outcome === 'success' ? 'สำเร็จ' : 'ไม่สำเร็จ'}` : 'ยังไม่มี incident เปิด' }
  })
  const recentLogins = data.events.filter(e => e.event_type === 'HTTP_AUTH').slice(0, 6)
  const liveSources = recentLogins.length ? recentLogins.map(e => ({ key: `auth-${e.id}`, ip: e.source_ip, at: e.timestamp, status: e.outcome === 'failed' ? 'alert' : 'safe', detail: `ล็อกอิน${e.outcome === 'success' ? 'สำเร็จ' : 'ไม่สำเร็จ'}` })) : mapSources
  // Stable diagram placement only; hashing an address cannot determine its location.
  const displayPositionFromIp = sip => {
    const p = sip.split('.').map(Number)
    const h = (((p[0] || 0) * 2654435761) + ((p[1] || 0) * 40503) + ((p[2] || 0) * 257) + (p[3] || 0)) >>> 0
    return { latitude: (h % 120) - 60, longitude: ((h >> 8) % 340) - 170 }
  }
  const liveMarkers = mapSources.map(s => ({ ...displayPositionFromIp(s.ip), threat: s.status !== 'safe', blocked: s.status === 'blocked', label: s.ip }))
  const hasGeo = !!data.geo_locations?.length
  return <div className="networkView worldView">
    <div className="networkHeader"><span className="networkScope"><span className="scopeSquare" />NETWORK VISUALIZATION</span><span className={`networkState ${tone}`}><i className="dot" />{state}</span></div>
    <div className="networkStage globeStage">
      <img className="worldGridAsset" src="/assets/network-grid.svg" alt="" />
      <GlobeCanvas markers={data.geo_locations?.length ? data.geo_locations : liveMarkers} />
      <span className="globeCross north" aria-hidden="true">+</span><span className="globeCross south" aria-hidden="true">+</span>
      <div className="mapCoordinate"><span>MONITORING NODE</span><b>SENTINEL</b><small>LIVE APPLICATION EVENTS</small></div>
      <span className="globeCaption">{hasGeo ? 'NETWORK OBSERVATORY / LIVE GEO' : 'IP LAYOUT / NOT GEOIP'}</span>
    </div>
    <div className="globeHudRow">
      <div className="globeHud clientHud"><span className="hudEyebrow"><Icon name="laptop" size={12} />IP ของเว็บที่ป้องกัน</span><strong>{PROTECTED_SITE_IP}</strong><span>{PROTECTED_SITE}</span></div>
      <div className="globeHud serverHud"><span className="hudEyebrow"><Icon name="trace" size={12} />ที่ตั้งเครือข่ายต้นทาง</span><strong>{location?.label || 'ยังไม่พบต้นทาง'}</strong><span>{location?.note || 'เลือก IP จากรายการด้านล่างเพื่อดูตำแหน่งโดยประมาณ'}</span></div>
      <div className="globeHud rulesHud"><span className="hudEyebrow"><Icon name="brain" size={12} />สถานะโมเดล</span><strong>{modelStatus}</strong><span>{data.health?.model || 'รอข้อมูลจาก SENTINEL'}</span></div>
    </div>
    <p className="globeDemoNote"><Icon name="info" size={12} />{recentLogins.length ? 'ล็อกอินล่าสุด 6 ครั้ง · IP เดิมจะแสดงซ้ำตามจำนวนครั้ง' : 'IP ต้นทางล่าสุด 6 รายการ'} · เรียงใหม่ไปเก่า · ตำแหน่งหมุดบนภาพ{hasGeo ? 'อาจมาจาก GeoIP' : 'จัดวางเพื่อแสดงภาพ ไม่ใช่ตำแหน่งจริง'}</p>
    {liveSources.length ? <ul className="liveSources" aria-label={recentLogins.length ? 'ล็อกอินล่าสุด 6 ครั้ง' : 'IP ต้นทางล่าสุด 6 รายการ'}>{liveSources.map(s => <li key={s.key} className={s.status}><i className={`dot ${s.status === 'blocked' ? 'coral' : s.status === 'alert' ? 'amber' : 'mint'}`} /><b className="mono">{s.ip}</b><span>{fmtTime(s.at)} · {s.detail}</span></li>)}</ul> : <p className="liveSourcesEmpty">ยังไม่มี IP เข้ามา · เมื่อมีคำขอผ่านระบบป้องกันเว็บ rod-mai-rod จะแสดงที่นี่</p>}
    <div className="networkFooter"><span><Icon name="laptop" size={14} /><span>IP ต้นทางที่เลือก: {ip || 'ยังไม่มี'}</span></span><span><Icon name="shield" size={14} />ป้องกัน rod-mai-rod</span><span className={connected ? 'mint' : 'muted'}><i className="dot" />{connected ? 'Live connection' : 'Connection pending'}</span></div>
  </div>
}
