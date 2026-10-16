import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

const sections = ['Dashboard', 'Incidents', 'AI Agent', 'Firewall', 'Simulator', 'Reports']
const icons = ['◫', '◇', '✧', '▣', '▷', '▤']
const fetchJson = async (path, options) => {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } })
  const payload = await response.json()
  if (!response.ok && !(response.status === 403 && payload.decision === 'denied')) throw new Error(`${response.status}: ${JSON.stringify(payload.detail || payload).slice(0, 160)}`)
  return payload
}
const badge = (value) => <span className={`badge ${['verified', 'approved', 'active', 'allowed'].includes(String(value).toLowerCase()) ? 'good' : ['blocked', 'denied', 'high'].includes(String(value).toLowerCase()) ? 'bad' : 'warn'}`}>{value || '—'}</span>
const fmt = (value) => value ? new Date(value).toLocaleString('th-TH') : '—'

function AnalysisBlock({value}) {
  if (!value) return <p className="analysis">ยังไม่ได้วิเคราะห์ · กด Run investigation เพื่อเรียก Qwen 3.5 4B</p>
  try {
    const result = JSON.parse(value)
    return <div className="analysis"><b>{result.summary}</b><ul>{result.evidence.map((item, index) => <li key={index}>{item}</li>)}</ul><p>{result.recommendation}</p></div>
  } catch { return <p className="analysis">{value}</p> }
}

