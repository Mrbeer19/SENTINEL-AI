import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { request } from '../api.js'
import '../tokens.css'
import './neo.css'

// Tester-facing page served by the M5 at /neo/. Same origin as the API, no admin key, no approval controls.
const ORIGIN = location.origin
const HISTORY_KEY = 'sentinel-neo-history'

const loadHistory = () => { try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY)) || [] } catch { return [] } }
const saveHistory = (h) => { try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(h)) } catch { /* storage unavailable */ } }
const time = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour12: false })

function describe(entry) {
  if (entry.status === 0) return { tone: 'bad', title: 'No response', text: 'Could not reach the M5 server. Check the network and that the backend is running.' }
  if (entry.status === 403 && entry.body?.decision === 'denied') return { tone: 'bad', title: 'Request Denied', text: "Blocked by the demo application's temporary rule." }
  if (entry.status === 403) return { tone: 'bad', title: 'Forbidden', text: String(entry.body?.detail || 'Request refused by the server.') }
  if (entry.status === 401) return { tone: 'warn', title: 'Invalid credentials', text: 'Login failed. Repeated failures are what the SOC detects.' }
  if (entry.status === 200 && entry.path.endsWith('login')) return { tone: 'good', title: 'Login OK', text: 'Credentials accepted by the demo application.' }
  if (entry.status === 200) return { tone: 'good', title: 'Request Allowed', text: 'No rule blocks this source right now.' }
  return { tone: 'warn', title: `HTTP ${entry.status}`, text: String(entry.body?.detail ? JSON.stringify(entry.body.detail) : 'Unexpected response') }
}

