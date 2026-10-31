import React from 'react'
import { useReport } from '../api.js'
import AgentFlow3D from '../components/AgentFlow3D.jsx'
import { Badge, Banner, Code, Empty, Icon, Loading, ModeBadge, RuleOnlyNotice, actionLabel, fmtTime, formatEventPaths, go, incId, isFallback, isRuleOnly, kindName, noProposalNote, parseAnalysis, parseJson, propId, targetIp, durationText, UNTIL_UNBLOCKED } from '../ui.jsx'
import { EventEvidenceTable, thresholdEvent } from './IncidentDetail.jsx'

// Trace rows follow OpenTelemetry GenAI names (contract v0.2): invoke_agent > chat / execute_tool.
const statusTone = { ok: 'good', error: 'bad', rejected_by_policy: 'bad', invalid_output: 'warn', fallback: 'warn' }
const statusText = { ok: 'ok', error: 'error', rejected_by_policy: 'Rejected by policy', invalid_output: 'Invalid output', fallback: 'Fallback' }
const ms = (v) => v == null ? '' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`

// Three agents (LangGraph). The planner never sees log text, only fixed fields.
const AGENTS = [
  { key: 'investigation', no: '01', title: 'Investigator', th: 'สืบค้นหลักฐาน', note: 'เครื่องมืออ่านอย่างเดียว 4 ตัว', icon: 'search' },
  { key: 'threat_analysis', no: '02', title: 'Threat Analyst', th: 'วิเคราะห์ภัย', note: 'ไม่ใช้เครื่องมือ · จัดประเภทหลักฐาน', icon: 'brain' },
  { key: 'defense_planning', no: '03', title: 'Defense Planner', th: 'วางแผนป้องกัน', note: 'เห็นเฉพาะฟิลด์ที่กำหนด ไม่เห็น log', icon: 'shield' },
]
const isBad = (t) => t.status && !['ok', 'fallback'].includes(t.status)

export default function AgentTrace({ ctx, id }) {
  const incidents = ctx.data.incidents
  const live = incidents.find(i => i.status === 'analyzing')
  const current = id || live?.id || incidents[0]?.id
  const { report, error, loading } = useReport(current, ctx.version)

  if (!incidents.length) return <Empty>ยังไม่มี incident ให้ดูการวิเคราะห์</Empty>
  if (loading && !report) return <Loading />
  if (!report || report.id !== current) return <Banner tone="bad" icon="x" action={<a className="btn ghost sm" href="#/incidents">กลับไปรายการเหตุการณ์</a>}>{error || 'โหลดรายละเอียดไม่สำเร็จ กรุณาลองใหม่'}</Banner>

  const analysis = parseAnalysis(report.analysis)
  const p = report.proposal
  const fallback = isFallback(report)
  const ruleOnly = isRuleOnly(report.kind)
  const trace = report.trace || []
  const tools = trace.filter(t => (t.operation || 'execute_tool') === 'execute_tool')
  const blockedByPolicy = trace.filter(t => t.status === 'rejected_by_policy')
  const analyzing = report.status === 'analyzing'
  const last = trace[trace.length - 1]
  const totalMs = trace.filter(t => t.operation === 'invoke_agent').reduce((s, t) => s + (t.duration_ms || 0), 0)
  const analyze = () => ctx.act(`/api/incidents/${current}/analyze`, { ok: (r) => `วิเคราะห์เสร็จ · โหมด ${r.analysis_mode}` })

  return <div className="aiFlow">
    <header className="aiFlowBar">
      <div className="aiFlowPicker" role="tablist" aria-label="เลือกเหตุการณ์">
        {incidents.slice(0, 8).map(i => <a key={i.id} role="tab" aria-selected={i.id === current} className={`aiChip ${i.id === current ? 'on' : ''} ${i.status === 'analyzing' ? 'live' : ''}`} href={`#/trace/${i.id}`}>
          <b>{incId(i.id)}</b><span>{kindName(i.kind)}</span><small className="mono">{i.source_ip}</small>
        </a>)}
        {incidents.length > 8 && <label className="aiChip more"><span className="sr">เหตุการณ์อื่น</span>
          <select value={current} onChange={e => go('trace', e.target.value)}>{incidents.map(i => <option key={i.id} value={i.id}>{incId(i.id)} · {kindName(i.kind)} · {i.source_ip}</option>)}</select>
        </label>}
      </div>
      <div className="aiFlowMeta">
        <span className={`aiPulse ${analyzing ? 'on' : ''}`}>{analyzing ? 'LIVE · กำลังวิเคราะห์' : report.analysis ? 'วิเคราะห์เสร็จแล้ว' : 'ยังไม่วิเคราะห์'}</span>
        <ModeBadge mode={report.analysis_mode} kind={report.kind} />
        {!ruleOnly && <small>Model <b className="mono">{ctx.data.health?.model || '—'}</b>{totalMs > 0 && <> · รวม <b>{ms(totalMs)}</b></>}</small>}
      </div>
    </header>

    {fallback && <Banner tone="warn" icon="info">โมเดลใช้ไม่ได้หรือผลไม่ผ่าน validation รอบนี้จึงเป็น <b>rule fallback</b> ไม่ใช่ผลวิเคราะห์ของ AI</Banner>}
    <RuleOnlyNotice kind={report.kind} />
    {blockedByPolicy.length > 0 && <Banner tone="bad" icon="shield"><b>Policy ปฏิเสธคำขอของโมเดล {blockedByPolicy.length} ครั้ง</b> · backend ไม่ทำตาม</Banner>}

    {ruleOnly ? <section className="aiCard"><header><h2>หลักฐาน HTTP Request</h2></header><EventEvidenceTable events={(report.events || []).filter(e => e.event_type === 'HTTP_REQUEST')} thresholdId={thresholdEvent(report.events || [], report.kind)?.id} /></section> : <AgentFlow3D key={report.id} report={report} stale={!!ctx.error || !!error} />}

    {analyzing && last && <p className="aiTicker" role="status"><span className="aiDot" />ล่าสุด {fmtTime(last.created_at)} · <b>{AGENTS.find(a => a.key === last.agent)?.title || last.agent}</b> · {last.operation === 'chat' ? 'เรียกโมเดล' : last.operation === 'invoke_agent' ? 'จบขั้นตอน' : `ใช้ ${last.tool}`} ({ms(last.duration_ms)})</p>}

    <section className="aiBottom">
      <article className="aiCard aiResult">
        <header><h2><Icon name="brain" size={18} artwork={false} />{ruleOnly ? 'ผลตรวจด้วยกฎเฉพาะทาง' : 'ผลการวิเคราะห์ของ AI'}</h2><CopyButton text={report.analysis ? JSON.stringify(report.analysis, null, 2) : ''} /></header>
        {analysis?.json ? <div className="aiResultBody">
          <div className="aiVerdict">
            <span className={`aiSeverity ${String(analysis.json.severity || '').toLowerCase()}`}>{analysis.json.severity || '—'}</span>
            <div><h3>{kindName(analysis.json.threat_type || report.kind)}</h3><p>{analysis.json.explanation_th}</p></div>
            {analysis.json.confidence != null && <div className="aiConfidence" style={{ '--c': `${Math.round(analysis.json.confidence * 100)}%` }}><b>{Math.round(analysis.json.confidence * 100)}%</b><small>ความมั่นใจ</small></div>}
          </div>
          <ol className="aiEvidence">{analysis.json.evidence.map((e, i) => <li key={i}><span>{i + 1}</span>{e}</li>)}</ol>
          <details className="analysisJson"><summary>ดูผลวิเคราะห์ JSON</summary><Code label="Analysis JSON">{JSON.stringify(analysis.json, null, 2)}</Code></details>
        </div> : analysis?.text ? <p className="analysisText">{analysis.text}</p>
          : <div className="aiWaiting">{analyzing ? <p className="aiThinking">{ruleOnly ? 'กำลังตรวจด้วยกฎเฉพาะทาง' : 'AI กำลังวิเคราะห์หลักฐาน'}<span>.</span><span>.</span><span>.</span></p> : report.status === 'closed' ? <p className="muted">ปิดเหตุการณ์ก่อนวิเคราะห์ · วิเคราะห์ไม่ได้</p>
            : <button className="btn primary" disabled={ctx.busy || !!ctx.error} onClick={analyze}>{ctx.busy ? 'กำลังเริ่ม…' : ruleOnly ? 'ตรวจด้วยกฎเฉพาะทาง' : 'เริ่มวิเคราะห์'}</button>}</div>}
      </article>


    </section>

    <details className="aiTools">
      <summary><Icon name="terminal" size={16} artwork={false} />ดู input / output ของเครื่องมือ ({tools.length})</summary>
      <div className="aiToolsRow">{tools.length ? tools.map(t => <ToolCall key={t.id} t={t} />) : <Empty>ยังไม่มีการเรียกเครื่องมือ</Empty>}</div>
    </details>
  </div>
}

