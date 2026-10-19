import React from 'react'
import { useReport } from '../api.js'
import { Badge, Banner, Code, Empty, Icon, KeyVals, Loading, ModeBadge, Panel, fmtTime, go, incId, kindName, parseAnalysis, parseJson, propId } from '../ui.jsx'

export default function AgentTrace({ ctx, id }) {
  const incidents = ctx.data.incidents
  const current = id || incidents[0]?.id
  const { report, error, loading } = useReport(current, ctx.version)

  if (!incidents.length) return <Empty>ยังไม่มี incident ให้ดู trace</Empty>
  if (loading && !report) return <Loading />
  if (!report || report.id !== current) return <Banner tone="bad" icon="x">{error || 'กำลังโหลด…'}</Banner>

  const analysis = parseAnalysis(report.analysis)
  const p = report.proposal
  const fallback = report.analysis_mode === 'rule_fallback'
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

    {fallback && <div className="span3"><Banner tone="warn" icon="info">โมเดลใช้ไม่ได้หรือผลไม่ผ่าน validation รอบนี้จึงเป็น <b>rule fallback</b> — trace ด้านล่างเป็นการอ่านหลักฐานของ backend อาจมี tool call ของโมเดลที่ทำไปก่อนล้มปนอยู่ ไม่ใช่ผลวิเคราะห์ของ AI</Banner></div>}

    <Panel title="Investigation Steps" icon="trace">
      <ol className="vsteps">
        <li className="done"><b>Read incident</b><small>{kindName(report.kind)} from {report.source_ip}</small></li>
        {report.trace.map(t => <li key={t.id} className="done"><b className="mono">{t.tool}</b><small>{fmtTime(t.created_at)} · read only</small></li>)}
        <li className={report.analysis ? 'done' : 'current'}><b>Structured analysis</b><small>{report.analysis ? (fallback ? 'Rule fallback text' : 'Validated JSON') : 'Not run yet'}</small></li>
        <li className={p && p.status !== 'pending' ? 'done' : p ? 'current' : ''}><b>Human approval</b><small>{p ? (p.status === 'pending' ? 'No action executed. Waiting for approval.' : `${p.status} by ${p.reviewer}`) : 'No proposal yet'}</small></li>
      </ol>
      {!report.analysis && <button className="btn primary block" disabled={ctx.busy} onClick={analyze}>{ctx.busy ? 'Local model is investigating…' : 'Run investigation'}</button>}
    </Panel>

    <div className="stack">
      {report.trace.length ? report.trace.map(t => <ToolCall key={t.id} t={t} />) : <Panel title="Tool Execution" icon="terminal"><Empty>ยังไม่มี tool call</Empty></Panel>}
    </div>

    <div className="stack">
      <Panel title="Structured Analysis" icon="rules" actions={<CopyButton text={report.analysis || ''} />}>
        {analysis?.json ? <Code label="Analysis JSON">{JSON.stringify(analysis.json, null, 2)}</Code> : analysis?.text ? <p className="analysisText">{analysis.text}</p> : <Empty>ยังไม่มีผลวิเคราะห์</Empty>}
      </Panel>
      <Panel title={p?.status === 'approved' ? 'Approved by human' : p?.status === 'rejected' ? 'Rejected by human' : 'No action executed'} icon="alert" className={p?.status === 'pending' ? 'attention' : ''}>
        {p ? <>
          <p className="muted">{p.status === 'pending' ? 'A temporary app-level block has been proposed. Review the proposal before execution.' : `Decision recorded by ${p.reviewer}.`}</p>
          <KeyVals items={[['Incident', `${incId(report.id)} · ${kindName(report.kind)}`], ['Source', <span className="mono">{p.source_ip}</span>], ['Action', 'Temporary app-level block'], ['Expires', `${p.duration_seconds / 60} minutes after approval`]]} />
          {p.status === 'pending' && <a className="btn amber block" href={`#/approvals/${p.id}`}>Review {propId(p.id)}</a>}
        </> : <Empty>ยังไม่มีข้อเสนอ</Empty>}
      </Panel>
    </div>
  </div>
}

function ToolCall({ t }) {
  const input = parseJson(t.input)
  const output = parseJson(t.output)
  return <Panel title={<><span className="mono">{t.tool}</span><Badge tone="info">Read only</Badge></>} icon="terminal" actions={<span className="muted small">{fmtTime(t.created_at)}</span>}>
    <h3 className="sub">Input</h3>
    <Code>{JSON.stringify(input, null, 2)}</Code>
    <h3 className="sub">Output {Array.isArray(output) && <small>· {output.length} record{output.length === 1 ? '' : 's'}</small>}</h3>
    {Array.isArray(output) ? (output.length ? <div className="tableWrap short"><table>
      <thead><tr>{Object.keys(output[0]).map(k => <th key={k}>{k}</th>)}</tr></thead>
      <tbody>{output.slice(0, 30).map((row, i) => <tr key={i}>{Object.entries(row).map(([k, v]) => <td key={k} className="mono">{k.endsWith('timestamp') || k.endsWith('_at') ? fmtTime(v) : String(v ?? '—')}</td>)}</tr>)}</tbody>
    </table></div> : <Empty>Empty result</Empty>) : <Code>{JSON.stringify(output, null, 2)}</Code>}
  </Panel>
}

function CopyButton({ text }) {
  const [done, setDone] = React.useState(false)
  if (!text || !navigator.clipboard) return null
  return <button className="btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ } }}>{done ? 'Copied' : 'Copy'}</button>
}
