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
import { ThemeToggle } from './components/Appearance.jsx'

const NAV = [
  { key: 'overview', label: 'ภาพรวมระบบ', icon: 'home' },
  { key: 'incidents', label: 'เหตุการณ์', icon: 'alert' },
  { key: 'trace', label: 'การวิเคราะห์', icon: 'trace' },
  { key: 'approvals', label: 'รออนุมัติ', icon: 'check' },
  { key: 'rules', label: 'จัดการบล็อก', icon: 'rules' },
  { key: 'reports', label: 'รายงาน', icon: 'reports' },
]

const PAGES = {
  overview: ['Security overview', 'ภาพรวมสถานการณ์ความปลอดภัยไซเบอร์'],
  incidents: ['เหตุการณ์ความปลอดภัย', 'ตรวจพบและติดตามเหตุการณ์ด้านความปลอดภัยของระบบ'],
  incident: ['Incident Detail', 'ตรวจหลักฐาน ผลวิเคราะห์ และผลการทดสอบของเหตุการณ์นี้'],
  trace: ['การวิเคราะห์ของ AI', 'ติดตามหลักฐาน ลำดับการวิเคราะห์ และแนวทางตอบสนอง'],
  approvals: ['ตรวจคำแนะนำและอนุมัติ', 'AI เสนอคำแนะนำ · คุณเป็นผู้ตัดสินใจ'],
  rules: ['กฎป้องกันเว็บไซต์', 'จัดการ IP ต้นทางที่ถูกบล็อก และตรวจสอบผลคำขอใหม่'],
  reports: ['รายงานการตรวจสอบ', 'หลักฐาน ผลวิเคราะห์ และบันทึกการตัดสินใจในที่เดียว'],
}