// Log records: the evidence columns first; the source IP is the same on every row, so it goes last.
const LOG_ORDER = ['t', 'timestamp', 'type', 'event_type', 'outcome', 'request_count', 'not_found', 'scan_paths', 'paths', 'user', 'port', 'src']
const colText = { t: 'Time', timestamp: 'Time', type: 'Type', event_type: 'Type', outcome: 'Outcome', request_count: 'Requests', not_found: '404', scan_paths: 'Scan paths', paths: 'Paths', user: 'Username', port: 'Port', src: 'Source' }
// Columns whose value is the same on every row (source IP, often the event type) move to the header line.
const constantOf = (rows) => Object.fromEntries(['src', 'type'].filter(k => rows.length > 1 && rows.every(r => r[k] === rows[0][k])).map(k => [k, rows[0][k]]))
const columnsOf = (rows) => {
  const fixed = constantOf(rows)
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => !(k in fixed))
  return [...LOG_ORDER.filter(k => keys.includes(k)), ...keys.filter(k => !LOG_ORDER.includes(k))]
}
// Every time on the page is shown in the browser's local zone, including UTC timestamps inside tool output.
const isTime = (k) => k === 't' || k.endsWith('timestamp') || k.endsWith('_at') || k.endsWith('_seen')
const cell = (k, v) => v == null ? '—' : k === 'paths' ? formatEventPaths(v) : isTime(k) ? fmtTime(v) : String(v)
const localTimes = (v) => Array.isArray(v) ? v.map(localTimes) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, isTime(k) && typeof x === 'string' ? new Date(x).toLocaleString('en-GB', { hour12: false }) : localTimes(x)])) : v

