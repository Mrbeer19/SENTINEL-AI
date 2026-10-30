import React from 'react'
import { useReport } from '../api.js'
import { Badge, Banner, Code, Empty, Icon, Loading, ModeBadge, actionLabel, fmtTime, go, incId, isFallback, kindName, noProposalNote, parseAnalysis, parseJson, propId, targetIp, durationText, UNTIL_UNBLOCKED, useNow } from '../ui.jsx'

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
const stateText = { done: 'เสร็จแล้ว', active: 'กำลังทำงาน', wait: 'รอคิว', skip: 'ข้าม', fail: 'ไม่ผ่าน' }
const isBad = (t) => t.status && !['ok', 'fallback'].includes(t.status)

// An agent is finished once its invoke_agent row exists; while the incident is analyzing,
// the first unfinished agent is the one running now. Rows are written as each step ends.
function stageStates(report, trace) {
  const byAgent = Object.fromEntries(AGENTS.map(a => [a.key, trace.filter(t => t.agent === a.key)]))
  const run = (key) => byAgent[key].find(t => t.operation === 'invoke_agent')
  const firstOpen = AGENTS.findIndex(a => !run(a.key))
  return AGENTS.map((a, i) => {
    if (run(a.key)) return isBad(run(a.key)) ? 'fail' : 'done'
    if (report.status === 'analyzing' && i === firstOpen) return 'active'
    if (report.analysis) return byAgent[a.key].length ? 'fail' : 'skip'
    return 'wait'
  })
}

