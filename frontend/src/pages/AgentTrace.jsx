import React from 'react'
import { useReport } from '../api.js'
import { Badge, Banner, Code, Empty, Icon, KeyVals, Loading, ModeBadge, Panel, actionLabel, fmtTime, go, incId, isFallback, kindName, noProposalNote, parseAnalysis, parseJson, propId, targetIp } from '../ui.jsx'

// Trace rows follow OpenTelemetry GenAI names (contract v0.2): invoke_agent > chat / execute_tool.
const statusTone = { ok: 'good', error: 'bad', rejected_by_policy: 'bad', invalid_output: 'warn', fallback: 'warn' }
const statusText = { ok: 'ok', error: 'error', rejected_by_policy: 'Rejected by policy', invalid_output: 'Invalid output', fallback: 'Fallback' }
const opText = { invoke_agent: 'Agent run', chat: 'Model call', execute_tool: 'Tool' }
// Three agents (LangGraph): the planner never sees log text, only fixed fields.
const agentText = { investigation: '1 · Investigation', threat_analysis: '2 · Threat Analysis', defense_planning: '3 · Defense Planning', rule_fallback: 'Rule fallback (not AI)' }
const agentNote = { investigation: 'Read-only tools collect evidence', threat_analysis: 'No tools · classifies the evidence', defense_planning: 'Sees fixed fields only, never log text', rule_fallback: 'Model unavailable or output invalid; detection rule result used' }
const ms = (v) => v == null ? '' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`

export default function AgentTrace({ ctx, id }) {
  const incidents = ctx.data.incidents
  const current = id || incidents[0]?.id
  const { report, error, loading } = useReport(current, ctx.version)

  if (!incidents.length) return <Empty>ยังไม่มี incident ให้ดู trace</Empty>
  if (loading && !report) return <Loading />
  if (!report || report.id !== current) return <Banner tone="bad" icon="x" action={<a className="btn ghost sm" href="#/incidents">กลับไปรายการเหตุการณ์</a>}>{error || 'โหลดรายละเอียดไม่สำเร็จ กรุณาลองใหม่'}</Banner>

  const analysis = parseAnalysis(report.analysis)
  const p = report.proposal
  const fallback = isFallback(report)
  const trace = report.trace || []
  const tools = trace.filter(t => (t.operation || 'execute_tool') === 'execute_tool')
  const blockedByPolicy = trace.filter(t => t.status === 'rejected_by_policy')
  const analyze = () => ctx.act(`/api/incidents/${current}/analyze`, { ok: (r) => `วิเคราะห์เสร็จ · โหมด ${r.analysis_mode}` })

  return <div className="grid trace">
    <div className="traceBar span3">
      <label className="incidentPick"><Icon name="alert" /><span className="sr">Incident</span>
        <select value={current} onChange={e => go('trace', e.target.value)}>{incidents.map(i => <option key={i.id} value={i.id}>{incId(i.id)} · {kindName(i.kind)} · {i.source_ip}</option>)}</select>
      </label>
      <Badge tone={report.analysis ? 'good' : 'warn'} icon={report.analysis ? 'ok' : 'clock'}>{report.analysis ? 'Investigation complete' : 'Not investigated'}</Badge>
      <ModeBadge mode={report.analysis_mode} />
      <div className="spacer" />
      <span className="muted small">Model <b className="mono">{ctx.data.health?.model || '—'}</b> · Runtime local Ollama · Source <b className="mono">{report.source_ip}</b></span>
    </div>

    {fallback && <div className="span3"><Banner tone="warn" icon="info">โมเดลใช้ไม่ได้หรือผลไม่ผ่าน validation รอบนี้จึงเป็น <b>rule fallback</b> ไม่ใช่ผลวิเคราะห์ของ AI · แถวที่มาจาก fallback ติดป้าย <b>fallback</b> แยกจากแถวของโมเดล</Banner></div>}
    {blockedByPolicy.length > 0 && <div className="span3"><Banner tone="bad" icon="shield"><b>Policy ปฏิเสธคำขอของโมเดล {blockedByPolicy.length} ครั้ง</b> · เช่น เสนอบล็อก IP ที่ไม่ใช่ต้นทางของ incident หรือ IP ที่ได้รับการป้องกัน — backend ไม่ทำตาม</Banner></div>}

    <Panel title="Investigation Steps" icon="trace">
      <ol className="vsteps">
        <li className="done"><b>Read incident</b><small>{kindName(report.kind)} from {report.source_ip}</small></li>
        {trace.map((t, i) => <React.Fragment key={t.id}>
          {t.agent && t.agent !== trace[i - 1]?.agent && <li className="agentHead"><b>{agentText[t.agent] || t.agent}</b><small>{agentNote[t.agent]}</small></li>}
          <li className={t.status && t.status !== 'ok' ? 'current' : 'done'}>
            <b className="mono">{t.tool}</b>
            <small>{fmtTime(t.created_at)} · {opText[t.operation] || 'Tool'}{t.duration_ms != null && ` · ${ms(t.duration_ms)}`}{t.source === 'fallback' && ' · fallback'}{t.status && !['ok', 'fallback'].includes(t.status) && ` · ${statusText[t.status] || t.status}`}</small>
          </li>
        </React.Fragment>)}
        <li className={report.analysis ? 'done' : 'current'}><b>Structured analysis</b><small>{report.analysis ? (fallback ? 'Rule fallback (not AI)' : 'Validated JSON') : report.status === 'analyzing' || ctx.busy ? 'Running… (~30 s on the M5)' : 'Not run yet'}</small></li>
        <li className={p && p.status !== 'pending' ? 'done' : p ? 'current' : ''}><b>Human approval</b><small>{p ? (p.status === 'pending' ? 'No action executed. Waiting for approval.' : `${p.status} by ${p.reviewer}`) : report.analysis && noProposalNote[report.status] ? `No block proposed · ${noProposalNote[report.status]}` : 'No proposal yet'}</small></li>
      </ol>
      {!report.analysis && report.status === 'closed' && <p className="muted small">ปิดเหตุการณ์ก่อนวิเคราะห์ · วิเคราะห์ incident ที่ปิดแล้วไม่ได้</p>}
      {!report.analysis && report.status !== 'closed' && <button className="btn primary block" disabled={ctx.busy || !!ctx.error || report.status === 'analyzing'} onClick={analyze}>{ctx.busy || report.status === 'analyzing' ? 'กำลังวิเคราะห์หลักฐาน… (บน M5 ประมาณ 30 วินาที)' : 'เริ่มวิเคราะห์'}</button>}
    </Panel>

    <div className="stack">
      {tools.length ? tools.map(t => <ToolCall key={t.id} t={t} />) : <Panel title="Tool Execution" icon="terminal"><Empty>ยังไม่มี tool call</Empty></Panel>}
    </div>

    <div className="stack">
      <Panel title="Structured Analysis" icon="rules" actions={<CopyButton text={report.analysis ? JSON.stringify(report.analysis, null, 2) : ''} />}>
        {analysis?.json ? <Code label="Analysis JSON">{JSON.stringify(analysis.json, null, 2)}</Code> : analysis?.text ? <p className="analysisText">{analysis.text}</p> : <Empty>ยังไม่มีผลวิเคราะห์</Empty>}
      </Panel>
      <Panel title={p?.status === 'approved' ? 'Approved by human' : p?.status === 'rejected' ? 'Rejected by human' : 'No action executed'} icon="alert" className={p?.status === 'pending' ? 'attention' : ''}>
        {p ? <>
          <p className="muted">{p.status === 'pending' ? 'A temporary app-level block has been proposed. Review the proposal before execution.' : `Decision recorded by ${p.reviewer}.`}</p>
          {p.source === 'rule_fallback' && <Banner tone="warn" icon="info">ข้อเสนอจาก rule fallback ไม่ใช่โมเดล</Banner>}
          <KeyVals items={[['Incident', `${incId(report.id)} · ${kindName(report.kind)}`], ['Target', <span className="mono">{targetIp(p)}</span>], ['Action', actionLabel[p.action] || p.action], ['Expires', `${p.duration_seconds / 60} minutes after approval`]]} />
          {p.status === 'pending' && <a className="btn amber block" href={`#/approvals/${p.id}`}>Review {propId(p.id)}</a>}
        </> : <Empty>{report.analysis && noProposalNote[report.status] ? `ไม่มีข้อเสนอบล็อก · ${noProposalNote[report.status]}` : 'ยังไม่มีข้อเสนอ'}</Empty>}
      </Panel>
    </div>
  </div>
}

