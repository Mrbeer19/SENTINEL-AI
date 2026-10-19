import React from 'react'

const paths = {
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
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
}

export function Icon({ name, size = 18, className = '' }) {
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

export const pad = (n) => String(n).padStart(4, '0')
export const incId = (id) => `INC-${pad(id)}`
export const propId = (id) => `PROP-${pad(id)}`
export const ruleId = (id) => `RULE-${pad(id)}`

export const kindLabel = {
  HTTP_AUTH_BRUTE_FORCE: 'HTTP Brute Force',
  SSH_BRUTE_FORCE: 'SSH Brute Force (log replay)',
  PORT_SCAN: 'Port Scan',
}
export const kindName = (kind) => kindLabel[kind] || kind

export const kindEvidence = (incident) => incident.kind === 'PORT_SCAN' ? `${incident.event_count} distinct ports` : `${incident.event_count} failed ${incident.kind === 'SSH_BRUTE_FORCE' ? 'replayed logins' : 'logins'}`

// Incident status from the backend: detected → awaiting_approval → blocked → verified, or rejected.
export const incidentStatus = {
  detected: { label: 'Needs analysis', tone: 'info' },
  awaiting_approval: { label: 'Pending approval', tone: 'warn' },
  blocked: { label: 'Approved · not verified', tone: 'warn' },
  verified: { label: 'Verified blocked', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'muted' },
}

export function Badge({ tone = 'muted', children, icon }) {
  return <span className={`badge ${tone}`}>{icon && <Icon name={icon} size={14} />}{children}</span>
}

export function StatusBadge({ status }) {
  const s = incidentStatus[status] || { label: status || '—', tone: 'muted' }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function SeverityBadge({ value }) {
  const v = String(value || '').toLowerCase()
  return <span className={`sev ${v === 'high' ? 'bad' : v === 'medium' ? 'warn' : 'muted'}`}>{v ? v.toUpperCase() : '—'}</span>
}

export const proposalTone = { pending: 'warn', approved: 'good', rejected: 'bad' }

export function Panel({ title, icon, actions, children, className = '', id }) {
  return <section className={`panel ${className}`} aria-labelledby={id}>
    {title && <header className="panelHead"><h2 id={id}>{icon && <Icon name={icon} />}{title}</h2>{actions && <div className="panelActions">{actions}</div>}</header>}
    {children}
  </section>
}

export function Stat({ icon, tone = 'mint', label, value, note, series }) {
  return <div className={`stat tone-${tone}`}>
    <span className="statIcon"><Icon name={icon} size={22} /></span>
    <div className="statBody"><span className="statLabel">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>
    {series && <Spark values={series} />}
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
  return <div className="empty"><Icon name={icon} size={20} /><span>{children}</span></div>
}

export function Banner({ tone = 'info', icon = 'info', children, action }) {
  return <div className={`banner ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}><Icon name={icon} /><div>{children}</div>{action}</div>
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
export const remaining = (rule, now = Date.now()) => {
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

export function parseAnalysis(value) {
  if (!value) return null
  try { return { json: JSON.parse(value) } } catch { return { text: value } }
}

export const parseJson = (value) => { try { return JSON.parse(value) } catch { return value } }

export const modeLabel = { ollama: 'Local model', ollama_no_tools: 'Local model · no tools', rule_fallback: 'Rule fallback (not AI)' }

export function ModeBadge({ mode }) {
  if (!mode) return <Badge tone="muted">Not analyzed</Badge>
  return <Badge tone={mode === 'rule_fallback' ? 'warn' : 'good'}>Analysis mode: {modeLabel[mode] || mode}</Badge>
}

export function useNow(interval = 1000) {
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(t) }, [interval])
  return now
}

export const go = (page, id) => { location.hash = id ? `/${page}/${id}` : `/${page}` }