export default function AgentTrace({ ctx, id }) {
  const incidents = ctx.data.incidents
  const live = incidents.find(i => i.status === 'analyzing')
  const current = id || live?.id || incidents[0]?.id
  const { report, error, loading } = useReport(current, ctx.version)
  const now = useNow(1000)

  if (!incidents.length) return <Empty>ยังไม่มี incident ให้ดูการวิเคราะห์</Empty>
  if (loading && !report) return <Loading />
  if (!report || report.id !== current) return <Banner tone="bad" icon="x" action={<a className="btn ghost sm" href="#/incidents">กลับไปรายการเหตุการณ์</a>}>{error || 'โหลดรายละเอียดไม่สำเร็จ กรุณาลองใหม่'}</Banner>

  const analysis = parseAnalysis(report.analysis)
  const p = report.proposal
  const fallback = isFallback(report)
  const trace = report.trace || []
  const tools = trace.filter(t => (t.operation || 'execute_tool') === 'execute_tool')
  const blockedByPolicy = trace.filter(t => t.status === 'rejected_by_policy')
  const analyzing = report.status === 'analyzing'
  const states = stageStates(report, trace)
  const last = trace[trace.length - 1]
  const since = last ? Math.max(0, Math.round((now - new Date(last.created_at)) / 1000)) : 0
  const totalMs = trace.filter(t => t.operation === 'invoke_agent').reduce((s, t) => s + (t.duration_ms || 0), 0)
  const analyze = () => ctx.act(`/api/incidents/${current}/analyze`, { ok: (r) => `วิเคราะห์เสร็จ · โหมด ${r.analysis_mode}` })

  const approval = p ? (p.status === 'pending' ? 'active' : p.status === 'rejected' ? 'fail' : 'done') : report.analysis ? 'skip' : 'wait'
  const verify = report.status === 'verified' ? 'done' : report.status === 'blocked' ? 'active' : p?.status === 'rejected' || (report.analysis && !p) ? 'skip' : 'wait'
  const flow = ['done', ...states, approval, verify]
  // The connector after a stage lights up once the next stage has started.
  const linkOn = (i) => ['done', 'fail', 'active'].includes(flow[i + 1])

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
        <ModeBadge mode={report.analysis_mode} />
        <small>Model <b className="mono">{ctx.data.health?.model || '—'}</b>{totalMs > 0 && <> · รวม <b>{ms(totalMs)}</b></>}</small>
      </div>
    </header>

    {fallback && <Banner tone="warn" icon="info">โมเดลใช้ไม่ได้หรือผลไม่ผ่าน validation รอบนี้จึงเป็น <b>rule fallback</b> ไม่ใช่ผลวิเคราะห์ของ AI</Banner>}
    {blockedByPolicy.length > 0 && <Banner tone="bad" icon="shield"><b>Policy ปฏิเสธคำขอของโมเดล {blockedByPolicy.length} ครั้ง</b> · backend ไม่ทำตาม</Banner>}

    <section className="aiPipeline" aria-label="ลำดับการทำงานของ AI">
      <Stage state="done" no="00" icon="alert" title="Detection" th="ตรวจพบเหตุการณ์" link={linkOn(0)} next={flow[1]}>
        <p className="aiStageLine"><b>{kindName(report.kind)}</b></p>
        <p className="aiStageLine mono">{report.source_ip}</p>
        <p className="aiStageLine muted">{report.event_count ?? '—'} events · {fmtTime(report.created_at)}</p>
      </Stage>
      {AGENTS.map((a, i) => {
        const rows = trace.filter(t => t.agent === a.key)
        const run = rows.find(t => t.operation === 'invoke_agent')
        const steps = rows.filter(t => t.operation !== 'invoke_agent')
        return <Stage key={a.key} state={states[i]} no={a.no} icon={a.icon} title={a.title} th={a.th} note={a.note} link={linkOn(i + 1)} next={flow[i + 2]} time={run && ms(run.duration_ms)}>
          {steps.length > 0 && <ol className="aiSteps">
            {steps.length > 4 && <li className="muted">+{steps.length - 4} ขั้นก่อนหน้า</li>}
            {steps.slice(-4).map(t => <li key={t.id} className={isBad(t) ? 'bad' : ''}>
              <Icon name={t.operation === 'chat' ? 'brain' : 'terminal'} size={14} artwork={false} />
              <span className="mono">{t.operation === 'chat' ? 'model call' : t.tool.replace(/_/g, '_\u200b')}</span>
              <time>{ms(t.duration_ms)}</time>
            </li>)}
          </ol>}
          {states[i] === 'active' && <p className="aiThinking">{steps.length ? 'กำลังทำขั้นถัดไป' : 'กำลังคิด'}<span>.</span><span>.</span><span>.</span> {since}s</p>}
          {!steps.length && states[i] !== 'active' && <p className="aiStageLine muted">{states[i] === 'skip' ? 'ไม่ได้ใช้ในรอบนี้' : 'รอขั้นก่อนหน้า'}</p>}
        </Stage>
      })}
      <Stage state={approval} no="04" icon="check" title="Human approval" th="คนอนุมัติ" link={linkOn(4)} next={flow[5]}>
        {p ? <>
          <p className="aiStageLine"><b>{actionLabel[p.action] || p.action}</b></p>
          <p className="aiStageLine mono">{targetIp(p)}</p>
          <p className="aiStageLine muted">{p.status === 'pending' ? 'รอแอดมินตัดสินใจ' : `${p.status} · ${p.reviewer}`}</p>
        </> : <p className="aiStageLine muted">{report.analysis ? (noProposalNote[report.status] || 'ไม่มีข้อเสนอบล็อก') : 'รอผลวิเคราะห์'}</p>}
      </Stage>
      <Stage state={verify} no="05" icon="shield" title="Verification" th="พิสูจน์ผล" last>
        <p className="aiStageLine muted">{verify === 'done' ? 'คำขอใหม่ถูกปฏิเสธ 403 ยืนยันว่าบล็อกได้จริง' : verify === 'active' ? 'บล็อกแล้ว รอคำขอใหม่จาก IP นี้' : verify === 'skip' ? 'ไม่มีการบล็อก' : 'รออนุมัติก่อน'}</p>
      </Stage>
    </section>

    {analyzing && last && <p className="aiTicker" role="status"><span className="aiDot" />ล่าสุด {fmtTime(last.created_at)} · <b>{AGENTS.find(a => a.key === last.agent)?.title || last.agent}</b> · {last.operation === 'chat' ? 'เรียกโมเดล' : last.operation === 'invoke_agent' ? 'จบขั้นตอน' : `ใช้ ${last.tool}`} ({ms(last.duration_ms)})</p>}

    <section className="aiBottom">
      <article className="aiCard aiResult">
        <header><h2><Icon name="brain" size={18} artwork={false} />ผลการวิเคราะห์ของ AI</h2><CopyButton text={report.analysis ? JSON.stringify(report.analysis, null, 2) : ''} /></header>
        {analysis?.json ? <div className="aiResultBody">
          <div className="aiVerdict">
            <span className={`aiSeverity ${String(analysis.json.severity || '').toLowerCase()}`}>{analysis.json.severity || '—'}</span>
            <div><h3>{kindName(analysis.json.threat_type || report.kind)}</h3><p>{analysis.json.explanation_th}</p></div>
            {analysis.json.confidence != null && <div className="aiConfidence" style={{ '--c': `${Math.round(analysis.json.confidence * 100)}%` }}><b>{Math.round(analysis.json.confidence * 100)}%</b><small>ความมั่นใจ</small></div>}
          </div>
          <ol className="aiEvidence">{analysis.json.evidence.map((e, i) => <li key={i}><span>{i + 1}</span>{e}</li>)}</ol>
          <details className="analysisJson"><summary>ดูผลวิเคราะห์ JSON</summary><Code label="Analysis JSON">{JSON.stringify(analysis.json, null, 2)}</Code></details>
        </div> : analysis?.text ? <p className="analysisText">{analysis.text}</p>
          : <div className="aiWaiting">{analyzing ? <p className="aiThinking">AI กำลังวิเคราะห์หลักฐาน<span>.</span><span>.</span><span>.</span></p> : report.status === 'closed' ? <p className="muted">ปิดเหตุการณ์ก่อนวิเคราะห์ · วิเคราะห์ไม่ได้</p>
            : <button className="btn primary" disabled={ctx.busy || !!ctx.error} onClick={analyze}>{ctx.busy ? 'กำลังเริ่ม…' : 'เริ่มวิเคราะห์'}</button>}</div>}
      </article>

      <article className={`aiCard aiDecision ${p?.status === 'pending' ? 'attention' : ''}`}>
        <header><h2><Icon name="check" size={18} artwork={false} />{p?.status === 'approved' ? 'อนุมัติแล้ว' : p?.status === 'rejected' ? 'ปฏิเสธแล้ว' : 'การตัดสินใจ'}</h2></header>
        {p ? <>
          <dl className="aiFacts">
            <div><dt>ข้อเสนอ</dt><dd>{actionLabel[p.action] || p.action}</dd></div>
            <div><dt>IP เป้าหมาย</dt><dd className="mono">{targetIp(p)}</dd></div>
            <div><dt>ระยะเวลา</dt><dd>{p.duration_seconds ? `${durationText(p.duration_seconds)} หลังอนุมัติ` : UNTIL_UNBLOCKED}</dd></div>
            <div><dt>สถานะ</dt><dd><Badge tone={p.status === 'pending' ? 'warn' : p.status === 'approved' ? 'good' : 'muted'}>{p.status === 'pending' ? 'รออนุมัติ' : p.status}</Badge></dd></div>
          </dl>
          {p.source === 'rule_fallback' && <Banner tone="warn" icon="info">ข้อเสนอจาก rule fallback ไม่ใช่โมเดล</Banner>}
          {p.status === 'pending' ? <a className="btn amber block" href={`#/approvals/${p.id}`}>ตรวจและอนุมัติ {propId(p.id)}</a> : <p className="muted small">บันทึกโดย {p.reviewer}</p>}
        </> : <Empty>{report.analysis && noProposalNote[report.status] ? `ไม่มีข้อเสนอบล็อก · ${noProposalNote[report.status]}` : 'ยังไม่มีข้อเสนอ'}</Empty>}
        <img className="aiMascot" src="/assets/sentinel-investigator.png" alt="" />
      </article>
    </section>

    <details className="aiTools">
      <summary><Icon name="terminal" size={16} artwork={false} />ดู input / output ของเครื่องมือ ({tools.length})</summary>
      <div className="aiToolsRow">{tools.length ? tools.map(t => <ToolCall key={t.id} t={t} />) : <Empty>ยังไม่มีการเรียกเครื่องมือ</Empty>}</div>
    </details>
  </div>
}