function parseHash() {
  const [page = 'overview', id] = location.hash.replace(/^#\/?/, '').split('/')
  return { page: PAGES[page] ? page : 'overview', id: /^\d+$/.test(id || '') && Number(id) > 0 ? Number(id) : null }
}


export default function App({ adminUsername, onLogout, theme, onToggleTheme }) {
  const [route, setRoute] = useState(parseHash)
  const [searchTerm, setSearchTerm] = useState('')
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

  const ctx = { ...live, act, busy, route, setFlash, searchTerm, adminUsername, theme }
  const { data, connected, error, loading, updatedAt, refreshing } = live
  const pending = data.proposals.filter(p => p.status === 'pending').length
  const active = route.page === 'incident' ? 'incidents' : route.page
  const [title, subtitle] = PAGES[route.page]

  return <div className={`shell route-${route.page}`}>
    <a className="skip" href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus() }}>ข้ามไปยังเนื้อหา</a>
    <aside className="sidebar">
      <a className="brand sentinelBrand" href="#/overview" aria-label="SENTINEL AI overview"><img src={theme === 'light' ? '/assets/sentinel-orbit-logo-light.svg' : '/assets/sentinel-orbit-logo.svg'} alt="SENTINEL AI · Security Operations"/></a>
      <div className="navLabel">WORKSPACE</div>
      <nav aria-label="Main">
        {NAV.map(item => <a key={item.key} href={`#/${item.key}`} className={active === item.key ? 'active' : ''} aria-current={active === item.key ? 'page' : undefined}>
          <Icon name={item.icon} size={20} /><span>{item.label}</span>{item.key === 'approvals' && pending > 0 && <em className="count" aria-label={`${pending} pending`}>{pending}</em>}
        </a>)}
      </nav>
      <div className="sideFoot">
        {route.page !== 'overview' && <div className="sidebarArtwork" aria-hidden="true"><span className="artworkStripes"/><img src="/assets/sentinel-laptop.png" alt=""/><span className="sidebarCaption">SENTINEL / SECURITY OPERATIONS</span></div>}
        <div className="sessionCard"><span className={`sessionSignal ${connected && !error ? 'online' : ''}`}><i className="dot" />{error ? 'Server unavailable' : connected ? 'System connected' : 'Reconnecting'}</span><small>rod-mai-rod · live monitoring</small></div>
      </div>
    </aside>

    <main id="main" tabIndex={-1}>
      <div className="workspaceBar"><form className="globalSearch" onSubmit={e => { e.preventDefault(); location.hash='/overview'; setTimeout(() => document.querySelector('.sourcePanel')?.scrollIntoView({behavior:'smooth',block:'start'}),150) }}><Icon name="search" size={18}/><input aria-label="ค้นหา IP และเหตุการณ์" placeholder="ค้นหา IP ต้นทาง หรือเหตุการณ์..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/><button type="submit">ค้นหา <span>↵</span></button></form><ThemeToggle theme={theme} onToggle={onToggleTheme}/><a className="notificationLink" href="#/approvals" aria-label={`ข้อเสนอรออนุมัติ ${pending} รายการ`}><Icon name="alert" size={22}/>{pending > 0 && <span>{pending}</span>}</a><div className="headerAccount"><button className="headerLogout" onClick={onLogout} title="ออกจากระบบ" aria-label="ออกจากระบบบัญชีแอดมิน"><Icon name="logout" size={19}/></button><span>{(adminUsername || 'AD').slice(0,2).toUpperCase()}</span><div><b>{adminUsername || 'admin'}</b><small>ผู้ดูแลระบบ</small></div></div></div>
      <header className={`topbar ${route.page === 'overview' ? 'overviewTopbar' : ''}`}>
        <div className="pageTitleGroup"><div><div className="eyebrow">SECURITY OPERATIONS / {String(NAV.findIndex(n=>n.key===active)+1).padStart(2,'0')}</div><h1><Icon name={NAV.find(item=>item.key===active)?.icon || 'shield'} size={34}/>{title}</h1><p>{subtitle}</p></div></div>
        <div className="pageMeta"><span className={connected && !error ? 'mint' : 'amber'}><i className={`dot ${connected && !error ? 'mint' : 'amber'}`}/>{error ? 'การเชื่อมต่อขัดข้อง' : connected ? 'เชื่อมต่อระบบแล้ว' : 'กำลังเชื่อมต่อ'}</span><small>อัปเดต {updatedAt ? fmtTime(updatedAt) : '—'}</small><button className="btn ghost sm" onClick={()=>live.refresh()} disabled={refreshing} aria-label="รีเฟรชข้อมูล"><Icon name="refresh" size={16}/>{refreshing ? 'กำลังโหลด…' : 'รีเฟรช'}</button></div>
        <details className="runtimeStatus"><summary>สถานะระบบ <i className={`dot ${data.health?.model_ready ? 'mint':'amber'}`}/></summary><div><span>Backend · {error ? 'Offline' : 'Online'}</span><span>Model · {data.health?.model || '—'}</span><span>{data.health?.model_ready ? 'พร้อมวิเคราะห์' : 'โมเดลยังไม่พร้อม'}</span></div></details>
      </header>

      {error && <Banner tone="bad" icon="x" action={<button className="btn ghost sm" onClick={live.refresh} disabled={refreshing}>ลองเชื่อมต่อใหม่</button>}>เชื่อมต่อ M5 ไม่ได้ · ตรวจว่าเซิร์ฟเวอร์เปิดอยู่{updatedAt && ' ข้อมูลที่แสดงเป็นข้อมูลเดิม'}</Banner>}
      {!error && !connected && !loading && <Banner tone="warn" icon="pulse">WebSocket หลุด กำลังเชื่อมใหม่ ข้อมูลจะรีเฟรชทุก 15 วินาทีระหว่างนี้</Banner>}
      {data.health && !data.health.model_ready && <Banner tone="warn" icon="brain">ไม่พบโมเดล {data.health.model} ใน Ollama — การวิเคราะห์จะเป็น <b>rule fallback</b> และจะไม่แสดงเป็นผล AI</Banner>}


      {loading ? <Loading /> : !data.health ? <div className="empty">ยังโหลดข้อมูลไม่ได้ · เมื่อต่อกับ M5 สำเร็จ ข้อมูลจะแสดงที่นี่</div> : <Page route={route} ctx={ctx} />}
      <WorkflowGuide />
      <footer className="workspaceFooter"><span><Icon name="shield" size={13} />SENTINEL AI <span className="footerDivider">/</span> Local operations</span><span>Human-approved response<span className="footerDot">·</span>App-level protection</span></footer>
      {(busy || flash) && <div className="feedbackToast">{busy ? <Banner icon="clock"><span className="spinner" aria-hidden="true" />{actionLabel}</Banner> : <Banner tone={flash.tone} icon={flash.tone === 'good' ? 'ok' : 'x'} action={<button className="btn ghost sm" onClick={() => setFlash(null)} aria-label="ปิดการแจ้งเตือน"><Icon name="x" size={16}/></button>}>{flash.text}{flash.detail && <details><summary>ดูรายละเอียดข้อผิดพลาด</summary><p className="mono small">{flash.detail}</p></details>}</Banner>}</div>}
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
