import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App.jsx'
import { useAppearance } from '../src/components/Appearance.jsx'
import '../src/style.css'
import '../src/network-theme.css'
import '../src/command-center.css'
import '../src/poster-theme.css'
import '../src/production-layout.css'
import '../src/appearance.css'
import '../src/icon-artwork.css'
import '../src/overview-details.css'
import '../src/ai-flow.css'
import '../src/console-theme.css'
import '@fontsource/noto-sans-thai/400.css'
import '@fontsource/noto-sans-thai/600.css'
import '@fontsource/chakra-petch/600.css'

if (!import.meta.env.DEV) throw new Error('Local fixture only')
let kind = 'HTTP_FLOOD'
const sockets = new Set(), now = Date.now(), source = '198.51.100.80'
const at = seconds => new Date(now - 90000 + seconds * 1000).toISOString()
const paths = JSON.stringify(['/<img src=x onerror="alert(1)">', 'https://example.invalid/<script>alert(1)</script>'])
function report() {
  const legacy = kind === 'HTTP_AUTH_BRUTE_FORCE'
  const events = (legacy ? Array.from({ length: 5 }, () => ({ event_type: 'HTTP_AUTH', outcome: 'failed' })) : [
    { request_count: 140, not_found: 4, scan_paths: 1, outcome: 'attempt' },
    { request_count: 159, not_found: 5, scan_paths: 1, outcome: kind === 'HONEYPOT' ? 'honeypot' : 'attempt' },
    { request_count: 1, not_found: 1, scan_paths: 1, outcome: 'attempt' },
  ]).map((event, i) => ({ event_type: 'HTTP_REQUEST', ...event, id: i + 1, timestamp: at(legacy ? i : i * 30), source_ip: source, paths }))
  return { id: 1, kind, source_ip: source, status: 'awaiting_approval', severity: 'HIGH', event_count: events.length,
    created_at: at(0), updated_at: at(60), analysis_mode: 'rule_fallback',
    analysis: { threat_type: kind, confidence: null, severity: 'HIGH', explanation_th: 'หลักฐานสังเคราะห์สำหรับตรวจหน้าจอ', evidence: ['ตรวจค่าจาก event ที่บันทึกไว้'], recommended_action: 'TEMP_BLOCK_IP' },
    proposal: { id: 1, incident_id: 1, target_ip: source, source_ip: source, action: 'TEMP_BLOCK_IP', source: 'rule_fallback', status: 'pending', duration_seconds: 600, created_at: at(60) },
    trace: [], traffic: [], events, timeline: [{ id: 1, stage: 'detected', created_at: at(60), detail: 'ข้อมูลสังเคราะห์' }],
  }
}
window.fetch = async (input, options = {}) => {
  if (options.method && options.method !== 'GET') return new Response('{"detail":"Read-only fixture"}', { status: 405 })
  const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname, r = report()
  const data = path === '/api/health' ? { model: 'local-model', model_ready: true, ai_mode: 'ollama' }
    : path === '/api/incidents' ? [r] : path === '/api/proposals' ? [r.proposal]
      : path.startsWith('/api/reports/') ? r : path === '/api/events' ? r.events
        : path === '/api/audit/verify' ? { valid: true, count: 0 } : []
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
window.WebSocket = class {
  constructor() { sockets.add(this); queueMicrotask(() => this.onopen?.()) }
  close() { sockets.delete(this) }
}
if (!location.hash) location.hash = '/incident/1'
function Fixture() {
  const [theme, toggleTheme] = useAppearance(), [chosen, setChosen] = useState(kind)
  return <><div style={{ padding: '10px 16px', background: '#283544', color: '#fff', position: 'relative', zIndex: 2000 }}>
    <b>ข้อมูลสังเคราะห์ · อ่านอย่างเดียว · ไม่ส่งคำสั่งจริง</b>
    <select aria-label="ชนิดเหตุการณ์ทดสอบ" value={chosen} onChange={e => { kind = e.target.value; setChosen(kind); sockets.forEach(s => s.onmessage?.({ data: '{}' })) }}>
      {['HTTP_FLOOD', 'WEB_SCAN', 'HONEYPOT', 'HTTP_AUTH_BRUTE_FORCE'].map(value => <option key={value}>{value}</option>)}
    </select>
  </div><App adminUsername="test-admin" onLogout={() => {}} theme={theme} onToggleTheme={toggleTheme} /></>
}
createRoot(document.getElementById('root')).render(<Fixture />)
