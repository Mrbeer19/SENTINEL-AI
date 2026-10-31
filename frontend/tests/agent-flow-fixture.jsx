// Local development fixture entry, excluded from the production build's single index.html entry.
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
import '@fontsource/noto-sans-thai/400.css'
import '@fontsource/noto-sans-thai/600.css'
import '@fontsource/chakra-petch/600.css'

if (!import.meta.env.DEV) throw new Error('This fixture is available in development only')
let scenario = 'pending'
const sockets = new Set(), requests = []
const created = new Date(Date.now()-360000).toISOString()
const base = { severity: 'HIGH', id: 1, kind: 'HTTP_AUTH_BRUTE_FORCE', source_ip: '198.51.100.24', status: 'detected', event_count: 6, created_at: created, updated_at: created, trace: [], timeline: [], events: [], traffic: [] }
const agents = ['investigation', 'threat_analysis', 'defense_planning']
const trace = agents.flatMap((agent, i) => [
  { id: i * 2 + 1, agent, operation: i === 0 ? 'execute_tool' : 'chat', tool: i === 0 ? 'get_incident_logs' : 'model', status: 'ok', duration_ms: 900, created_at: created, input: '{}', output: '{"ok":true}' },
  { id: i * 2 + 2, agent, operation: 'invoke_agent', tool: agent, status: 'ok', duration_ms: 1600 + i * 1000, created_at: created, input: '{}', output: '{}' },
])
const analysis = { threat_type: 'HTTP_AUTH_BRUTE_FORCE', severity: 'HIGH', confidence: .94, explanation_th: 'พบการเข้าสู่ระบบไม่สำเร็จซ้ำในช่วงเวลาสั้น ควรตรวจหลักฐานและพิจารณาบล็อกชั่วคราว', evidence: ['พบการล็อกอินไม่สำเร็จ 6 ครั้ง', 'เหตุการณ์มาจาก IP เดียวกัน'], recommended_action: 'TEMP_BLOCK_IP' }
function report(kind = scenario) {
  const r = { ...base, trace: [], timeline: [] }
  if (kind === 'detected') return r
  if (['analyzing', 'analyst', 'planner'].includes(kind)) return { ...r, status: 'analyzing', trace: kind === 'analyzing' ? trace.slice(0, 1) : kind === 'analyst' ? trace.slice(0, 3) : trace.slice(0, 5) }
  Object.assign(r, { analysis, analysis_mode: 'ollama', trace })
  if (kind === 'no-action') return { ...r, status: 'monitoring', proposal: null }
  r.proposal = { id: 1, incident_id: 1, status: 'pending', action: 'TEMP_BLOCK_IP', target_ip: base.source_ip, source_ip: base.source_ip, duration_seconds: 600, source: 'model', created_at: created }
  r.status = 'awaiting_approval'
  if (['blocked', 'verified', 'expired'].includes(kind)) { r.proposal = { ...r.proposal, status: 'approved', reviewer: 'QA admin' }; r.status = kind === 'expired' ? 'closed' : kind }
  if (kind === 'rejected') { r.proposal = { ...r.proposal, status: 'rejected', reviewer: 'QA admin' }; r.status = 'rejected' }
  if (kind === 'fallback') { r.analysis_mode = 'rule_fallback'; r.analysis = { ...analysis, confidence: null }; r.proposal = { ...r.proposal, source: 'rule_fallback' }; r.trace = [{ ...trace[0], operation: 'chat', status: 'error' }, { ...trace[1], agent: 'rule_fallback', status: 'fallback' }] }
  return r
}
window.fetch = async (input, options = {}) => {
  const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname
  requests.push({ path, method: options.method || 'GET' })
  document.querySelector('[data-qa-requests]')?.setAttribute('data-qa-requests', JSON.stringify(requests))
  if (options.method && options.method !== 'GET') return new Response('{"detail":"QA fixture does not execute commands"}', { status: 405, headers: { 'Content-Type': 'application/json' } })
  if (scenario === 'offline') throw new TypeError('Fixture offline')
  const r = report(), second = { ...report('verified'), id: 2, kind: 'PORT_SCAN', severity: 'MEDIUM', source_ip: '192.0.2.42', proposal: { ...report('verified').proposal, id: 2, incident_id: 2, source_ip:'192.0.2.42',target_ip:'192.0.2.42' } }
  const extras = ['TRAFFIC_ANOMALY','SSH_BRUTE_FORCE','SUSPICIOUS_LOGIN'].map((kind,i)=>({...base,id:i+3,kind,source_ip:`203.0.113.${i+20}`,severity:i===0?'CRITICAL':'LOW',status:'detected',analysis:null,trace:[]}))
  const incidents = scenario==='empty'?[]:[r,second,...extras]
  const events = scenario==='empty'?[]:Array.from({length:32},(_,i)=>({id:i+1,event_type:i%4===0?'SSH_AUTH':'HTTP_AUTH',source_ip:i%3===0?'192.0.2.42':base.source_ip,timestamp:new Date(Date.now()-i*31000).toISOString(),outcome:i%5===0?'success':'failed',username:'qa-user',destination_port:null}))
  const traffic = scenario==='empty'?[]:Array.from({length:58},(_,i)=>({id:100+i,source_ip:i%3===0?'192.0.2.42':base.source_ip,created_at:new Date(Date.now()-i*13000).toISOString(),decision:i%3===0?'denied':'allowed'}))
  const rules = scenario==='empty'?[]:[{id:2,proposal_id:2,source_ip:'192.0.2.42',created_at:created,expires_at:new Date(Date.now()+600000).toISOString(),active:true}]
  const reports = incidents.map(i=>({...i,events:events.filter(e=>e.source_ip===i.source_ip),traffic:traffic.filter(t=>t.source_ip===i.source_ip),timeline:[{id:1,stage:'detected',created_at:created,detail:'ตรวจพบจากข้อมูลทดสอบที่แยกจากระบบจริง'}]}))
  let data = path === '/api/health' ? { model: 'sentinel-r3', model_ready: true, ai_mode: 'ollama' }
    : path === '/api/incidents' ? incidents : path === '/api/proposals' ? incidents.map(i=>i.proposal).filter(Boolean)
      : path.startsWith('/api/reports/') ? reports.find(i=>i.id===Number(path.split('/').at(-1)))
      : path === '/api/events' ? events : path === '/api/traffic' ? traffic : path === '/api/rules' ? rules
      : path === '/api/audit/verify' ? {valid:true,count:0} : []
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
window.WebSocket = class FixtureSocket {
  constructor() { sockets.add(this); queueMicrotask(() => this.onopen?.()) }
  close() { sockets.delete(this) }
}
if (!location.hash) location.hash = '/trace/1'
function Fixture() {
  const [theme, toggleTheme] = useAppearance(), [chosen, setChosen] = useState(scenario)
  return <><div style={{ padding: '10px 16px', background: '#513e1a', color: '#fff', font: '12px system-ui', position: 'relative', zIndex: 2000 }}><b>LOCAL QA · ข้อมูลสังเคราะห์ · ไม่ส่งคำสั่งจริง</b><label style={{ marginLeft: 15 }}>สถานการณ์ <select aria-label="สถานการณ์ทดสอบ" value={chosen} onChange={e => { scenario = e.target.value; setChosen(scenario); sockets.forEach(s => s.onmessage?.({ data: '{}' })) }}>{['detected','analyzing','analyst','planner','pending','blocked','verified','rejected','fallback','no-action','expired','empty','offline'].map(s => <option key={s}>{s}</option>)}</select></label><button type="button" onClick={() => document.querySelector('.spatialCanvas canvas')?.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))}>ทดสอบ WebGL ขัดข้อง</button><span data-qa-requests={JSON.stringify(requests)}/></div><App adminUsername="QA admin" onLogout={() => {}} theme={theme} onToggleTheme={toggleTheme}/></>
}
createRoot(document.getElementById('root')).render(<Fixture/> )

import '../src/console-theme.css'