function Stage({ state, no, icon, title, th, note, time, link, next, last, children }) {
  return <div className={`aiStage ${state}`}>
    <div className="aiStageCard">
      <div className="aiStageHead">
        <span className="aiStageIcon"><Icon name={icon} size={18} artwork={false} /></span>
        <div><small>{no} · {th}</small><b>{title}</b></div>
      </div>
      <span className={`aiState ${state}`}>{stateText[state]}{time && <> · {time}</>}</span>
      {note && <p className="aiStageNote">{note}</p>}
      <div className="aiStageBody">{children}</div>
    </div>
    {!last && <span className={`aiLink ${link ? 'on' : ''} ${next === 'active' ? 'flowing' : ''}`} aria-hidden="true"><i /><i /><i /></span>}
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
  return <article className="aiCard aiTool">
    <header><h3 className="mono">{t.tool}</h3>{t.tool === 'propose_block_ip' ? <Badge tone="warn">Proposal pre-check</Badge> : <Badge tone="info">Read only</Badge>}{status !== 'ok' && <Badge tone={statusTone[status] || 'warn'}>{statusText[status] || status}</Badge>}{t.source === 'fallback' && <Badge tone="warn">fallback</Badge>}<small className="muted">{fmtTime(t.created_at)}{t.duration_ms != null && ` · ${ms(t.duration_ms)}`}</small></header>
    <h4 className="sub">Input</h4>
    <Code>{JSON.stringify(input, null, 2)}</Code>
    <h4 className="sub">Output {Array.isArray(output) && <small>· {output.length} record{output.length === 1 ? '' : 's'}{output !== raw && ' · untrusted log data'}{Object.entries(constantOf(output)).map(([k, v]) => ` · ${colText[k] || k} ${v}`)}</small>}</h4>
    {Array.isArray(output) ? (output.length ? <div className="tableWrap short logTable"><table>
      <thead><tr>{columnsOf(output).map(k => <th key={k}>{colText[k] || k}</th>)}</tr></thead>
      <tbody>{output.slice(0, 40).map((row, i) => <tr key={i}>{columnsOf(output).map(k => <td key={k} className={k === 'user' ? 'userCell' : 'mono'}>{cell(k, row[k])}</td>)}</tr>)}</tbody>
    </table></div> : <Empty>Empty result</Empty>) : <Code>{JSON.stringify(localTimes(output), null, 2)}</Code>}
  </article>
}

function CopyButton({ text }) {
  const [done, setDone] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  if (!text || !navigator.clipboard) return null
  return <><button className="btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setFailed(false); setDone(true); setTimeout(() => setDone(false), 1500) } catch { setFailed(true) } }}>{done ? 'คัดลอกแล้ว' : 'คัดลอก'}</button>{failed && <span role="status" className="coral small">คัดลอกไม่ได้ · เลือกข้อความแล้วคัดลอกเองได้</span>}</>
}
