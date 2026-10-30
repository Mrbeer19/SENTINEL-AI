import React, { useState, useRef } from 'react'
import { Icon, fmtTime, isOpenIncident } from '../ui.jsx'
import GlobeCanvas from './GlobeCanvas.jsx'
import { sourceLocation } from './SourceList.jsx'
import { isRealPublicIp, sourceActivity } from '../sourceActivity.js'

const PROTECTED_SITE = import.meta.env.VITE_PROTECTED_SITE_HOST || 'ไม่ได้ตั้งค่า'
const PROTECTED_SITE_IP = import.meta.env.VITE_PROTECTED_SITE_IP || 'ไม่ได้ตั้งค่า'

export default function NetworkTopology({ data, activeRules, connected, selectedIp, onSelectIp, geoByIp = {} }) {
  const controls = useRef(null)
  const [selectedRow, setSelectedRow] = useState(null)
  const [focusVersion, setFocusVersion] = useState(0)
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
  const allLogins = data.events.filter(e => e.event_type === 'HTTP_AUTH')
  const testLoginCount = allLogins.filter(e => !isRealPublicIp(e.source_ip)).length
  const recentLogins = allLogins.filter(e => isRealPublicIp(e.source_ip)).slice(0, 6)
  const liveSources = recentLogins.length ? recentLogins.map(e => ({ key: `auth-${e.id}`, ip: e.source_ip, at: e.timestamp, status: e.outcome === 'failed' ? 'alert' : 'safe', detail: `ล็อกอิน${e.outcome === 'success' ? 'สำเร็จ' : 'ไม่สำเร็จ'}` })) : mapSources.filter(s => isRealPublicIp(s.ip))
  const markerSources = recentSources.filter(s => isRealPublicIp(s.ip)).slice(0, 12).map(s => ({ ...s, status: activeRules.some(r => r.source_ip === s.ip) ? 'blocked' : 'safe' }))
  if (isRealPublicIp(ip) && !markerSources.some(s => s.ip === ip)) markerSources.push({ ip, status: 'safe' })
  const availableMarkers = markerSources.flatMap(s => {
    const geo = geoByIp[s.ip] || data.geo_locations?.find(g => [g.source_ip, g.ip, g.label].includes(s.ip))
    if (!geo || !Number.isFinite(geo.latitude) || !Number.isFinite(geo.longitude) || Math.abs(geo.latitude) > 90 || Math.abs(geo.longitude) > 180) return []
    return [{ ip: s.ip, latitude: geo.latitude, longitude: geo.longitude, threat: s.status !== 'safe', blocked: s.status === 'blocked', label: `${s.ip} · ${geo.country || geo.country_name || ''}` }]
  })
  const selectedMarker = availableMarkers.find(m => m.ip === ip)
  const liveMarkers = selectedMarker ? [selectedMarker] : availableMarkers
  const fallbackGeo = availableMarkers[0]
  const focusGeo = selectedMarker || fallbackGeo || geoByIp[ip] || data.geo_locations?.find(g => [g.source_ip, g.ip, g.label].includes(ip))
  const hasGeo = liveMarkers.length > 0
  return <div className="networkView worldView">
    <div className="networkHeader"><span className="networkScope"><span className="scopeSquare" />NETWORK VISUALIZATION</span><span className={`networkState ${tone}`}><i className="dot" />{state}</span></div>
    <div className="networkStage globeStage">
      <img className="worldGridAsset" src="/assets/network-grid.svg" alt="" />
      <GlobeCanvas controlRef={controls} focusVersion={focusVersion} markers={liveMarkers} focusLongitude={focusGeo?.longitude ?? null} focusLatitude={focusGeo?.latitude ?? 0} />
      <div className="globeControls"><button onClick={() => controls.current?.zoomIn()} aria-label="ซูมเข้าลูกโลก">+</button><button onClick={() => controls.current?.zoomOut()} aria-label="ซูมออกลูกโลก">−</button><button onClick={() => controls.current?.reset()} aria-label="คืนมุมมองลูกโลก">◎</button></div>
      <span className="globeCross north" aria-hidden="true">+</span><span className="globeCross south" aria-hidden="true">+</span>
      <div className="mapCoordinate"><span>MONITORING NODE</span><b>SENTINEL</b><small>LIVE APPLICATION EVENTS</small></div>
      <span className="globeCaption">{hasGeo ? 'GEOIP / APPROXIMATE LOCATION' : 'AWAITING GEOIP'}</span>
    </div>
    <div className="globeHudRow">
      <div className="globeHud clientHud"><span className="hudEyebrow"><Icon name="laptop" size={12} />IP ของเว็บที่ป้องกัน</span><strong>{PROTECTED_SITE_IP}</strong><span>{PROTECTED_SITE}</span></div>
      <div className="globeHud serverHud"><span className="hudEyebrow"><Icon name="trace" size={12} />ที่ตั้งเครือข่ายต้นทาง</span><strong>{location?.label || 'ยังไม่พบต้นทาง'}</strong><span>{location?.note || 'เลือก IP จากรายการด้านล่างเพื่อดูตำแหน่งโดยประมาณ'}</span></div>
      <div className="globeHud rulesHud"><span className="hudEyebrow"><Icon name="brain" size={12} />สถานะโมเดล</span><strong>{modelStatus}</strong><span>{data.health?.model || 'รอข้อมูลจาก SENTINEL'}</span></div>
    </div>

    <details className="networkSources"><summary>ต้นทางล่าสุด <span>{liveSources.length} รายการ · กดเพื่อเลือก IP</span></summary>
    {liveSources.length ? <ul className="liveSources" aria-label={recentLogins.length ? 'ล็อกอินล่าสุด 6 ครั้ง' : 'IP ต้นทางล่าสุด 6 รายการ'}>{liveSources.map(s => <li key={s.key} className={`${s.status} ${selectedRow === s.key && ip === s.ip ? 'selected' : ''}`}><button type="button" className="sourcePinButton" aria-pressed={selectedRow === s.key && ip === s.ip} onClick={() => { setSelectedRow(s.key); setFocusVersion(v => v + 1); onSelectIp?.(s.ip) }} title="แสดง IP นี้บนลูกโลก"><i className={`dot ${s.status === 'blocked' ? 'coral' : s.status === 'alert' ? 'amber' : 'mint'}`} /><b className="mono">{s.ip}</b><span>{fmtTime(s.at)} · {s.detail}</span><span className="pinCountry">{geoByIp[s.ip]?.country || 'ดูตำแหน่ง'} ↗</span></button></li>)}</ul> : <p className="liveSourcesEmpty">ยังไม่มี IP เข้ามา · เมื่อมีคำขอผ่านระบบป้องกันเว็บ rod-mai-rod จะแสดงที่นี่</p>}
    {testLoginCount > 0 && <p className="geoTestNote">มี {testLoginCount} รายการ IP ทดสอบหรือเครือข่ายภายใน · ดูได้ในประวัติล็อกอิน แต่ไม่มีพิกัดบนโลก</p>}
    </details>
    <div className="networkFooter"><span><Icon name="laptop" size={14} /><span>IP ต้นทางที่เลือก: {ip || 'ยังไม่มี'}</span></span><span><Icon name="shield" size={14} />ป้องกัน rod-mai-rod</span><span className={connected ? 'mint' : 'muted'}><i className="dot" />{connected ? 'Live connection' : 'Connection pending'}</span></div>
  </div>
}
