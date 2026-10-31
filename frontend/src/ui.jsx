import React from 'react'

const paths = {
  search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM16 16l5 5',
  chevron: 'M9 5l7 7-7 7',
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  alert: 'M12 3l10 18H2L12 3zM12 10v5M12 18v.01',
  trace: 'M6 6a2 2 0 1 0 0 .01M18 12a2 2 0 1 0 0 .01M6 18a2 2 0 1 0 0 .01M8 7l8 4M8 17l8-4',
  check: 'M4 4h16v16H4zM8 12l3 3 5-6',
  rules: 'M6 3h9l4 4v14H6zM9 10h7M9 14h7M9 18h4',
  reports: 'M5 20V10M10 20V4M15 20v-7M20 20v-4',
  lab: 'M9 3h6M10 3v6l-5 10a1 1 0 0 0 1 2h12a1 1 0 0 0 1-2l-5-10V3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  pulse: 'M3 12h4l2-6 4 12 2-6h6',
  laptop: 'M5 5h14v10H5zM2 19h20',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7v.01M8 17v.01',
  terminal: 'M4 6l6 6-6 6M12 18h8',
  send: 'M3 11l18-8-8 18-2-8z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8v.01',
  x: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6',
  ok: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V4.5A3 3 0 0 0 9 4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1',
  refresh: 'M20 11a8 8 0 1 0-2 5M20 4v7h-7',
  back: 'M15 18l-6-6 6-6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  download: 'M12 4v11M7 10l5 5 5-5M4 20h16',
  play: 'M7 4l13 8-13 8z',
  pause: 'M8 5v14M16 5v14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  logout: 'M9 4H4v16h5M14 8l5 4-5 4M8 12h11',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  locate: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z',
}

// One icon atlas keeps the menu and section artwork in the same visual family.
// Compact controls/status glyphs remain vectors so they stay sharp at 14px.
const artworkIcons = ['home','alert','trace','check','rules','reports','shield','clock','pulse','laptop','server','terminal','user','brain','search','info']
const artworkColumns = [25,330,630,940]
const artworkRows = [50,340,630,915]

