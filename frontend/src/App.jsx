import React, { useCallback, useEffect, useRef, useState } from 'react'
import { request, useLiveData } from './api.js'
import { Banner, Icon, Loading, fmtTime } from './ui.jsx'
import Overview from './pages/Overview.jsx'
import Incidents from './pages/Incidents.jsx'
import IncidentDetail from './pages/IncidentDetail.jsx'
import AgentTrace from './pages/AgentTrace.jsx'
import Approvals from './pages/Approvals.jsx'
import Rules from './pages/Rules.jsx'
import Reports from './pages/Reports.jsx'
import { WorkflowGuide } from './components/WorkflowGuide.jsx'

const NAV = [
  { key: 'overview', label: 'ภาพรวมระบบ', icon: 'home' },
  { key: 'incidents', label: 'เหตุการณ์', icon: 'alert' },
  { key: 'trace', label: 'การวิเคราะห์', icon: 'trace' },
  { key: 'approvals', label: 'รออนุมัติ', icon: 'check' },
  { key: 'rules', label: 'จัดการบล็อก', icon: 'rules' },
  { key: 'reports', label: 'รายงาน', icon: 'reports' },
]

const PAGES = {
  overview: ['Security Operations Center', 'ภาพรวมเหตุการณ์ สถานะการป้องกัน และงานที่ต้องทำต่อ'],
  incidents: ['Incident Queue', 'เลือกเหตุการณ์ → ตรวจหลักฐาน → เริ่มวิเคราะห์'],
  incident: ['Incident Detail', 'ตรวจหลักฐาน ผลวิเคราะห์ และผลการทดสอบของเหตุการณ์นี้'],
  trace: ['Agent Investigation', 'ดูว่า agent อ่านหลักฐานอะไร และสรุปผลอย่างไร'],
  approvals: ['Response Approvals', 'ตรวจ IP และระยะเวลา ก่อนยืนยันการบล็อกระดับแอป'],
  rules: ['App Firewall Rules', 'ดูกฎที่ทำงาน เวลาคงเหลือ และคำขอที่ถูกบล็อก'],
  reports: ['Incident Reports', 'สรุปหลักฐาน การตัดสินใจ และผลทดสอบ เพื่อส่งต่อให้ทีม'],
}