function Icon({ d, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
}
const I = {
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7v.01M8 17v.01',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  laptop: 'M5 5h14v10H5zM2 19h20',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6',
  send: 'M3 11l18-8-8 18-2-8z',
  alert: 'M12 3l10 18H2L12 3zM12 10v5M12 18v.01',
  ok: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  terminal: 'M4 6l6 6-6 6M12 18h8',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8v.01',
}

function Neo() {
  const [online, setOnline] = useState(null)
  const [username, setUsername] = useState('student')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState(loadHistory)
  const [copied, setCopied] = useState(false)
  const last = history[0]
  const clientIp = history.find(h => h.body?.source_ip)?.body.source_ip

  useEffect(() => {
    let stop = false
    const check = async () => { try { await request('/api/health'); if (!stop) setOnline(true) } catch { if (!stop) setOnline(false) } }
    check()
    const t = setInterval(check, 10000)
    return () => { stop = true; clearInterval(t) }
  }, [])

  const send = async (path, body) => {
    setBusy(true)
    let entry
    try {
      const r = await request(path, { method: 'POST', body, accept: [401, 403, 422] })
      entry = { at: new Date().toISOString(), path, status: r.status, body: r.data }
      setOnline(true)
    } catch (err) {
      entry = { at: new Date().toISOString(), path, status: err.status || 0, body: { detail: err.message } }
      if (!err.status) setOnline(false)
    }
    setHistory(h => { const next = [entry, ...h].slice(0, 30); saveHistory(next); return next })
    setBusy(false)
  }

  const curl = `curl -i -X POST ${ORIGIN}/api/demo/traffic \\\n  -H "Content-Type: application/json" -d '{}'`
  const copy = async () => { try { await navigator.clipboard.writeText(curl); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked on http */ } }

  return <div className="neo">
    <header className="neoHead">
      <div className="neoBrand"><Icon d={I.shield} size={30} /><span>SENTINEL <b>AI</b></span></div>
      <h1>Neo Demo Client</h1>
      <span className="chip warn">LAB TARGET</span>
    </header>

    <section className="hero"><h2>Test the connection. See the response.</h2><p>Send a request to the M5 demo application and inspect the actual HTTP result.</p></section>

    <section className="infoBar" aria-label="Connection">
      <div><Icon d={I.server} size={26} /><span><small>Target server</small><b>M5 Server <em className={online ? 'good' : online === false ? 'bad' : ''}>● {online ? 'Online' : online === false ? 'Offline' : 'Checking…'}</em></b></span></div>
      <div><Icon d={I.link} size={26} /><span><small>Base URL</small><b className="mono">{ORIGIN}</b></span></div>
      <div><Icon d={I.laptop} size={26} /><span><small>Client IP (as seen by server)</small><b className="mono">{clientIp || 'shown after first request'}</b></span></div>
    </section>

    <div className="neoGrid">
      <section className="card">
        <form onSubmit={e => { e.preventDefault(); send('/api/demo/login', { username, password }) }}>
          <h3><Icon d={I.user} />Demo Login</h3>
          <p className="muted">Send a login request to the demo application.</p>
          <label><span>Username</span><input value={username} onChange={e => setUsername(e.target.value)} maxLength={80} autoComplete="off" /></label>
          <label><span>Password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} maxLength={120} autoComplete="off" /></label>
          <button className="btn ghost" disabled={busy}>Send login request</button>
          <small className="muted">POST /api/demo/login · password is never stored in events</small>
        </form>
        <hr />
        <h3><Icon d={I.send} />Request Test</h3>
        <p className="muted">Send a new request to check the current response.</p>
        <button className="btn primary" disabled={busy} onClick={() => send('/api/demo/traffic', {})}>{busy ? 'Sending…' : 'Send new request'}</button>
        <small className="muted center">POST /api/demo/traffic</small>
      </section>

      <Result entry={last} />
    </div>

    <section className="card">
      <div className="cardHead"><h3><Icon d={I.clock} />Request History</h3>{history.length > 0 && <button className="btn ghost sm" onClick={() => { setHistory([]); saveHistory([]) }}>Clear</button>}</div>
      <p className="muted">Requests sent from this browser tab only.</p>
      {history.length ? <div className="tableWrap"><table>
        <thead><tr><th>Time</th><th>Method</th><th>Endpoint</th><th>Status</th><th>Result</th></tr></thead>
        <tbody>{history.map((h, i) => { const d = describe(h); return <tr key={i} className={d.tone === 'bad' ? 'deny' : ''}>
          <td className="mono">{time(h.at)}</td><td className="post">POST</td><td className="mono">{h.path}</td>
          <td><span className={`code ${d.tone}`}>{h.status || '—'}</span></td><td>{d.title}</td>
        </tr> })}</tbody></table></div> : <p className="empty">No requests yet. Send one above.</p>}
    </section>

    <section className="card terminal">
      <div><h3><Icon d={I.terminal} />Same check in Terminal</h3><p className="muted">Run on Neo (macOS Terminal) — it uses this page's M5 address.</p>{navigator.clipboard && <button className="btn ghost sm" onClick={copy}>{copied ? 'Copied' : 'Copy command'}</button>}</div>
      <pre tabIndex={0}><span className="prompt">$ </span>{curl}{last?.path === '/api/demo/traffic' && last.status ? `\nHTTP/1.1 ${last.status} ${last.status === 403 ? 'Forbidden' : 'OK'}\n${JSON.stringify(last.body)}` : ''}</pre>
    </section>
  </div>
}

function Result({ entry }) {
  if (!entry) return <section className="card result idle" aria-live="polite"><Icon d={I.info} size={40} /><h3>No response yet</h3><p className="muted">Send a login or a new request to see the server's actual answer here.</p></section>
  const d = describe(entry)
  return <section className={`card result ${d.tone}`} aria-live="polite">
    <div className="resultHead">
      <span className="resultIcon"><Icon d={d.tone === 'good' ? I.ok : I.alert} size={40} /></span>
      <div><h3>{entry.status || '—'} · {d.title}</h3><p>{d.text}</p></div>
      {entry.status === 403 && entry.body?.decision === 'denied' && <span className="chip bad">APP-LEVEL BLOCK</span>}
    </div>
    <div className="details"><div className="cardHead"><b>Response details</b><span className="mono muted">{time(entry.at)}</span></div>
      <pre tabIndex={0}>{JSON.stringify(entry.body, null, 2)}</pre></div>
    {entry.status === 403 && entry.body?.decision === 'denied' && <p className="scope"><Icon d={I.info} /><span><b>This applies to the demo application only.</b> The request was blocked by a temporary rule an analyst approved on the M5. Your internet and other systems are not affected.</span></p>}
  </section>
}

createRoot(document.getElementById('root')).render(<Neo />)