export function Icon({ name, size = 18, className = '', artwork = true }) {
  const index = artworkIcons.indexOf(name)
  if (artwork && size >= 17 && index !== -1) return <svg className={`icon imageIcon ${className}`} width={size} height={size} style={{width:size,height:size}} viewBox={`${artworkColumns[index % 4]} ${artworkRows[Math.floor(index / 4)]} 300 300`} fill="none" aria-hidden="true" focusable="false"><image href="/assets/sentinel-icon-atlas.png" x="0" y="0" width="1280" height="1280" /></svg>
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

export const pad = (n) => String(n).padStart(4, '0')
export const incId = (id) => `INC-${pad(id)}`
export const propId = (id) => `PROP-${pad(id)}`
export const ruleId = (id) => `RULE-${pad(id)}`

export const kindLabel = {
  HTTP_AUTH_BRUTE_FORCE: 'HTTP Brute Force',
  SSH_BRUTE_FORCE: 'SSH Brute Force',
  PORT_SCAN: 'Port Scan',
  SUSPICIOUS_LOGIN: 'Login after repeated failures',
  TRAFFIC_ANOMALY: 'Traffic Anomaly',
}
export const kindName = (kind) => kindLabel[kind] || kind

export const kindEvidence = (incident) => incident.kind === 'PORT_SCAN' ? `${incident.event_count} distinct ports` : incident.kind === 'SUSPICIOUS_LOGIN' ? `success after ${incident.event_count} failures` : incident.kind === 'TRAFFIC_ANOMALY' ? `${incident.event_count} connections` : `${incident.event_count} failed ${incident.kind === 'SSH_BRUTE_FORCE' ? 'replayed logins' : 'logins'}`

// Incident status (contract v0.2): detected → analyzing → awaiting_approval → blocked → verified,
// or analyzing → needs_review | monitoring | closed; awaiting_approval → rejected; blocked → closed.
export const incidentStatus = {
  detected: { label: 'Needs analysis', tone: 'info' },
  analyzing: { label: 'Analyzing', tone: 'info' },
  awaiting_approval: { label: 'Pending approval', tone: 'warn' },
  needs_review: { label: 'Needs human review', tone: 'warn' },
  monitoring: { label: 'Monitoring', tone: 'info' },
  blocked: { label: 'Approved · not verified', tone: 'warn' },
  verified: { label: 'Verified blocked', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'muted' },
  closed: { label: 'Closed', tone: 'muted' },
}
export const TERMINAL = ['verified', 'rejected', 'closed']
export const isOpenIncident = (incident) => !TERMINAL.includes(incident.status)
// Analysis finished without a block proposal (INVESTIGATE / MONITOR / NO_ACTION, or policy refused it).
export const noProposalNote = { needs_review: 'Needs human review', monitoring: 'Monitoring only', closed: 'No action needed' }

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

export const actionLabel = {
  NO_ACTION: 'No action', MONITOR: 'Monitor', INVESTIGATE: 'Investigate further',
  TEMP_BLOCK_IP: 'Temporary app-level block', BLOCK_IP: 'App-level block (1 hour)',
}
// Documentation ranges (RFC 5737) are what Demo Lab replays use; they never come from a real tester machine.
export const isReplayIp = (ip) => /^(192\.0\.2|198\.51\.100|203\.0\.113)\./.test(ip || '')

// v0.2 sends target_ip; source_ip stays as an alias until v0.3.
export const targetIp = (proposal) => proposal?.target_ip || proposal?.source_ip

export function Badge({ tone = 'muted', children, icon }) {
  return <span className={`badge ${tone}`}>{icon && <Icon name={icon} size={14} />}{children}</span>
}

export function StatusBadge({ status }) {
  const s = incidentStatus[status] || { label: status || '—', tone: 'muted' }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function SeverityBadge({ value }) {
  const v = String(value || '').toUpperCase()
  return <span className={`sev ${v === 'CRITICAL' || v === 'HIGH' ? 'bad' : v === 'MEDIUM' ? 'warn' : 'muted'}`}>{v || '—'}</span>
}

export const proposalTone = { pending: 'warn', approved: 'good', rejected: 'bad' }

export function Panel({ title, icon, actions, children, className = '', id }) {
  const generatedId = React.useId()
  const titleId = id || generatedId
  return <section className={`panel ${className}`} aria-labelledby={title ? titleId : undefined}>
    {title && <header className="panelHead"><h2 id={titleId}>{icon && <span className="panelIcon"><Icon name={icon} size={17} /></span>}<span className="panelTitle">{title}</span></h2>{actions && <div className="panelActions">{actions}</div>}</header>}
    {children}
  </section>
}

export function Stat({ icon, tone = 'mint', label, value, note, series }) {
  return <div className={`stat tone-${tone}`}>
    <span className="statIcon"><Icon name={icon} size={22} /></span>
    <div className="statBody"><span className="statLabel">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>
    {series && <Spark values={series} />}
    <i className="statGlow" aria-hidden="true" />
  </div>
}

export function Spark({ values }) {
  const max = Math.max(1, ...values)
  if (!values.some(Boolean)) return null
  return <svg className="spark" viewBox={`0 0 ${values.length * 4} 30`} preserveAspectRatio="none" aria-hidden="true">
    {values.map((v, i) => <rect key={i} x={i * 4} y={30 - (v / max) * 28} width="2.4" height={(v / max) * 28} rx="1" />)}
  </svg>
}

export function Empty({ children, icon = 'info' }) {
  return <div className="empty"><span className="emptyIcon"><Icon name={icon} size={20} /></span><span>{children}</span></div>
}

export function FilterSummary({ count, total, active, onClear }) {
  return <div className="filterSummary"><span role="status">แสดง <b>{count}</b> จาก {total} รายการ</span>{active && count > 0 && <button className="btn ghost sm" onClick={onClear}><Icon name="x" size={14} />ล้างตัวกรอง</button>}</div>
}

export function NoResults({ onClear }) {
  return <Empty icon="search"><b>ไม่พบรายการที่ตรงกับตัวกรอง</b><span className="emptyHint">ลองเปลี่ยนคำค้นหาหรือล้างตัวกรองเพื่อดูรายการทั้งหมด</span><button className="btn ghost" onClick={onClear}>ล้างตัวกรอง</button></Empty>
}

export function Banner({ tone = 'info', icon = 'info', children, action }) {
  return <div className={`banner ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}><Icon name={icon} /><div className="bannerContent">{children}</div>{action && <div className="bannerAction">{action}</div>}</div>
}

export function Loading({ label = 'กำลังโหลดข้อมูลจาก server…' }) {
  return <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{label}</div>
}

export function KeyVals({ items }) {
  return <dl className="keyvals">{items.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
}

export function Code({ children, label }) {
  return <pre className="code" aria-label={label} tabIndex={0}>{children}</pre>
}

export function Stepper({ steps }) {
  return <ol className="stepper">{steps.map((s) => <li key={s.label} className={s.state}>
    <span className="stepDot" aria-hidden="true">{s.state === 'done' ? <Icon name="ok" size={20} /> : s.state === 'current' ? <Icon name="clock" size={20} /> : s.state === 'stop' ? <Icon name="x" size={20} /> : '…'}</span>
    <b>{s.label}</b><small>{s.note}</small>
  </li>)}</ol>
}

// ---- time helpers (backend stores UTC ISO strings) ----
export const toDate = (value) => value ? new Date(value) : null
export const fmtTime = (value) => value ? new Date(value).toLocaleTimeString('en-GB', { hour12: false }) : '—'
export const fmtDateTime = (value) => value ? new Date(value).toLocaleString('en-GB', { hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
export const isActiveRule = (rule, now = Date.now()) => toDate(rule.expires_at) > now
// Blocks approved with duration 0 have no expiry (expires_at in year 9999); only an admin unblock ends them.
export const UNTIL_UNBLOCKED = 'จนกว่าแอดมินจะปลด'
export const isPermanentRule = (rule) => String(rule?.expires_at || '').startsWith('9999-')
export const durationText = (seconds, unit = 'นาที') => seconds ? `${seconds / 60} ${unit}` : UNTIL_UNBLOCKED
export const fmtExpiry = (rule) => isPermanentRule(rule) ? UNTIL_UNBLOCKED : fmtTime(rule.expires_at)
export const remaining = (rule, now = Date.now()) => {
  if (isPermanentRule(rule)) return UNTIL_UNBLOCKED
  const ms = Math.max(0, toDate(rule.expires_at) - now)
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
}

// Counts per minute over the last `minutes`, oldest first.
export function perMinute(items, field, minutes = 15, now = Date.now()) {
  const buckets = Array(minutes).fill(0)
  for (const item of items) {
    const age = Math.floor((now - toDate(item[field])) / 60000)
    if (age >= 0 && age < minutes) buckets[minutes - 1 - age] += 1
  }
  return buckets
}

// Analysis is an object in v0.2 (model and rule fallback alike). Older string JSON is mapped onto the same keys.
export function parseAnalysis(value) {
  if (!value) return null
  let a = value
  if (typeof value === 'string') {
    try { a = JSON.parse(value) } catch { return { text: value } }
  }
  if (!a || typeof a !== 'object') return { text: String(value) }
  return { json: {
    threat_type: a.threat_type ?? a.classification ?? 'UNKNOWN',
    severity: String(a.severity || '').toUpperCase(),
    confidence: typeof a.confidence === 'number' ? a.confidence : null,
    evidence: Array.isArray(a.evidence) ? a.evidence : [],
    recommended_action: a.recommended_action ?? a.recommendation ?? '',
    explanation_th: a.explanation_th ?? a.summary ?? '',
  } }
}

export const RULE_ONLY_KINDS = Object.freeze(['HTTP_FLOOD', 'WEB_SCAN', 'HONEYPOT'])
export const isRuleOnly = (kind) => RULE_ONLY_KINDS.includes(kind)

// Dedicated rule detections are intentional; fallback means a model could not supply the result.
export const isFallback = (incident) => !isRuleOnly(incident?.kind) && (incident?.analysis_mode === 'rule_fallback' || parseAnalysis(incident?.analysis)?.json?.confidence === null)

export function RuleOnlyNotice({ kind }) {
  return isRuleOnly(kind) ? <Banner tone="info" icon="shield">ภัยเว็บตรวจด้วยกฎเฉพาะทาง · ยังต้องให้แอดมินอนุมัติ</Banner> : null
}

export function formatEventPaths(value) {
  if (value == null || value === '') return '—'
  let paths = value
  if (typeof paths === 'string') {
    try { paths = JSON.parse(paths) } catch { return paths }
  }
  if (Array.isArray(paths)) return paths.map(path => typeof path === 'string' ? path : JSON.stringify(path)).join('\n') || '—'
  return typeof paths === 'string' ? paths : JSON.stringify(paths)
}

export const parseJson = (value) => { try { return JSON.parse(value) } catch { return value } }

export const modeLabel = { ollama: 'Local model', ollama_retry: 'Local model · retried', ollama_no_tools: 'Local model · no tools', rule_fallback: 'Rule fallback (not AI)' }

export function ModeBadge({ mode, kind }) {
  if (isRuleOnly(kind)) return <Badge tone="info">ตรวจด้วยกฎเฉพาะทาง</Badge>
  if (!mode) return <Badge tone="muted">Not analyzed</Badge>
  return <Badge tone={mode === 'rule_fallback' ? 'warn' : 'good'}>Analysis mode: {modeLabel[mode] || mode}</Badge>
}

export function useNow(interval = 1000) {
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(t) }, [interval])
  return now
}

export const go = (page, id) => { location.hash = id ? `/${page}/${id}` : `/${page}` }