function parseHash() {
  const [page = 'overview', id] = location.hash.replace(/^#\/?/, '').split('/')
  return { page: PAGES[page] ? page : 'overview', id: /^\d+$/.test(id || '') && Number(id) > 0 ? Number(id) : null }
}


export default function App() {
  const [route, setRoute] = useState(parseHash)
  const live = useLiveData()
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null)
  const actionLock = useRef(false)
  const [actionLabel, setActionLabel] = useState('')

  useEffect(() => {
    const onHash = () => { setRoute(parseHash()); setFlash(null) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => { document.getElementById('main')?.focus({ preventScroll: true }) }, [route.page, route.id])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [route.page])

  // Every write goes through here so buttons disable while a request is in flight.
  const act = useCallback(async (path, { method = 'POST', body = {}, accept, ok } = {}) => {
    if (actionLock.current) return null
    actionLock.current = true
    setActionLabel(path.endsWith('/analyze') ? 'กำลังวิเคราะห์หลักฐานบน M5… อาจใช้เวลาสักครู่' : 'กำลังบันทึกการดำเนินการบน M5…')
    setBusy(true); setFlash(null)
    try {
      const result = await request(path, { method, body: method === 'DELETE' ? undefined : body, accept })
      if (ok) setFlash({ tone: 'good', text: typeof ok === 'function' ? ok(result.data, result.status) : ok })
      await live.refresh(true)
      return result
    } catch (err) {
      const text = err.status === 403 ? 'ไม่มีสิทธิ์ดำเนินการ กรุณาเปิดหน้าผู้ดูแลจากเครื่อง M5 (localhost)' : err.status === 409 ? 'รายการนี้เปลี่ยนไปแล้ว กำลังโหลดข้อมูลล่าสุดให้ตรวจทานอีกครั้ง' : err.status === 400 || err.status === 422 ? 'ข้อมูลไม่ผ่านการตรวจสอบ กรุณาตรวจ IP และค่าที่กรอกอีกครั้ง' : err.status === 404 ? 'ไม่พบรายการนี้ ลองรีเฟรชข้อมูลแล้วเลือกรายการใหม่' : err.status ? 'บันทึกไม่สำเร็จ ตรวจการทำงานของ M5 แล้วลองอีกครั้ง' : 'เชื่อมต่อ M5 ไม่ได้ ตรวจว่าเซิร์ฟเวอร์ยังเปิดอยู่ แล้วลองอีกครั้ง'
      setFlash({ tone: 'bad', text, detail: `${err.status ? `HTTP ${err.status}: ` : ''}${err.message}` })
      if (err.status === 409) await live.refresh(true)
      return null
    } finally { actionLock.current = false; setBusy(false) }
  }, [live.refresh])

  const ctx = { ...live, act, busy, route, setFlash }
  const { data, connected, error, loading, updatedAt, refreshing } = live
  const pending = data.proposals.filter(p => p.status === 'pending').length
  const active = route.page === 'incident' ? 'incidents' : route.page
  const [title, subtitle] = PAGES[route.page]

  return <div className="shell">
    <a className="skip" href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus() }}>ข้ามไปยังเนื้อหา</a>
    <aside className="sidebar">
      <a className="brand" href="#/overview" aria-label="SENTINEL AI overview"><span className="brandSymbol"><Icon name="shield" size={28} /></span><span>SENTINEL <b>AI</b><small>SECURITY OPERATIONS</small></span></a>
      <div className="navLabel">/ CONTROL CENTER</div>
      <nav aria-label="Main">
        {NAV.map(item => <a key={item.key} href={`#/${item.key}`} className={active === item.key ? 'active' : ''} aria-current={active === item.key ? 'page' : undefined}>
          <Icon name={item.icon} size={20} /><span>{item.label}</span>{item.key === 'approvals' && pending > 0 && <em className="count" aria-label={`${pending} pending`}>{pending}</em>}
        </a>)}
      </nav>
      <div className="sideFoot">
        <div className="sessionCard"><span className={`sessionSignal ${connected && !error ? 'online' : ''}`}><i className="dot" />{error ? 'Server unavailable' : connected ? 'System connected' : 'Reconnecting'}</span><small>rod-mai-rod · live monitoring</small></div>
        <div className="operator"><span className="operatorAvatar"><Icon name="user" size={20} /></span><span>SOC operator<small>Local M5 workspace</small></span><Icon name="chevron" size={14} /></div>
      </div>
    </aside>

    <main id="main" tabIndex={-1}>
      <div className="workspaceBar"><div className="workspaceCrumb"><Icon name="shield" size={15} /><span>Workspace</span><span className="crumbSlash">/</span><b>{NAV.find(item => item.key === active)?.label || 'Overview'}</b></div><div className="workspaceActions"><span className="lastUpdated">{updatedAt ? <>Updated <time dateTime={updatedAt}>{fmtTime(updatedAt)}</time></> : 'Waiting for server'}</span><button className={`refreshButton ${refreshing ? 'refreshing' : ''}`} onClick={live.refresh} disabled={refreshing} aria-label="Refresh live data" title="Refresh live data"><Icon name="refresh" size={16} /></button></div></div>
      <header className={`topbar ${route.page === 'overview' ? 'overviewTopbar' : ''}`}>
        <div><div className="eyebrow"><i className="dot mint" />LOCAL SECURITY WORKSPACE</div><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="topStatus">
          <span className={`chip ${connected && !error ? 'good' : 'bad'}`}><i className="dot" />M5 Server · {error ? 'Offline' : connected ? 'Online' : 'Reconnecting'}</span>
          <span className={`chip ${data.health?.model_ready ? 'good' : 'warn'}`}><i className="dot" />{data.health ? (data.health.model_ready ? data.health.model : 'Model unavailable') : 'Model —'}</span>
          <span className="chip outline">{connected && !error && <span className="livePulse" />}{error ? (data.health ? 'SAVED DATA' : 'NO DATA') : connected ? 'LIVE DATA' : 'REFRESH · 15s'}</span>
        </div>
      </header>

      {error && <Banner tone="bad" icon="x" action={<button className="btn ghost sm" onClick={live.refresh} disabled={refreshing}>ลองเชื่อมต่อใหม่</button>}>เชื่อมต่อ M5 ไม่ได้ · ตรวจว่าเซิร์ฟเวอร์เปิดอยู่{updatedAt && ' ข้อมูลที่แสดงเป็นข้อมูลเดิม'}</Banner>}
      {!error && !connected && !loading && <Banner tone="warn" icon="pulse">WebSocket หลุด กำลังเชื่อมใหม่ ข้อมูลจะรีเฟรชทุก 15 วินาทีระหว่างนี้</Banner>}
      {data.health && !data.health.model_ready && <Banner tone="warn" icon="brain">ไม่พบโมเดล {data.health.model} ใน Ollama — การวิเคราะห์จะเป็น <b>rule fallback</b> และจะไม่แสดงเป็นผล AI</Banner>}
      <WorkflowGuide />

      {loading ? <Loading /> : !data.health ? <div className="empty">ยังโหลดข้อมูลไม่ได้ · เมื่อต่อกับ M5 สำเร็จ ข้อมูลจะแสดงที่นี่</div> : <Page route={route} ctx={ctx} />}
      <footer className="workspaceFooter"><span><Icon name="shield" size={13} />SENTINEL AI <span className="footerDivider">/</span> Local operations</span><span>Human-approved response<span className="footerDot">·</span>App-level protection</span></footer>
      {(busy || flash) && <div className="feedbackToast">{busy ? <Banner icon="clock"><span className="spinner" aria-hidden="true" />{actionLabel}</Banner> : <Banner tone={flash.tone} icon={flash.tone === 'good' ? 'ok' : 'x'} action={<button className="btn ghost sm" onClick={() => setFlash(null)} aria-label="ปิดการแจ้งเตือน">✕</button>}>{flash.text}{flash.detail && <details><summary>ดูรายละเอียดข้อผิดพลาด</summary><p className="mono small">{flash.detail}</p></details>}</Banner>}</div>}
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
    default: return <Overview ctx={ctx} />
  }
}
