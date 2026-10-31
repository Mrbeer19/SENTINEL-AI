import TablePagination, { usePagedRows } from '../components/TablePagination.jsx'
import React, { useEffect, useState } from 'react'
import { Badge, Banner, Empty, FilterSummary, Icon, NoResults, Panel, Stat, fmtTime, go, incId, isActiveRule, remaining, ruleId, useNow, fmtExpiry, isPermanentRule } from '../ui.jsx'

const within = (t, rule) => t.source_ip === rule.source_ip && new Date(t.created_at) >= new Date(rule.created_at) && new Date(t.created_at) <= new Date(rule.expires_at)
export const ruleProof = (rule, traffic) => traffic.filter(t => t.decision === 'denied' && within(t, rule)).sort((a, b) => a.id - b.id)[0] || null

export default function Rules({ ctx, id }) {
  const { rules, traffic, proposals } = ctx.data
  const now = useNow(1000)
  const [tab, setTab] = useState(() => rules.find(r => r.id === id) && !isActiveRule(rules.find(r => r.id === id)) ? 'history' : 'active')
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState(null)
  const incidentOf = (rule) => proposals.find(p => p.id === rule.proposal_id)?.incident_id
  const active = rules.filter(r => isActiveRule(r, now))
  const list = (tab === 'active' ? active : rules.filter(r => !isActiveRule(r, now)))
    .filter(r => !query || [ruleId(r.id), r.source_ip, incId(incidentOf(r) || 0)].some(v => v.toLowerCase().includes(query.toLowerCase())))
  const paging = usePagedRows(list, `${query}|${tab}`)
  const selected = list.find(r => r.id === id) || paging.rows[0]
  const routeRule = rules.find(r => r.id === id)
  const routeActive = routeRule ? isActiveRule(routeRule, now) : null
  useEffect(() => { if (routeActive !== null) setTab(routeActive ? 'active' : 'history'); setConfirm(null) }, [id, routeActive])
  const unblock = async (rule) => { setConfirm(null); await ctx.act(`/api/rules/${rule.id}`, { method: 'DELETE', ok: `ปลดบล็อก ${ruleId(rule.id)} แล้ว · request ใหม่จาก ${rule.source_ip} จะผ่าน` }) }
  // Reason for each recent decision: the rule that covered that source at that moment.
  const coveringRule = (t) => rules.find(r => within(t, r))

  return <div className="grid rules">
    <div className="span3"><Banner tone="info" icon="info"><b>Scope:</b> กฎนี้ใช้กับ rod-mai-rod เท่านั้น</Banner></div>
    <div className="stats three span3">
      <Stat icon="shield" label="กฎที่ทำงาน" value={active.length} />
      <Stat icon="clock" tone="amber" label="หมดอายุ / ปลดแล้ว" value={rules.length - active.length} />
      <Stat icon="ok" label="ยืนยันผลแล้ว" value={rules.filter(r => ruleProof(r, traffic)).length} note="มีคำขอใหม่ถูกปฏิเสธ" />
    </div>

    <Panel className="span2">
      <div className="tabRow">
        <div className="tabs" role="group" aria-label="สถานะกฎ">
          <button aria-pressed={tab === 'active'} className={tab === 'active' ? 'on' : ''} onClick={() => { setTab('active'); setQuery(''); setConfirm(null) }}>กำลังทำงาน ({active.length})</button>
          <button aria-pressed={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => { setTab('history'); setQuery(''); setConfirm(null) }}>ประวัติ ({rules.length - active.length})</button>
        </div>
        <label className="search"><Icon name="info" size={16} /><span className="sr">Filter rules</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหา IP หมายเลขกฎ หรือเหตุการณ์…" /></label>
      </div>
      <FilterSummary count={list.length} total={tab === 'active' ? active.length : rules.length - active.length} active={!!query} onClear={() => setQuery('')} />
      {list.length ? <div className="tableWrap"><table>
        <thead><tr><th>Rule</th><th>Source IP</th><th>Incident</th><th>Expires</th><th>Status</th><th>Verification</th></tr></thead>
        <tbody>{paging.rows.map(r => {
          const on = isActiveRule(r, now)
          const proof = ruleProof(r, traffic)
          return <tr key={r.id} className={`clickable ${selected?.id === r.id ? 'selected' : ''}`} tabIndex={0} aria-selected={selected?.id === r.id} onKeyDown={e=>{if(e.target===e.currentTarget && ['Enter',' '].includes(e.key)){e.preventDefault();go('rules',r.id)}}} onClick={() => go('rules', r.id)}>
            <td><a href={`#/rules/${r.id}`} onClick={e => e.stopPropagation()}>{ruleId(r.id)}</a></td><td className="mono">{r.source_ip}</td>
            <td>{incidentOf(r) ? <a href={`#/incident/${incidentOf(r)}`} onClick={e => e.stopPropagation()}>{incId(incidentOf(r))}</a> : '—'}</td>
            <td className="mono">{fmtExpiry(r)}</td>
            <td><Badge tone={on ? 'good' : 'muted'}>{on ? 'Active' : 'Expired'}</Badge></td>
            <td><Badge tone={proof ? 'good' : 'muted'} icon={proof ? 'ok' : undefined}>{proof ? 'Verified 403' : 'Not verified'}</Badge></td>

          </tr>
        })}</tbody></table></div> : query ? <NoResults onClear={() => setQuery('')} /> : <Empty>{tab === 'active' ? <>ไม่มีกฎที่ทำงานอยู่ · <a href="#/approvals">ดูข้อเสนอที่รออนุมัติ</a></> : 'ยังไม่มีกฎที่หมดอายุหรือถูกปลด'}</Empty>}
      <TablePagination state={paging}/>
    </Panel>

    <div className="stack ruleInspector">
      <Panel title="รายละเอียดกฎ" icon="shield" actions={selected && <Badge tone={isActiveRule(selected, now) ? 'good' : 'muted'}>{isActiveRule(selected, now) ? 'Active' : 'Expired'}</Badge>}>
        {selected ? <RuleDetail rule={selected} now={now} incident={incidentOf(selected)} traffic={traffic} onRemove={() => setConfirm(selected.id)} confirming={confirm === selected.id} busy={ctx.busy || !!ctx.error} unblock={() => unblock(selected)} cancel={() => setConfirm(null)} /> : <Empty>ไม่มีกฎในรายการที่เลือก</Empty>}
      </Panel>
      <details className="consolePolicy"><summary>ที่อยู่ที่ระบบไม่อนุญาตให้บล็อก</summary>
        <p className="muted small">Loopback and unspecified addresses are excluded from app-level blocks.</p>
        <div className="chips"><code>127.0.0.1 (localhost)</code><code>::1 (IPv6 localhost)</code><code>0.0.0.0</code></div>
        <p className="muted small">Review the target IP before approving a rule. Only the listed addresses are protected automatically.</p>
      </details>
    </div>

    <Panel title="Recent Decisions" icon="rules" className="span3" actions={<span className="muted small">คำขอที่ระบบบันทึกไว้</span>}>
      {traffic.length ? <div className="tableWrap short"><table>
        <thead><tr><th>Time</th><th>Source IP</th><th>Result</th><th>Reason</th><th>Related rule</th></tr></thead>
        <tbody>{traffic.slice(0, 12).map(t => { const r = t.decision === 'denied' ? coveringRule(t) : null; return <tr key={t.id}>
          <td className="mono">{fmtTime(t.created_at)}</td><td className="mono">{t.source_ip}</td>
          <td><b className={t.decision === 'denied' ? 'coral' : 'mint'}>{t.decision === 'denied' ? '403 Denied' : 'Allowed'}</b></td>
          <td>{r ? `Blocked by ${ruleId(r.id)}` : t.decision === 'denied' ? 'Blocked by rule' : 'No active rule'}</td>
          <td>{r ? <a href={`#/rules/${r.id}`}>{ruleId(r.id)}</a> : '—'}</td>
        </tr> })}</tbody></table></div> : <Empty>ยังไม่มี request</Empty>}
    </Panel>
  </div>
}