// Log records: the evidence columns first; the source IP is the same on every row, so it goes last.
const LOG_ORDER = ['t', 'type', 'outcome', 'user', 'port', 'src']
const colText = { t: 'Time', type: 'Type', outcome: 'Outcome', user: 'Username', port: 'Port', src: 'Source' }
// Columns whose value is the same on every row (source IP, often the event type) move to the header line.
const constantOf = (rows) => Object.fromEntries(['src', 'type'].filter(k => rows.length > 1 && rows.every(r => r[k] === rows[0][k])).map(k => [k, rows[0][k]]))
const columnsOf = (rows) => {
  const fixed = constantOf(rows)
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => !(k in fixed))
  return [...LOG_ORDER.filter(k => keys.includes(k)), ...keys.filter(k => !LOG_ORDER.includes(k))]
}
// Every time on the page is shown in the browser's local zone, including UTC timestamps inside tool output.
const isTime = (k) => k === 't' || k.endsWith('timestamp') || k.endsWith('_at') || k.endsWith('_seen')
const cell = (k, v) => v == null ? '—' : isTime(k) ? fmtTime(v) : String(v)
const localTimes = (v) => Array.isArray(v) ? v.map(localTimes) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, isTime(k) && typeof x === 'string' ? new Date(x).toLocaleString('en-GB', { hour12: false }) : localTimes(x)])) : v