export function ToolCall({ t }) {
  const input = parseJson(t.input)
  const raw = parseJson(t.output)
  // get_incident_logs wraps records as untrusted data; show them as a table.
  const output = Array.isArray(raw?.untrusted_log_records) ? raw.untrusted_log_records : raw
  const status = t.status || 'ok'
  return <article className="aiCard aiTool">
    <header><h3 className="mono">{t.tool}</h3>{t.tool === 'propose_block_ip' ? <Badge tone="warn">Proposal pre-check</Badge> : <Badge tone="info">Read only</Badge>}{status !== 'ok' && <Badge tone={statusTone[status] || 'warn'}>{statusText[status] || status}</Badge>}{t.source === 'fallback' && <Badge tone="warn">fallback</Badge>}<small className="muted">{fmtTime(t.created_at)}{t.duration_ms != null && ` · ${ms(t.duration_ms)}`}</small></header>
    <h4 className="sub">Input</h4>
    <Code>{JSON.stringify(input, null, 2)}</Code>
    <h4 className="sub">Output {Array.isArray(output) && <small>· {output.length} record{output.length === 1 ? '' : 's'}{output !== raw && ' · untrusted log data'}{Object.entries(constantOf(output)).map(([k, v]) => ` · ${colText[k] || k} ${v}`)}</small>}</h4>
    {Array.isArray(output) ? (output.length ? <div className="tableWrap short logTable"><table>
      <thead><tr>{columnsOf(output).map(k => <th key={k}>{colText[k] || k}</th>)}</tr></thead>
      <tbody>{output.slice(0, 40).map((row, i) => <tr key={i}>{columnsOf(output).map(k => <td key={k} className={k === 'user' ? 'userCell' : 'mono'} style={k === 'paths' ? { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } : undefined}>{cell(k, row[k])}</td>)}</tr>)}</tbody>
    </table></div> : <Empty>Empty result</Empty>) : <Code>{JSON.stringify(localTimes(output), null, 2)}</Code>}
  </article>
}

function CopyButton({ text }) {
  const [done, setDone] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  if (!text || !navigator.clipboard) return null
  return <><button className="btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setFailed(false); setDone(true); setTimeout(() => setDone(false), 1500) } catch { setFailed(true) } }}>{done ? 'คัดลอกแล้ว' : 'คัดลอก'}</button>{failed && <span role="status" className="coral small">คัดลอกไม่ได้ · เลือกข้อความแล้วคัดลอกเองได้</span>}</>
}