function RuleDetail({ rule, now, incident, traffic, onRemove, confirming, busy, unblock, cancel }) {
  const on = isActiveRule(rule, now)
  const total = new Date(rule.expires_at) - new Date(rule.created_at)
  const left = Math.max(0, new Date(rule.expires_at) - now)
  const proof = ruleProof(rule, traffic)
  const before = traffic.filter(t => t.source_ip === rule.source_ip && t.decision === 'allowed' && new Date(t.created_at) <= new Date(rule.created_at)).sort((a, b) => b.id - a.id)[0]
  return <div className="ruleDetail">
    <h3 className="big">{ruleId(rule.id)}</h3>
    <dl className="grid2">
      <div><dt>Source IP</dt><dd className="mono">{rule.source_ip}</dd></div>
      <div><dt>Incident</dt><dd>{incident ? <a href={`#/incident/${incident}`}>{incId(incident)}</a> : '—'}</dd></div>
      <div><dt>Created</dt><dd className="mono">{fmtTime(rule.created_at)}</dd></div>
      <div><dt>Expires at</dt><dd className="mono">{fmtExpiry(rule)}</dd></div>
    </dl>
    {on && isPermanentRule(rule) ? <p className="muted small">กฎนี้ไม่หมดอายุเอง ปลดได้ด้วยปุ่ม Unblock ด้านล่าง</p>
      : on ? <div className="ttl"><div className="ttlHead"><span>เวลาที่เหลือ</span><b>{remaining(rule, now)}</b></div><div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left / total * 100)}><span style={{ width: `${(left / total) * 100}%` }} /></div></div>
      : <p className="muted small">Rule expired or was removed at {fmtTime(rule.expires_at)}.</p>}
    {on && (confirming
      ? <div className="confirm block"><span>ปลดบล็อก {rule.source_ip}?</span><button className="btn danger sm" disabled={busy} onClick={unblock}>Confirm</button><button className="btn ghost sm" onClick={cancel}>Cancel</button></div>
      : <button className="btn ghost block" disabled={busy} onClick={onRemove}><Icon name="trash" />Remove rule</button>)}
    <h3 className="sub"><Icon name="terminal" />New-request verification</h3>
    <div className="beforeAfter compact">
      <div className={`reqCard ${before ? 'good' : 'muted'}`}><small>Before <em>(no rule)</em></small><b>{before ? 'Allowed' : 'No request'}</b>{before && <span className="mono small">{fmtTime(before.created_at)}</span>}</div>
      <div className={`reqCard ${proof ? 'bad' : 'muted'}`}><small>After <em>(with rule)</em></small><b>{proof ? 'HTTP 403 Denied' : on ? 'Awaiting request' : 'Not verified'}</b>{proof && <span className="mono small">{fmtTime(proof.created_at)}</span>}</div>
    </div>
    {proof && <p className="mint small"><Icon name="ok" size={14} /> A new request confirmed this rule.</p>}
  </div>
}