function ToolCall({ t }) {
  const input = parseJson(t.input)
  const raw = parseJson(t.output)
  // get_incident_logs wraps records as untrusted data; show them as a table.
  const output = Array.isArray(raw?.untrusted_log_records) ? raw.untrusted_log_records : raw
  const status = t.status || 'ok'
  return <Panel title={<><span className="mono">{t.tool}</span>{t.tool === 'propose_block_ip' ? <Badge tone="warn">Proposal pre-check</Badge> : <Badge tone="info">Read only</Badge>}{status !== 'ok' && <Badge tone={statusTone[status] || 'warn'}>{statusText[status] || status}</Badge>}{t.source === 'fallback' && <Badge tone="warn">fallback</Badge>}</>} icon="terminal" actions={<span className="muted small">{fmtTime(t.created_at)}{t.duration_ms != null && ` · ${ms(t.duration_ms)}`}</span>}>
    <h3 className="sub">Input</h3>
    <Code>{JSON.stringify(input, null, 2)}</Code>
    <h3 className="sub">Output {Array.isArray(output) && <small>· {output.length} record{output.length === 1 ? '' : 's'}{output !== raw && ' · untrusted log data'}{Object.entries(constantOf(output)).map(([k, v]) => ` · ${colText[k] || k} ${v}`)}</small>}</h3>
    {Array.isArray(output) ? (output.length ? <div className="tableWrap short logTable"><table>
      <thead><tr>{columnsOf(output).map(k => <th key={k}>{colText[k] || k}</th>)}</tr></thead>
      <tbody>{output.slice(0, 40).map((row, i) => <tr key={i}>{columnsOf(output).map(k => <td key={k} className={k === 'user' ? 'userCell' : 'mono'}>{cell(k, row[k])}</td>)}</tr>)}</tbody>
    </table></div> : <Empty>Empty result</Empty>) : <Code>{JSON.stringify(localTimes(output), null, 2)}</Code>}
  </Panel>
}

function CopyButton({ text }) {
  const [done, setDone] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  if (!text || !navigator.clipboard) return null
  return <><button className="btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setFailed(false); setDone(true); setTimeout(() => setDone(false), 1500) } catch { setFailed(true) } }}>{done ? 'คัดลอกแล้ว' : 'คัดลอก'}</button>{failed && <span role="status" className="coral small">คัดลอกไม่ได้ · เลือกข้อความแล้วคัดลอกเองได้</span>}</>
}
