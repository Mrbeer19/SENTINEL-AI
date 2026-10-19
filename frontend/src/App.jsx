import React, { useCallback, useEffect, useState } from 'react'
import { request, useLiveData } from './api.js'
import { Banner, Icon, Loading } from './ui.jsx'
import Overview from './pages/Overview.jsx'
import Incidents from './pages/Incidents.jsx'
import IncidentDetail from './pages/IncidentDetail.jsx'
import AgentTrace from './pages/AgentTrace.jsx'
import Approvals from './pages/Approvals.jsx'
import Rules from './pages/Rules.jsx'
import Reports from './pages/Reports.jsx'
import DemoLab from './pages/DemoLab.jsx'

const NAV = [
  { key: 'overview', label: 'Overview', icon: 'home' },
  { key: 'incidents', label: 'Incidents', icon: 'alert' },
  { key: 'trace', label: 'Agent Trace', icon: 'trace' },
  { key: 'approvals', label: 'Approvals', icon: 'check' },
  { key: 'rules', label: 'Rules', icon: 'rules' },
  { key: 'reports', label: 'Reports', icon: 'reports' },
]

const PAGES = {
  overview: ['Security Operations Center', 'Local threat monitoring & human-approved response'],
  incidents: ['Incident Queue', 'Review detected activity and open an investigation'],
  incident: ['Incident Detail', 'Evidence, recommendation and verification for one incident'],
  trace: ['Agent Investigation', 'Inspect tool calls, evidence and the final recommendation'],
  approvals: ['Response Approvals', 'Review proposed actions before any rule is applied'],
  rules: ['App Firewall Rules', 'Temporary application rules with expiry and verification'],
  reports: ['Incident Reports', 'Evidence, decisions and verified outcomes in one record'],
  lab: ['Controlled Demo Lab', 'Run bounded scenarios and inspect the complete response flow'],
}

function parseHash() {
  const [page = 'overview', id] = location.hash.replace(/^#\/?/, '').split('/')
  return { page: PAGES[page] ? page : 'overview', id: id ? Number(id) : null }
}


export default function App() {
  const [route, setRoute] = useState(parseHash)
  const live = useLiveData()
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null)

  useEffect(() => {
    const onHash = () => { setRoute(parseHash()); setFlash(null) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => { document.getElementById('main')?.focus({ preventScroll: true }) }, [route.page, route.id])

  // Every write goes through here so buttons disable while a request is in flight.
  const act = useCallback(async (path, { method = 'POST', body = {}, accept, ok } = {}) => {
    setBusy(true); setFlash(null)
    try {
      const result = await request(path, { method, body: method === 'DELETE' ? undefined : body, accept })
      if (ok) setFlash({ tone: 'good', text: typeof ok === 'function' ? ok(result.data, result.status) : ok })
      await live.refresh()
      return result
    } catch (err) {
      const hint = err.status === 403 && /X-Admin-Key/.test(err.message) ? ' — หน้าผู้ดูแลต้องเปิดจากเครื่อง M5 (localhost)' : err.status === 409 ? ' — มีคนตัดสินใจไปแล้ว ข้อมูลรีเฟรชแล้ว' : ''
      setFlash({ tone: 'bad', text: `${err.status ? `HTTP ${err.status}: ` : ''}${err.message}${hint}` })
      if (err.status === 409) live.refresh()
      return null
    } finally { setBusy(false) }
  }, [live.refresh])

  const ctx = { ...live, act, busy, route, setFlash }
  const { data, connected, error, loading } = live
  const pending = data.proposals.filter(p => p.status === 'pending').length
  const active = route.page === 'incident' ? 'incidents' : route.page
  const [title, subtitle] = PAGES[route.page]

  return <div className="shell">
    <a className="skip" href="#main">Skip to content</a>
    <aside className="sidebar">
      <div className="brand"><Icon name="shield" size={34} /><span>SENTINEL <b>AI</b></span></div>
      <nav aria-label="Main">
        {NAV.map(item => <a key={item.key} href={`#/${item.key}`} className={active === item.key ? 'active' : ''} aria-current={active === item.key ? 'page' : undefined}>
          <Icon name={item.icon} size={20} /><span>{item.label}</span>{item.key === 'approvals' && pending > 0 && <em className="count" aria-label={`${pending} pending`}>{pending}</em>}
        </a>)}
      </nav>
      <div className="sideFoot">
        <a href="#/lab" className={active === 'lab' ? 'active' : ''} aria-current={active === 'lab' ? 'page' : undefined}><Icon name="lab" size={20} /><span>Demo Lab</span></a>
        <a href="/neo/" target="_blank" rel="noreferrer"><Icon name="laptop" size={20} /><span>Neo Demo</span><Icon name="external" size={14} /></a>
        <div className="operator"><Icon name="user" size={20} /><span>SOC operator<small>local M5 session</small></span></div>
      </div>
    </aside>

    <main id="main" tabIndex={-1}>
      <header className="topbar">
        <div><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="topStatus">
          <span className={`chip ${connected ? 'good' : 'bad'}`}><i className="dot" />M5 Server · {connected ? 'Online' : error ? 'Offline' : 'Reconnecting'}</span>
          <span className={`chip ${data.health?.model_ready ? 'good' : 'warn'}`}><i className="dot" />{data.health ? (data.health.model_ready ? data.health.model : 'Model unavailable') : 'Model —'}</span>
          <span className="chip outline">LIVE DATA</span>
        </div>
      </header>

      {error && <Banner tone="bad" icon="x" action={<button className="btn ghost sm" onClick={live.refresh}>Retry</button>}>เชื่อม backend ไม่ได้: {error} — ข้อมูลที่เห็นอาจไม่ใช่ล่าสุด</Banner>}
      {!error && !connected && !loading && <Banner tone="warn" icon="pulse">WebSocket หลุด กำลังเชื่อมใหม่ ข้อมูลจะรีเฟรชทุก 15 วินาทีระหว่างนี้</Banner>}
      {data.health && !data.health.model_ready && <Banner tone="warn" icon="brain">ไม่พบโมเดล {data.health.model} ใน Ollama — การวิเคราะห์จะเป็น <b>rule fallback</b> และจะไม่แสดงเป็นผล AI</Banner>}
      {flash && <Banner tone={flash.tone} icon={flash.tone === 'good' ? 'ok' : 'x'} action={<button className="btn ghost sm" onClick={() => setFlash(null)} aria-label="Dismiss">✕</button>}>{flash.text}</Banner>}

      {loading ? <Loading /> : <Page route={route} ctx={ctx} />}
    </main>
  </div>
}

function Page({ route, ctx }) {
  switch (route.page) {
    case 'incidents': return <Incidents ctx={ctx} />
    case 'incident': return <IncidentDetail ctx={ctx} id={route.id} />
    case 'trace': return <AgentTrace ctx={ctx} id={route.id} />
    case 'approvals': return <Approvals ctx={ctx} id={route.id} />
    case 'rules': return <Rules ctx={ctx} id={route.id} />
    case 'reports': return <Reports ctx={ctx} id={route.id} />
    case 'lab': return <DemoLab ctx={ctx} />
    default: return <Overview ctx={ctx} />
  }
}
