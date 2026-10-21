import React, { useState } from 'react'
import { Icon, isFallback, isOpenIncident, parseAnalysis } from '../ui.jsx'
import GlobeCanvas from './GlobeCanvas.jsx'
import { sourceLocation } from './SourceList.jsx'

const DEMO_PLACES = [
  { name: 'Frankfurt', country: 'Germany', latitude: 50.11, longitude: 8.68 },
  { name: 'Tokyo', country: 'Japan', latitude: 35.68, longitude: 139.69 },
  { name: 'New York', country: 'United States', latitude: 40.71, longitude: -74.01 },
]

export default function NetworkTopology({ data, activeRules, connected, selectedIp }) {
  const [mapMode, setMapMode] = useState('live')
  const [placeIndex, setPlaceIndex] = useState(0)
  const [sampleThreat, setSampleThreat] = useState(true)
  const remote = data.traffic.find(t => !['127.0.0.1', '::1'].includes(t.source_ip))
    || data.events.find(e => !['127.0.0.1', '::1'].includes(e.source_ip))
  const ip = selectedIp || remote?.source_ip
  const location = ip && sourceLocation(ip, data)
  const incident = data.incidents.find(item => item.source_ip === ip)
  const blocked = ip && activeRules.some(rule => rule.source_ip === ip)
  const analysis = parseAnalysis(incident?.analysis)?.json
  const modelFinding = !isFallback(incident) && ['ollama', 'ollama_retry', 'ollama_no_tools'].includes(incident?.analysis_mode) && analysis && !['UNKNOWN', 'BENIGN'].includes(analysis.threat_type) && ['CRITICAL', 'HIGH', 'MEDIUM'].includes(analysis.severity)
  const state = !ip ? 'Awaiting client' : blocked ? 'App-level block' : incident && isOpenIncident(incident) ? 'Incident detected' : 'Requests allowed'
  const tone = !ip ? 'quiet' : blocked ? 'coral' : incident && isOpenIncident(incident) ? 'amber' : 'mint'
  const preview = mapMode !== 'live', sample = mapMode === 'sample'
  const place = DEMO_PLACES[placeIndex]
  const threat = sample ? sampleThreat : !!incident && isOpenIncident(incident) && ['CRITICAL', 'HIGH', 'MEDIUM'].includes(String(incident.severity).toUpperCase())
  const markerIp = sample ? '203.0.113.42' : ip
  const previewMarkers = markerIp ? [{ ...place, threat, label: markerIp }] : []
  const liveIps = [...new Set([...data.incidents.map(i => i.source_ip), ...data.traffic.map(t => t.source_ip), ...data.events.map(e => e.source_ip)])].filter(x => x && !['127.0.0.1', '::1'].includes(x))
  const liveSources = preview ? [] : liveIps.slice(0, 6).map(sip => {
    const inc = data.incidents.find(i => i.source_ip === sip)
    const blk = activeRules.some(r => r.source_ip === sip)
    const open = inc && isOpenIncident(inc)
    return { ip: sip, status: blk ? 'blocked' : open ? 'alert' : 'safe' }
  })
  // Stable diagram placement only; hashing an address cannot determine its location.
  const displayPositionFromIp = sip => {
    const p = sip.split('.').map(Number)
    const h = (((p[0] || 0) * 2654435761) + ((p[1] || 0) * 40503) + ((p[2] || 0) * 257) + (p[3] || 0)) >>> 0
    return { latitude: (h % 120) - 60, longitude: ((h >> 8) % 340) - 170 }
  }
  const liveMarkers = liveSources.map(s => ({ ...displayPositionFromIp(s.ip), threat: s.status !== 'safe', blocked: s.status === 'blocked', label: s.ip }))
  const hasGeo = !!data.geo_locations?.length
  return <div className={`networkView worldView ${preview ? 'preview' : ''}`}>
    <div className="networkHeader"><span className="networkScope"><span className="scopeSquare" />{preview ? 'DEMO LOCATION' : 'NETWORK VISUALIZATION'}</span><label className="mapMode"><span className="sr">Globe display mode</span><select value={mapMode} onChange={event => setMapMode(event.target.value)}><option value="live">Live network</option><option value="lab">Neo · demo location</option><option value="sample">Sample external IP</option></select></label><span className={`networkState ${tone}`}><i className="dot" />{state}</span></div>
    {preview && <div className="globeDemoControls"><span className="demoTag">DEMO</span><label><span className="sr">Demonstration city</span><select value={placeIndex} onChange={event => setPlaceIndex(Number(event.target.value))}>{DEMO_PLACES.map((p, index) => <option key={p.name} value={index}>{p.name}, {p.country}</option>)}</select></label>{sample && <button className={`demoThreat ${sampleThreat ? 'danger' : ''}`} aria-pressed={sampleThreat} onClick={() => setSampleThreat(value => !value)}><i className="dot" />{sampleThreat ? 'Threat scenario' : 'Normal scenario'}</button>}</div>}
    <div className="networkStage globeStage">
      <img className="worldGridAsset" src="/assets/network-grid.svg" alt="" />
      <GlobeCanvas markers={preview ? previewMarkers : (data.geo_locations?.length ? data.geo_locations : liveMarkers)} focusLongitude={preview ? place.longitude : null} />
      <span className="globeCross north" aria-hidden="true">+</span><span className="globeCross south" aria-hidden="true">+</span>
      {preview && <div className={`globeMarkerInfo ${threat ? 'danger' : ''}`}><span className="markerInfoDot" /><div><b>{markerIp || 'Waiting for Neo request'}</b><span>{place.name}, {place.country}</span><small>{sample ? (sampleThreat ? 'Simulated threat finding' : 'Simulated normal request') : modelFinding ? 'AI finding recorded' : threat ? 'Rule alert recorded' : 'No incident recorded'}</small></div></div>}
      <div className="mapCoordinate"><span>MONITORING NODE</span><b>M5 / SENTINEL</b><small>{preview ? 'DEMO COORDINATES' : 'LIVE APPLICATION EVENTS'}</small></div>
      <span className="globeCaption">{preview ? 'DEMO LOCATION VIEW' : hasGeo ? 'NETWORK OBSERVATORY / LIVE GEO' : 'IP LAYOUT / NOT GEOIP'}</span>
    </div>
    <div className="globeHudRow">
      <div className="globeHud clientHud"><span className="hudEyebrow"><Icon name="laptop" size={12} />IP ที่เลือก</span><strong>{ip || 'รอคำขอจาก Neo'}</strong><span className={tone}>{state}</span></div>
      <div className="globeHud serverHud"><span className="hudEyebrow"><Icon name="trace" size={12} />ตำแหน่งต้นทาง</span><strong>{location?.label || 'ยังไม่พบต้นทาง'}</strong><span>{location?.note || 'ข้อมูลจะแสดงเมื่อมีคำขอเข้ามา'}</span></div>
      <div className="globeHud rulesHud"><span className="hudEyebrow"><Icon name="shield" size={12} />กฎบล็อก</span><strong>{activeRules.length}<small> กฎที่ทำงาน</small></strong><span>อนุมัติโดยผู้ตรวจทาน</span></div>
    </div>
    {!preview && !hasGeo && <p className="globeDemoNote"><Icon name="info" size={12} />IP มาจากบันทึกของระบบ · ตำแหน่งหมุดจัดวางเพื่อแสดงภาพ ไม่ใช่ตำแหน่งประเทศจริง</p>}
    {!preview && (liveSources.length ? <ul className="liveSources" aria-label="IP ที่ระบบบันทึกได้">{liveSources.map(s => <li key={s.ip} className={s.status}><i className={`dot ${s.status === 'blocked' ? 'coral' : s.status === 'alert' ? 'amber' : 'mint'}`} /><b className="mono">{s.ip}</b><span>{s.status === 'blocked' ? 'มีกฎบล็อกทำงาน' : s.status === 'alert' ? 'กำลังตรวจสอบ · ต้องสงสัย' : 'ยังไม่พบเหตุการณ์เปิด'}</span></li>)}</ul> : <p className="liveSourcesEmpty">ยังไม่มี IP เข้ามา · เมื่อมีคำขอผ่านระบบป้องกันเว็บ rod-mai-rod จะแสดงที่นี่</p>)}
    {preview && <p className="globeDemoNote"><Icon name="info" size={12} />{sample ? 'Illustration only · TEST-NET example IP. Location and finding are simulated.' : 'Recorded source IP and incident status. Map location is manually assigned for this demo.'}</p>}
    <div className="networkFooter"><span><Icon name="laptop" size={14} /><span>{preview ? markerIp || 'No client observed' : ip || 'No client observed'}</span></span><span><Icon name="shield" size={14} />{preview ? 'Demo location · not GeoIP' : hasGeo ? 'พิกัดจากข้อมูลระบบ' : 'rod-mai-rod · ยังไม่มี GeoIP'}</span><span className={connected ? 'mint' : 'muted'}><i className="dot" />{connected ? 'Live connection' : 'Connection pending'}</span></div>
  </div>
}