function App() {
  const [page, setPage] = useState('Dashboard')
  const [data, setData] = useState({ health: null, events: [], incidents: [], proposals: [], rules: [], traffic: [], metrics: null })
  const [selected, setSelected] = useState(null)
  const [scenario, setScenario] = useState('http_brute_force')
  const [sourceIp, setSourceIp] = useState('192.0.2.25')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [connected, setConnected] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [health, events, incidents, proposals, rules, traffic, metrics] = await Promise.all([
        fetchJson('/api/health'), fetchJson('/api/events'), fetchJson('/api/incidents'), fetchJson('/api/proposals'), fetchJson('/api/rules'), fetchJson('/api/traffic'), fetchJson('/api/metrics'),
      ])
      setData({ health, events, incidents, proposals, rules, traffic, metrics })
      setError('')
    } catch (err) { setError(`เชื่อม backend ไม่ได้: ${err.message}`) }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    let socket, timer, refreshTimer, stopped = false
    const connect = () => {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`)
      socket.onopen = () => { setConnected(true); refresh() }
      socket.onmessage = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 150) }
      socket.onclose = () => { setConnected(false); if (!stopped) timer = setTimeout(connect, 2500) }
      socket.onerror = () => socket.close()
    }
    connect()
    return () => { stopped = true; clearTimeout(timer); clearTimeout(refreshTimer); socket?.close() }
  }, [refresh])

  const act = async (path, body = {}) => {
    setBusy(true); setError(''); setNotice('')
    try { const result = await fetchJson(path, { method: 'POST', body: JSON.stringify(body) }); await refresh(); return result }
    catch (err) { setError(err.message); return null }
    finally { setBusy(false) }
  }
  const detail = async (id) => { try { setSelected(await fetchJson(`/api/incidents/${id}`)); setPage('AI Agent') } catch (err) { setError(err.message) } }
  const simulate = async () => { const result = await act('/api/simulations', { scenario, source_ip: sourceIp }); if (result) { setNotice(`${result.events_created} events บันทึกแล้ว · ${result.source_note}`); if (result.incident) detail(result.incident.id) } }
  const analyze = async () => { if (!selected) return; const result = await act(`/api/incidents/${selected.id}/analyze`); if (result) setSelected(result) }
  const decision = async (action) => { if (!selected?.proposal) return; const result = await act(`/api/proposals/${selected.proposal.id}/${action}`, { reviewer: 'SOC operator' }); if (result) setSelected(result) }
  const testTraffic = async () => { const result = await act('/api/demo/traffic', { source_ip: sourceIp }); if (result) { setNotice(`Request ใหม่จาก ${result.source_ip}: ${result.decision}`); if (selected) detail(selected.id) } }

  const latest = data.incidents[0]
  const pending = data.proposals.filter(p => p.status === 'pending').length
  const activeRules = data.rules.filter(r => r.active).length
  const nav = <nav>{sections.map((item, index) => <button key={item} className={page === item ? 'active' : ''} onClick={() => setPage(item)}><span>{icons[index]}</span>{item}</button>)}</nav>
  return <div className="app">
    <aside><div className="brand"><div className="brandmark">◈</div><div><b>SENTINEL AI</b><small>SECURITY OPERATIONS CENTER</small></div></div><div className="navlabel">WORKSPACE</div>{nav}<div className="sidefoot"><div><i className={`dot ${connected ? '' : 'off'}`}/>{connected ? 'Real-time connected' : 'Reconnecting...'}</div><div><i className={`dot ${data.health?.model_ready ? '' : 'amber'}`}/>{data.health?.model_ready ? data.health.model : 'Rule fallback · Ollama unavailable'}</div><small>Controlled lab · app-level firewall</small></div></aside>
    <main><header><div>SENTINEL AI <span>/</span> <b>{page}</b></div><div className="topstatus"><span className="pill">LOCAL SOC</span><span className="pill amber">DEMO LAB</span></div></header>
      <div className="mobileNav">{nav}</div>
      <div className="heading"><div><div className="eyebrow">OBSERVE · REASON · DEFEND · VERIFY</div><h1>{page}</h1><p>ข้อมูลจาก backend และ SQLite จริง · อัปเดตผ่าน WebSocket</p></div><button className="button ghost" onClick={refresh}>↻ Refresh</button></div>
      {error && <div className="alert bad">{error}</div>}{notice && <div className="alert good">{notice}</div>}
      {page === 'Dashboard' && <>
        <div className="stats"><div className="card stat"><span>Security Events</span><strong>{data.metrics?.events ?? '—'}</strong><small>stored in SQLite</small></div><div className="card stat"><span>Incidents</span><strong>{data.metrics?.incidents ?? '—'}</strong><small>rule detection</small></div><div className="card stat"><span>Pending Approval</span><strong className="amberText">{pending}</strong><small>human decision required</small></div><div className="card stat"><span>Active Rules</span><strong className="greenText">{activeRules}</strong><small>app-level firewall</small></div></div>
        <div className="twocol"><section className="card"><h2>Recent Incidents <button className="link" onClick={() => setPage('Incidents')}>View all →</button></h2><div className="tableWrap"><table><thead><tr><th>ID</th><th>Type</th><th>Source IP</th><th>Status</th><th></th></tr></thead><tbody>{data.incidents.slice(0, 6).map(i => <tr key={i.id}><td>INC-{String(i.id).padStart(4,'0')}</td><td>{i.kind}</td><td>{i.source_ip}</td><td>{badge(i.status)}</td><td><button className="link" onClick={() => detail(i.id)}>Open →</button></td></tr>)}</tbody></table>{!data.incidents.length && <div className="empty">ยังไม่มี incident · เริ่ม simulation เพื่อทดสอบ pipeline</div>}</div></section><section className="card"><h2>Workflow</h2><div className="workflow">{['Event ingestion','Rule detection','AI investigation','Human approval','Firewall simulator','Verification'].map((step, i) => <div key={step}><span>{i+1}</span>{step}</div>)}</div><button className="button primary full" onClick={() => setPage('Simulator')}>Start controlled demo →</button></section></div>
      </>}
      {page === 'Incidents' && <section className="card"><h2>Incident Queue</h2><div className="tableWrap"><table><thead><tr><th>ID</th><th>Type</th><th>Source IP</th><th>Evidence</th><th>Severity</th><th>Status</th><th></th></tr></thead><tbody>{data.incidents.map(i => <tr key={i.id}><td>INC-{String(i.id).padStart(4,'0')}</td><td>{i.kind}</td><td>{i.source_ip}</td><td>{i.event_count} events</td><td>{badge(i.severity)}</td><td>{badge(i.status)}</td><td><button className="link" onClick={() => detail(i.id)}>Inspect →</button></td></tr>)}</tbody></table>{!data.incidents.length && <div className="empty">ไม่มี incident</div>}</div></section>}
      {page === 'AI Agent' && <div className="twocol agentGrid"><section className="card"><h2>Investigation <span className="muted">{selected ? `INC-${String(selected.id).padStart(4,'0')}` : ''}</span></h2>{selected ? <div className="detail"><div className="keyvals"><span>Threat</span><b>{selected.kind}</b><span>Source IP</span><b>{selected.source_ip}</b><span>Status</span>{badge(selected.status)}<span>Analysis mode</span><b>{selected.analysis_mode || 'pending'}</b></div><h3>Analysis</h3><AnalysisBlock value={selected.analysis}/><button className="button primary" disabled={busy || !!selected.analysis} onClick={analyze}>✧ Run investigation</button><h3>Tool execution trace</h3>{selected.trace?.length ? selected.trace.map(t => <details key={t.id}><summary>{t.tool} · {fmt(t.created_at)}</summary><pre>{t.output}</pre></details>) : <div className="empty">ยังไม่มี tool call</div>}</div> : <div className="empty">เลือก incident จากหน้า Incidents</div>}</section><section className="card"><h2>Defense Proposal</h2>{selected?.proposal ? <div className="detail"><div className="keyvals"><span>Action</span><b>{selected.proposal.action}</b><span>Target</span><b>{selected.proposal.source_ip}</b><span>Duration</span><b>{selected.proposal.duration_seconds / 60} minutes</b><span>Status</span>{badge(selected.proposal.status)}</div><p>ระบบจะเพิ่มกฎใน app-level firewall หลังคนอนุมัติเท่านั้น</p><div className="buttons"><button className="button primary" disabled={busy || selected.proposal.status !== 'pending'} onClick={() => decision('approve')}>Approve</button><button className="button danger" disabled={busy || selected.proposal.status !== 'pending'} onClick={() => decision('reject')}>Reject</button></div><h3>Timeline</h3><div className="timeline">{selected.timeline?.map(t => <div key={t.id}><time>{fmt(t.created_at)}</time><b>{t.stage}</b><small>{t.detail}</small></div>)}</div></div> : <div className="empty">วิเคราะห์ incident ก่อนเพื่อสร้าง proposal</div>}</section></div>}
      {page === 'Firewall' && <div className="twocol"><section className="card"><h2>Simulator Rules</h2><div className="tableWrap"><table><thead><tr><th>Source IP</th><th>Expires</th><th>Status</th></tr></thead><tbody>{data.rules.map(r => <tr key={r.id}><td>{r.source_ip}</td><td>{fmt(r.expires_at)}</td><td>{badge(r.active ? 'active' : 'expired')}</td></tr>)}</tbody></table>{!data.rules.length && <div className="empty">ยังไม่มีกฎ · ต้องอนุมัติ proposal ก่อน</div>}</div></section><section className="card"><h2>Before / After Verification</h2><div className="detail"><p>ส่ง request ใหม่จาก IP จำลองใน localhost เพื่อตรวจว่ากฎมีผลจริงในระดับแอป</p><label>Source IP<input value={sourceIp} onChange={e => setSourceIp(e.target.value)}/></label><button className="button primary full" disabled={busy} onClick={testTraffic}>Send test request</button><h3>Recent traffic</h3>{data.traffic.slice(0, 8).map(t => <div className="traffic" key={t.id}><span>{t.source_ip}</span>{badge(t.decision)}<small>{fmt(t.created_at)}</small></div>)}</div></section></div>}
      {page === 'Simulator' && <div className="twocol"><section className="card"><h2>Controlled Scenario</h2><div className="detail"><p>สร้าง events ผ่าน API ingestion เดียวกับข้อมูลปกติ ใช้เฉพาะ IP ของ lab</p><label>Scenario<select value={scenario} onChange={e => setScenario(e.target.value)}><option value="http_brute_force">HTTP auth brute force · demo traffic</option><option value="ssh_brute_force_logs">SSH brute force · synthetic log replay</option><option value="port_scan">Port scan · synthetic connection events</option><option value="normal">Normal traffic · no alert</option></select></label><label>Source IP<input value={sourceIp} onChange={e => setSourceIp(e.target.value)}/></label><button className="button primary full" disabled={busy} onClick={simulate}>{busy ? 'Running...' : 'Start simulation →'}</button><p className="smallnote">SSH scenario เป็น log replay; ไม่ได้เปิดการโจมตี SSH จริง</p></div></section><section className="card"><h2>Demo Steps</h2><div className="workflow">{['Send controlled events','Open detected incident','Run local AI investigation','Review proposal','Approve or reject','Send new traffic and verify','Open report'].map((s,i) => <div key={s}><span>{i+1}</span>{s}</div>)}</div></section></div>}
      {page === 'Reports' && <div className="twocol"><section className="card"><h2>Evaluation Snapshot</h2><div className="detail"><div className="reportStats"><div><span>Precision</span><b>{data.metrics ? (data.metrics.precision*100).toFixed(1) : '—'}%</b></div><div><span>Recall</span><b>{data.metrics ? (data.metrics.recall*100).toFixed(1) : '—'}%</b></div><div><span>F1</span><b>{data.metrics ? (data.metrics.f1*100).toFixed(1) : '—'}%</b></div></div><p className="smallnote">{data.metrics?.note}</p></div></section><section className="card"><h2>Incident Reports</h2><div className="detail">{data.incidents.map(i => <button className="reportLink" key={i.id} onClick={() => window.open(`/api/reports/${i.id}`, '_blank')}>INC-{String(i.id).padStart(4,'0')} · {i.kind} <span>JSON ↗</span></button>)}{!data.incidents.length && <div className="empty">ยังไม่มีรายงาน</div>}</div></section></div>}
      <footer>SENTINEL AI · MVP 0.1 · Local lab · {data.health?.model || 'Qwen 3.5 4B'}</footer>
    </main>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
