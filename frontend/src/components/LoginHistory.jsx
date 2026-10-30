import React, { useEffect, useState } from 'react'
import { getJson } from '../api.js'
import { isReplayIp } from '../ui.jsx'

const PAGE_SIZE = 50
const authEvents = rows => rows.filter(row => row.event_type === 'HTTP_AUTH')

function mergeEvents(previous, incoming) {
  const byId = new Map(previous.map(row => [row.id, row]))
  for (const row of incoming) byId.set(row.id, row)
  return [...byId.values()].sort((a, b) => b.id - a.id)
}

export default function LoginHistory({ events }) {
  const [history, setHistory] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getJson(`/api/events?event_type=HTTP_AUTH&limit=${PAGE_SIZE}`)
      .then(rows => { if (!cancelled) { setHistory(current => mergeEvents(current, rows)); setHasMore(rows.length === PAGE_SIZE) } })
      .catch(() => { if (!cancelled) setError('โหลดประวัติการล็อกอินไม่ได้') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const incoming = authEvents(events)
    if (incoming.length) setHistory(current => incoming.some(row => !current.some(saved => saved.id === row.id)) ? mergeEvents(current, incoming) : current)
  }, [events])

  async function loadOlder() {
    const oldestId = history.at(-1)?.id
    if (!oldestId || loading) return
    setLoading(true)
    setError('')
    try {
      const rows = await getJson(`/api/events?event_type=HTTP_AUTH&limit=${PAGE_SIZE}&before_id=${oldestId}`)
      setHistory(current => mergeEvents(current, rows))
      setHasMore(rows.length === PAGE_SIZE)
    } catch {
      setError('โหลดประวัติก่อนหน้าไม่ได้')
    } finally {
      setLoading(false)
    }
  }

  return <div className="loginHistory">
    <p className="scopeNote">หนึ่งแถวต่อหนึ่งครั้งที่ล็อกอิน แม้เป็น IP เดิม · เรียงใหม่ไปเก่า · บันทึกไว้ใน SENTINEL</p>
    {history.length ? <div className="tableWrap loginHistoryScroll" tabIndex={0} role="region" aria-label="ประวัติล็อกอิน เลื่อนเพื่อดูรายการถัดไป"><table><thead><tr><th>เวลา</th><th>IP ต้นทาง</th><th>ผลล็อกอิน</th><th>แหล่งข้อมูล</th></tr></thead><tbody>{history.map(row => <tr key={row.id}>
      <td><time dateTime={row.timestamp}>{new Date(row.timestamp).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'medium', hour12: false })}</time></td>
      <td className="mono">{row.source_ip}</td>
      <td><span className={`badge ${row.outcome === 'success' ? 'good' : 'bad'}`}>{row.outcome === 'success' ? 'สำเร็จ' : 'ไม่สำเร็จ'}</span></td>
      <td>{isReplayIp(row.source_ip) || row.label !== 'unknown' ? 'ไม่ได้ยืนยันแหล่งข้อมูล' : 'rod-mai-rod'}</td>
    </tr>)}</tbody></table></div> : <p className="loginHistoryEmpty">{loading ? 'กำลังโหลดประวัติ…' : 'ยังไม่มีการล็อกอินที่บันทึกไว้'}</p>}
    <div className="loginHistoryFooter"><span>โหลดแล้ว {history.length} รายการ · เลื่อนในตารางเพื่อดูเพิ่มเติม</span>{hasMore && <button className="btn ghost sm" onClick={loadOlder} disabled={loading}>{loading ? 'กำลังโหลด…' : 'โหลดประวัติก่อนหน้า'}</button>}</div>
    {error && <p className="coral" role="alert">{error}</p>}
  </div>
}
