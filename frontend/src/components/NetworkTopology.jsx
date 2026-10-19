import React, { useState } from 'react'
import { Icon, parseAnalysis } from '../ui.jsx'
import GlobeCanvas from './GlobeCanvas.jsx'

const DEMO_PLACES = [
  { name: 'Frankfurt', country: 'Germany', latitude: 50.11, longitude: 8.68 },
  { name: 'Tokyo', country: 'Japan', latitude: 35.68, longitude: 139.69 },
  { name: 'New York', country: 'United States', latitude: 40.71, longitude: -74.01 },
]

export default function NetworkTopology({ data, activeRules, connected }) {
  const [mapMode, setMapMode] = useState('live')
  const [placeIndex, setPlaceIndex] = useState(0)
  const [sampleThreat, setSampleThreat] = useState(true)
  const remote = data.traffic.find(t => !['127.0.0.1', '::1'].includes(t.source_ip))
    || data.events.find(e => !['127.0.0.1', '::1'].includes(e.source_ip))
  const ip = remote?.source_ip
  const incident = data.incidents.find(item => item.source_ip === ip)
  const blocked = ip && activeRules.some(rule => rule.source_ip === ip)
  const analysis = parseAnalysis(incident?.analysis)?.json
  const modelFinding = ['ollama', 'ollama_no_tools'].includes(incident?.analysis_mode) && analysis && analysis.classification !== 'UNKNOWN' && ['high', 'medium'].includes(analysis.severity)
  const state = !ip ? 'Awaiting client' : blocked ? 'App-level block' : incident && incident.status !== 'rejected' ? 'Incident detected' : 'Requests allowed'
  const tone = !ip ? 'quiet' : blocked ? 'coral' : incident && incident.status !== 'rejected' ? 'amber' : 'mint'
  const preview = mapMode !== 'live', sample = mapMode === 'sample'
  const place = DEMO_PLACES[placeIndex]
  const threat = sample ? sampleThreat : !!incident && incident.status !== 'rejected' && ['high', 'medium'].includes(incident.severity)
  const markerIp = sample ? '203.0.113.42' : ip
  const previewMarkers = markerIp ? [{ ...place, threat, label: markerIp }] : []
  return <div className={`networkView worldView ${preview ? 'preview' : ''}`}>
    <div className="networkHeader"><span className="networkScope"><span className="scopeSquare" />{preview ? 'DEMO LOCATION' : 'NETWORK VISUALIZATION'}</span><label className="mapMode"><span className="sr">Globe display mode</span><select value={mapMode} onChange={event => setMapMode(event.target.value)}><option value="live">Live network</option><option value="lab">Neo · demo location</option><option value="sample">Sample external IP</option></select></label><span className={`networkState ${tone}`}><i className="dot" />{state}</span></div>
    {preview && <div className="globeDemoControls"><span className="demoTag">DEMO</span><label><span className="sr">Demonstration city</span><select value={placeIndex} onChange={event => setPlaceIndex(Number(event.target.value))}>{DEMO_PLACES.map((p, index) => <option key={p.name} value={index}>{p.name}, {p.country}</option>)}</select></label>{sample && <button className={`demoThreat ${sampleThreat ? 'danger' : ''}`} aria-pressed={sampleThreat} onClick={() => setSampleThreat(value => !value)}><i className="dot" />{sampleThreat ? 'Threat scenario' : 'Normal scenario'}</button>}</div>}
    <div className="networkStage globeStage">
      <GlobeCanvas markers={preview ? previewMarkers : data.geo_locations || []} focusLongitude={preview ? place.longitude : null} />
      <span className="globeCross north" aria-hidden="true">+</span><span className="globeCross south" aria-hidden="true">+</span>
      {preview && <div className={`globeMarkerInfo ${threat ? 'danger' : ''}`}><span className="markerInfoDot" /><div><b>{markerIp || 'Waiting for Neo request'}</b><span>{place.name}, {place.country}</span><small>{sample ? (sampleThreat ? 'Simulated threat finding' : 'Simulated normal request') : modelFinding ? 'AI finding recorded' : threat ? 'Rule alert recorded' : 'No incident recorded'}</small></div></div>}
      <span className="globeCaption">{preview ? 'DEMO LOCATION VIEW' : 'LOCAL TELEMETRY · GLOBE VIEW'}</span>
    </div>
    <div className="globeHudRow">
      <div className="globeHud clientHud"><span className="hudEyebrow"><Icon name="laptop" size={12} />RECORDED SOURCE</span><strong>{ip || 'Awaiting Neo'}</strong><span className={tone}>{state}</span></div>
      <div className="globeHud serverHud"><span className="hudEyebrow"><Icon name="server" size={12} />SERVER NODE</span><strong>M5 Server</strong><span>{connected ? 'Connected' : 'Connecting'} · Local SOC</span></div>
      <div className="globeHud rulesHud"><span className="hudEyebrow"><Icon name="shield" size={12} />APP FIREWALL</span><strong>{activeRules.length}<small> active rules</small></strong><span>Human-approved response</span></div>
    </div>
    {preview && <p className="globeDemoNote"><Icon name="info" size={12} />{sample ? 'Illustration only · TEST-NET example IP. Location and finding are simulated.' : 'Recorded source IP and incident status. Map location is manually assigned for this demo.'}</p>}
    <div className="networkFooter"><span><Icon name="laptop" size={14} /><span>{preview ? markerIp || 'No client observed' : ip || 'No client observed'}</span></span><span><Icon name="shield" size={14} />{preview ? 'Demo location · not GeoIP' : 'Local network · no GeoIP'}</span><span className={connected ? 'mint' : 'muted'}><i className="dot" />{connected ? 'Live connection' : 'Connection pending'}</span></div>
  </div>
}
